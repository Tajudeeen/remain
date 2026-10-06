import test from 'node:test';
import assert from 'node:assert/strict';
import { recheckPlan, solveCash } from '../src/planning/solver.ts';
import { bellGuard } from '../src/planning/bellguard.ts';
import { PlanningError, type QuoteProvider } from '../src/planning/model.ts';
import { RemainError } from '../src/errors.ts';
import { intent, quote, clock, fast } from './planning-fixtures.ts';

const linear: QuoteProvider = { mode: 'TEST_FIXTURE', async quote(request) { return [quote(request)]; } };
test('cash target selects the smallest observed total debit and preserves floor', async () => {
  const result = await solveCash(intent(), linear, { ...fast, maxRequests: 32 });
  assert.equal(result.status, 'PLANNED_FOR_REVIEW');
  assert.equal(result.candidate?.quote.inputRaw, '20');
  assert.equal(result.candidate?.verdict.amounts?.remainingStockRaw, '80');
  assert.equal(result.executionEnabled, false); assert.equal(result.mode, 'TEST_FIXTURE');
  assert.equal(result.optimality, 'SMALLEST_SAFE_OBSERVED_DEBIT');
  assert.equal(result.planHash.length, 64); assert.equal(result.searchedAllIntegerInputs, true);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.candidate!.quote));
});
test('unreachable target yields no candidate', async () => {
  const result = await solveCash(intent({ cashTargetRaw: '31' }), linear, { ...fast, maxRequests: 32 });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.candidate, undefined);
  assert.ok(result.reasons.includes('NO_SAFE_QUOTE_IN_SEARCH'));
});
test('small-domain nonmonotonic quotes match independent exhaustive oracle', async () => {
  for (let seed = 1; seed <= 50; seed++) {
    const outputs = Array.from({ length: 18 }, (_, index) => BigInt((seed * 17 + index * index * 7) % 40 + 1));
    const target = BigInt(seed % 25 + 1);
    const fees = outputs.map((_, index) => BigInt((index + seed) % 3));
    const request = intent({ stockBalanceRaw: '20', retainBps: 1000, cashTargetRaw: target.toString(), maxExpectedSurplusRaw: '100' });
    const provider: QuoteProvider = { mode: 'TEST_FIXTURE', async quote(q) {
      const index = Number(BigInt(q.inputRaw) - 1n);
      return [quote(q, { expectedGrossOutputRaw: outputs[index]!.toString(), minimumGrossOutputRaw: outputs[index]!.toString(), inputFeeRaw: fees[index]!.toString() })];
    } };
    // Oracle implements target/floor/debit comparisons independently of the solver.
    const oracle = outputs.map((output, i) => ({ input: BigInt(i + 1), fee: fees[i]!, output })).filter((v) => v.output >= target && v.input + v.fee <= 18n).sort((a, b) => {
      const difference = a.input + a.fee - b.input - b.fee;
      return difference === 0n ? Number(a.input - b.input) : Number(difference);
    })[0];
    const result = await solveCash(request, provider, { ...fast, maxRequests: 20 });
    assert.equal(result.candidate?.quote.inputRaw, oracle?.input.toString(), `seed ${seed}`);
    assert.equal(result.searchedAllIntegerInputs, true);
  }
});
test('large-domain search keeps exact quantities and bounds network work', async () => {
  const observed: bigint[] = [];
  const huge = (1n << 160n).toString();
  const result = await solveCash(intent({ stockBalanceRaw: huge, cashTargetRaw: '100', maxExpectedSurplusRaw: huge }), {
    mode: 'TEST_FIXTURE', async quote(q) { observed.push(BigInt(q.inputRaw)); return [quote(q)]; }
  }, { ...fast, maxRequests: 12 });
  assert.ok(observed.length <= 12); assert.equal(new Set(observed).size, observed.length);
  assert.equal(result.searchedAllIntegerInputs, false);
  assert.ok(result.candidate); assert.equal(result.executionEnabled, false);
});
test('lower input with high stock fee loses to a smaller total debit', async () => {
  const result = await solveCash(intent({ stockBalanceRaw: '1000', retainBps: 0, cashTargetRaw: '1', maxExpectedSurplusRaw: '1' }), {
    mode: 'TEST_FIXTURE', async quote(q) {
      return [quote(q, { expectedGrossOutputRaw: '1', minimumGrossOutputRaw: '1', inputFeeRaw: q.inputRaw === '1' ? '200' : '0' })];
    }
  }, { ...fast, maxRequests: 32 });
  const selected = BigInt(result.candidate!.verdict.amounts!.totalStockDebitRaw);
  assert.equal(result.candidate?.quote.inputRaw, '2');
  assert.ok(selected < 201n);
  assert.equal(selected, result.attempts.flatMap((a) => a.outcomes).filter((o) => o.verdict.status === 'PASS_FOR_PLANNING').reduce((n, o) => BigInt(o.verdict.amounts!.totalStockDebitRaw) < n ? BigInt(o.verdict.amounts!.totalStockDebitRaw) : n, 1000n));
});
test('unverified minimum output cannot produce a passing plan', async () => {
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { return [quote(q, { minimumOutputBinding: 'UNVERIFIED' })]; } }, { ...fast, maxRequests: 4 });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.candidate, undefined);
});
test('unsafe intent is rejected before requesting quotes', async () => {
  let calls = 0;
  const result = await solveCash(intent({ retainBps: 10000 }), { mode: 'TEST_FIXTURE', async quote() { calls++; return []; } }, fast);
  assert.equal(calls, 0); assert.ok(result.reasons.includes('FLOOR_BREACH'));
  await assert.rejects(solveCash({}, linear, fast), (e) => e instanceof PlanningError && e.code === 'INVALID_INTENT');
});
test('provider failure after a safe candidate invalidates the plan without leaking errors', async () => {
  let calls = 0;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) {
    if (++calls > 1) throw new Error('private-provider-payload');
    return [quote(q)];
  } }, { ...fast, maxRequests: 4 });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.candidate, undefined); assert.equal(calls, 2);
  assert.equal(result.attempts.length, 2); assert.equal(result.attempts[1]?.status, 'BLOCKED');
  assert.equal(result.attempts[1]?.errorCode, 'PROVIDER_FAILURE'); assert.equal(result.attempts[1]?.quoteCount, null);
  assert.equal(JSON.stringify(result).includes('private-provider-payload'), false);
});
test('compliance errors stop planning without retry', async () => {
  let calls = 0;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote() { calls++; throw new RemainError('ACCESS_COMPLIANCE_RESTRICTED', 40304); } }, fast);
  assert.equal(calls, 1); assert.deepEqual(result.reasons, ['ACCESS_COMPLIANCE_RESTRICTED']);
});
test('request timeout aborts provider and leaves no plan', async () => {
  let signal: AbortSignal | undefined;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(_q, s) { signal = s; return new Promise(() => {}); } }, { ...fast, requestTimeoutMs: 5 });
  assert.equal(signal?.aborted, true); assert.ok(result.reasons.includes('PROVIDER_TIMEOUT')); assert.equal(result.candidate, undefined);
});
test('cancellation before requesting quotes and during a request stops safely', async () => {
  const before = new AbortController(); before.abort(); let calls = 0;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote() { calls++; return []; } }, { ...fast, signal: before.signal });
  assert.equal(calls, 0); assert.ok(result.reasons.includes('CANCELLED'));
  const during = new AbortController();
  const inFlight = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote() { during.abort(); return new Promise(() => {}); } }, { ...fast, signal: during.signal });
  assert.ok(inFlight.reasons.includes('CANCELLED'));
});
test('mismatched quote and oversized quote sets fail closed', async () => {
  for (const provider of [
    { mode: 'TEST_FIXTURE' as const, async quote(q: Parameters<QuoteProvider['quote']>[0]) { return [quote(q, { inputRaw: '999' })]; } },
    { mode: 'TEST_FIXTURE' as const, async quote(q: Parameters<QuoteProvider['quote']>[0]) { return Array.from({ length: 17 }, () => quote(q)); } }
  ]) {
    const r = await solveCash(intent(), provider, fast); assert.deepEqual(r.reasons, ['INVALID_QUOTE']); assert.equal(r.candidate, undefined);
  }
});
test('changed caller intent cannot lower policy after the first quote', async () => {
  const request = intent();
  const result = await solveCash(request, { mode: 'TEST_FIXTURE', async quote(q) {
    request.retainBps = 0; request.cashTargetRaw = '1'; request.market.reasonCode = 'ASSET_PAUSED';
    return [quote(q)];
  } }, { ...fast, maxRequests: 32 });
  assert.equal(result.candidate?.quote.inputRaw, '20');
  assert.equal(result.candidate?.verdict.amounts?.retainedFloorRaw, '70');
});
test('expired candidates are rechecked at result time', async () => {
  let time = clock;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { time += 1000; return [quote(q, { expiresAtMs: clock + 5001 })]; } }, { now: () => time, minSpacingMs: 0, maxRequests: 4 });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.candidate, undefined);
});
test('whole-search time limit returns only freshly passing observed candidates', async () => {
  let time = clock;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { time += 2; return [quote(q)]; } }, { now: () => time, minSpacingMs: 0, maxDurationMs: 1 });
  assert.equal(result.attempts.length, 1); assert.ok(result.searchStopReasons.includes('SEARCH_TIME_BUDGET'));
  if (result.candidate) assert.equal(bellGuard(intent(), result.candidate.quote, result.candidate.quote.inputRaw, time).status, 'PASS_FOR_PLANNING');
});
test('clock regressions block and live request spacing cannot be disabled', async () => {
  let time = clock;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { time--; return [quote(q)]; } }, { now: () => time, minSpacingMs: 0 });
  assert.equal(result.status, 'BLOCKED');
  await assert.rejects(solveCash(intent(), { ...linear, mode: 'LIVE_READ_ONLY' }, fast), (e) => e instanceof PlanningError && e.code === 'INVALID_OPTIONS');
});
test('clock regression on final evaluation invalidates a previously safe candidate', async () => {
  let reads = 0;
  const result = await solveCash(intent(), linear, { ...fast, maxRequests: 1, now: () => ++reads >= 5 ? clock - 1 : clock });
  assert.equal(result.status, 'BLOCKED'); assert.ok(result.reasons.includes('CLOCK_REGRESSION')); assert.equal(result.candidate, undefined);
});
test('live-labelled provider stays non-executable and requests are spaced', async () => {
  let time = clock; const starts: number[] = [];
  const result = await solveCash(intent(), { mode: 'LIVE_READ_ONLY', async quote(q) { starts.push(time); return [quote(q)]; } }, { now: () => time, sleep: async (ms) => { time += ms; }, minSpacingMs: 200, maxRequests: 4 });
  assert.equal(result.executionEnabled, false); assert.equal(result.mode, 'LIVE_READ_ONLY');
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i]! - starts[i - 1]! >= 200);
});
test('invalid solver budgets reject', async () => {
  for (const options of [{ maxRequests: 0 }, { maxRequests: 65 }, { maxDurationMs: 15001 }, { requestTimeoutMs: 0 }, { minSpacingMs: -1 }]) await assert.rejects(solveCash(intent(), linear, options), PlanningError);
});
test('same immutable inputs and observed quote sequence produce the same checksum', async () => {
  const a = await solveCash(intent(), linear, { ...fast, maxRequests: 4 });
  const b = await solveCash(intent(), linear, { ...fast, maxRequests: 4 });
  assert.equal(a.planHash, b.planHash);
});
test('plan checksum and time revalidation reject tampering and stale balances', async () => {
  const result = await solveCash(intent(), linear, { ...fast, maxRequests: 32 });
  assert.equal(recheckPlan(result, clock).status, 'PASS_FOR_PLANNING');
  assert.ok(recheckPlan(result, clock + 15001).reasons.includes('BALANCE_STALE'));
  const altered = JSON.parse(JSON.stringify(result)) as typeof result;
  altered.intent.retainBps = 0;
  assert.equal(recheckPlan(altered, clock).status, 'BLOCKED');
  assert.throws(() => { result.candidate!.quote.inputRaw = '1'; });
});
test('empty route responses record completed observations rather than invented quotes', async () => {
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote() { return []; } }, { ...fast, maxRequests: 3 });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.attempts.length, 3);
  assert.ok(result.attempts.every((a) => a.status === 'COMPLETED' && a.quoteCount === 0));
});
test('cancellation during spacing prevents the next provider call', async () => {
  const controller = new AbortController(); let calls = 0; let time = clock;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { calls++; return [quote(q)]; } }, {
    now: () => time, minSpacingMs: 200, signal: controller.signal, sleep: async (ms) => { time += ms; controller.abort(); }
  });
  assert.equal(calls, 1); assert.ok(result.reasons.includes('CANCELLED'));
});
