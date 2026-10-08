import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { solveCash } from '../src/planning/solver.ts';
import type { PlanningQuote, QuoteProvider, QuoteRequest } from '../src/planning/model.ts';
import { clock, fast, intent, quote } from './planning-fixtures.ts';

test('whole deadline ends a stuck spacing wait without another provider request', async () => {
  let calls = 0;
  const result = await Promise.race([
    solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { calls++; return [quote(q)]; } }, {
      ...fast, minSpacingMs: 200, maxDurationMs: 30, sleep: () => new Promise(() => {})
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 200))
  ]);
  assert.ok(result, 'search must terminate while its spacing promise remains pending');
  assert.equal(calls, 1);
  assert.ok(result.searchStopReasons.includes('SEARCH_TIME_BUDGET'));
  assert.equal(result.executionEnabled, false);
});

test('cancellation interrupts a spacing promise which ignores cancellation', async () => {
  const controller = new AbortController(); let calls = 0;
  const result = await Promise.race([
    solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { calls++; return [quote(q)]; } }, {
      ...fast, minSpacingMs: 200, maxDurationMs: 60, signal: controller.signal,
      sleep: () => { controller.abort(); return new Promise(() => {}); }
    }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 200))
  ]);
  assert.ok(result);
  assert.equal(calls, 1); assert.equal(result.candidate, undefined);
  assert.ok(result.reasons.includes('CANCELLED'));
});

test('clock rollback above the initial time still invalidates every candidate', async () => {
  // The fourth observation finishes request one. The fifth starts request two
  // after the clock retreats, but never below the initial search time.
  let reads = 0; let calls = 0;
  const times = [clock, clock, clock, clock + 100, clock + 50];
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { calls++; return [quote(q)]; } }, {
    ...fast, maxRequests: 2, now: () => times[reads++] ?? clock + 50
  });
  assert.equal(calls, 1); assert.equal(result.candidate, undefined);
  assert.ok(result.reasons.includes('CLOCK_REGRESSION'));
});

test('final rollback above search start invalidates the previously passing candidate', async () => {
  let reads = 0;
  const times = [clock, clock, clock, clock + 100, clock + 50];
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { return [quote(q)]; } }, {
    ...fast, maxRequests: 1, now: () => times[reads++] ?? clock + 50
  });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.candidate, undefined);
  assert.ok(result.reasons.includes('CLOCK_REGRESSION'));
});

test('quote list accessors and custom iterators are rejected without invoking them', async () => {
  for (const kind of ['accessor', 'iterator']) {
    let invoked = 0;
    const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) {
      const routes = [quote(q)];
      if (kind === 'accessor') Object.defineProperty(routes, '0', { enumerable: true, get() { invoked++; return quote(q); } });
      else Object.defineProperty(routes, Symbol.iterator, { value: function* () { invoked++; yield quote(q); } });
      return routes;
    } }, { ...fast, maxRequests: 1 });
    assert.equal(invoked, 0, kind);
    assert.deepEqual(result.reasons, ['INVALID_QUOTE']); assert.equal(result.candidate, undefined);
  }
});

test('ambiguous duplicate venue and quote identities invalidate the entire batch', async () => {
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) {
    return [quote(q), quote(q, { inputFeeRaw: '1' })];
  } }, { ...fast, maxRequests: 1 });
  assert.deepEqual(result.reasons, ['INVALID_QUOTE']); assert.equal(result.candidate, undefined);
});

test('malformed quote arrays cannot admit an otherwise safe route', async () => {
  const variants: ((q: QuoteRequest) => unknown[])[] = [
    (q) => { const a = [quote(q)]; a.length = 2; return a; },
    (q) => Object.assign([quote(q)], { extra: 'private-provider-value' }),
    (q) => Object.setPrototypeOf([quote(q)], Object.create(Array.prototype)),
    (q) => { const a = [quote(q)]; Object.defineProperty(a, '0', { enumerable: false }); return a; }
  ];
  for (const make of variants) {
    const provider: QuoteProvider = { mode: 'TEST_FIXTURE', async quote(q) { return make(q); } };
    const result = await solveCash(intent(), provider, { ...fast, maxRequests: 1 });
    assert.deepEqual(result.reasons, ['INVALID_QUOTE']); assert.equal(result.candidate, undefined);
    assert.equal(JSON.stringify(result).includes('private-provider-value'), false);
  }
});

test('whole deadline aborts an in-flight provider and ignores a late response', async () => {
  let signal: AbortSignal | undefined; let release: (() => void) | undefined;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q, s) {
    signal = s; return new Promise((resolve) => { release = () => resolve([quote(q)]); });
  } }, { ...fast, maxDurationMs: 30, requestTimeoutMs: 1000 });
  assert.equal(signal?.aborted, true); assert.equal(result.candidate, undefined);
  assert.ok(result.searchStopReasons.includes('SEARCH_TIME_BUDGET'));
  assert.equal(result.attempts[0]?.errorCode, 'SEARCH_TIME_BUDGET');
  assert.equal(result.attempts[0]?.quoteCount, null);
  const before = JSON.stringify(result);
  release!(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.stringify(result), before);
});

test('budget exhaustion preserves only earlier complete, freshly checked candidates', async () => {
  let calls = 0; let signal: AbortSignal | undefined;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q, s) {
    calls++; if (calls === 1) return [quote(q)];
    signal = s; return new Promise(() => {});
  } }, { ...fast, maxDurationMs: 30, requestTimeoutMs: 1000 });
  assert.equal(calls, 2); assert.equal(signal?.aborted, true);
  assert.equal(result.status, 'PLANNED_FOR_REVIEW');
  assert.equal(result.candidate?.quote.inputRaw, '30');
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.searchStopReasons, ['SEARCH_TIME_BUDGET']);
  assert.equal(result.attempts[0]?.status, 'COMPLETED');
  assert.equal(result.attempts[1]?.status, 'BLOCKED');
  assert.equal(result.searchedAllIntegerInputs, false);
});

test('cancellation on deadline discards earlier safe candidates', async () => {
  const controller = new AbortController(); let calls = 0;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q, signal) {
    if (++calls === 1) return [quote(q)];
    signal?.addEventListener('abort', () => controller.abort(), { once: true });
    return new Promise(() => {});
  } }, { ...fast, signal: controller.signal, maxDurationMs: 30, requestTimeoutMs: 1000 });
  assert.equal(result.candidate, undefined); assert.ok(result.reasons.includes('CANCELLED'));
});

test('quote admission detaches earlier observations from provider mutation', async () => {
  let first: PlanningQuote | undefined;
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) {
    if (!first) { first = quote(q); return [first]; }
    first.inputRaw = '1'; first.expectedGrossOutputRaw = '999';
    return [];
  } }, { ...fast, maxRequests: 2 });
  assert.equal(result.candidate?.quote.inputRaw, '30');
  assert.equal(result.candidate?.quote.expectedGrossOutputRaw, '30');
  assert.ok(Object.isFrozen(result.candidate!.quote));
});

test('a malformed later batch discards every earlier candidate without publishing partial admission', async () => {
  for (const fault of [{ id: 'invalid id' }, { id: 'different-route', wallet: '0x3333333333333333333333333333333333333333' }]) {
    let calls = 0;
    const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) {
      if (++calls === 1) return [quote(q)];
      return [quote(q), quote(q, fault)];
    } }, { ...fast, maxRequests: 2 });
    assert.equal(result.candidate, undefined); assert.deepEqual(result.reasons, ['INVALID_QUOTE']);
    assert.deepEqual(result.attempts[1]?.outcomes, []);
    assert.equal(result.attempts[1]?.quoteCount, null);
  }
});

test('valid frozen arrays, distinct venue identities and reused cross-request IDs remain supported', async () => {
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) {
    return Object.freeze([quote(q, { id: 'reused' }), quote(q, { id: 'reused', vendor: 'CowSwap' })]) as unknown as unknown[];
  } }, { ...fast, maxRequests: 2 });
  assert.equal(result.status, 'PLANNED_FOR_REVIEW'); assert.deepEqual(result.reasons, []);
  assert.ok(result.attempts.every((a) => a.quoteCount === 2 && a.status === 'COMPLETED'));
});

test('all sixteen distinct routes are admitted and exact debit decides the winner', async () => {
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) {
    return Array.from({ length: 16 }, (_, index) => quote(q, { id: `route-${index}`, inputFeeRaw: String(index) }));
  } }, { ...fast, maxRequests: 1 });
  assert.equal(result.attempts[0]?.quoteCount, 16);
  assert.equal(result.candidate?.quote.id, 'route-0');
  assert.equal(result.executionEnabled, false);
});

test('scheduler failure is redacted and invalidates a previous safe candidate', async () => {
  const result = await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { return [quote(q)]; } }, {
    ...fast, minSpacingMs: 200, sleep: async () => { throw new Error('private-scheduler-detail'); }
  });
  assert.equal(result.candidate, undefined); assert.deepEqual(result.reasons, ['PROVIDER_FAILURE']);
  assert.equal(result.attempts.length, 1);
  assert.equal(JSON.stringify(result).includes('private-scheduler-detail'), false);
});

test('external abort listeners are cleaned up on success, failure and deadline', async () => {
  const controller = new AbortController(); const baseline = getEventListeners(controller.signal, 'abort').length;
  for (const kind of ['success', 'failure', 'deadline']) {
    await solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) {
      if (kind === 'failure') throw new Error('redacted');
      if (kind === 'deadline') return new Promise(() => {});
      return [quote(q)];
    } }, { ...fast, signal: controller.signal, maxRequests: 1, maxDurationMs: 30, requestTimeoutMs: 1000 });
    assert.equal(getEventListeners(controller.signal, 'abort').length, baseline, kind);
  }
});

test('default spacing delay stops on cancellation and leaves no subsequent request', async () => {
  const controller = new AbortController(); let calls = 0;
  const task = solveCash(intent(), { mode: 'TEST_FIXTURE', async quote(q) { calls++; return [quote(q)]; } }, {
    ...fast, signal: controller.signal, minSpacingMs: 200, maxDurationMs: 1000
  });
  const timer = setTimeout(() => controller.abort(), 20);
  try {
    const result = await task;
    assert.equal(calls, 1); assert.equal(result.candidate, undefined);
    assert.ok(result.reasons.includes('CANCELLED'));
  } finally { clearTimeout(timer); }
});

test('a forward wall-clock jump cannot skip live-provider request spacing', async () => {
  let wall = clock; const starts: number[] = [];
  await solveCash(intent(), { mode: 'LIVE_READ_ONLY', async quote(q) {
    starts.push(performance.now()); wall += 1000; return [quote(q)];
  } }, { now: () => wall, minSpacingMs: 200, maxRequests: 2, maxDurationMs: 5000 });
  assert.equal(starts.length, 2);
  assert.ok(starts[1]! - starts[0]! >= 190, 'wall-clock jumps must not erase the 200ms spacing wait');
});
