import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { rehearsePlan, validateRehearsalInput } from '../src/rehearsal/plan.ts';
import { createRehearsalServer } from '../src/rehearsal/server.ts';
import { digest } from '../src/validation.ts';

const valid = { cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false };
test('rehearsal uses the actual solver and preserves fixture identity and checksum', async () => {
  const result = await rehearsePlan(valid); const plan = result.plan;
  assert.equal(plan.status, 'PLANNED_FOR_REVIEW'); assert.equal(plan.candidate!.quote.inputRaw, '25');
  assert.equal(plan.candidate!.verdict.amounts!.remainingStockRaw, '75');
  assert.equal(plan.candidate!.verdict.amounts!.minimumNetCashRaw, '25000000000000000000');
  assert.equal(result.kind, 'SYNTHETIC_PLANNING_RECORD'); assert.equal(result.mode, 'TEST_FIXTURE');
  assert.equal(plan.mode, 'TEST_FIXTURE'); assert.equal(result.executionEnabled, false); assert.equal(plan.executionEnabled, false);
  const { planHash, ...body } = plan; assert.equal(planHash, digest(body));
  assert.equal(result.reviewUntilMs, plan.intent.balanceObservedAtMs + 15000);
});
test('rehearsal fractional cash target rounds stock input upward using integer math', async () => {
  const result = await rehearsePlan({ ...valid, cashTarget: '25.01' });
  assert.equal(result.plan.candidate!.quote.inputRaw, '26');
  assert.equal(result.plan.candidate!.verdict.amounts!.remainingStockRaw, '74');
});
test('cash outside the retained floor blocks with no selected candidate', async () => {
  const result = await rehearsePlan({ ...valid, cashTarget: '40' });
  assert.equal(result.plan.status, 'BLOCKED'); assert.equal(result.plan.candidate, undefined);
  assert.ok(result.plan.reasons.includes('NO_SAFE_QUOTE_IN_SEARCH'));
});
test('100 percent floor blocks without requesting any quotes', async () => {
  const result = await rehearsePlan({ ...valid, retainPercent: 100 });
  assert.equal(result.plan.status, 'BLOCKED'); assert.equal(result.plan.attempts.length, 0);
});
test('closed market requires permission while paused market always blocks', async () => {
  const closed = await rehearsePlan({ ...valid, market: 'closed' });
  assert.ok(closed.plan.reasons.includes('CLOSED_MARKET_PERMISSION_REQUIRED')); assert.equal(closed.plan.attempts.length, 0);
  const permitted = await rehearsePlan({ ...valid, market: 'closed', allowClosedMarket: true });
  assert.equal(permitted.plan.status, 'PLANNED_FOR_REVIEW'); assert.equal(permitted.executionEnabled, false);
  const paused = await rehearsePlan({ ...valid, market: 'pause', allowClosedMarket: true });
  assert.ok(paused.plan.reasons.includes('MARKET_BLOCKED')); assert.equal(paused.plan.attempts.length, 0);
});
test('the synthetic price impact cannot bypass a smaller cap', async () => {
  const result = await rehearsePlan({ ...valid, maxImpactPercent: '0.19' });
  assert.equal(result.plan.status, 'BLOCKED');
  assert.ok(result.plan.attempts.every((a) => a.outcomes.every((o) => o.verdict.reasons.includes('IMPACT_LIMIT'))));
});
test('cancelled rehearsal cannot select a candidate', async () => {
  const controller = new AbortController(); controller.abort(); const result = await rehearsePlan(valid, controller.signal);
  assert.equal(result.plan.status, 'BLOCKED'); assert.equal(result.plan.candidate, undefined);
});
const invalid: unknown[] = [null, [], {}, { ...valid, mode: 'LIVE_READ_ONLY' }, { ...valid, wallet: 'injected' }, { ...valid, executionEnabled: true },
  ...['0', '-1', '1e2', '01', '0.001', '10001', 'NaN', '<script>', '25.'].map((cashTarget) => ({ ...valid, cashTarget })),
  ...[-1, 101, 70.5, '70', NaN].map((retainPercent) => ({ ...valid, retainPercent })),
  ...['5.01', '-1', '0.001', '.5', '1e0', 'NaN'].map((maxImpactPercent) => ({ ...valid, maxImpactPercent })),
  { ...valid, market: 'unknown' }, { ...valid, allowClosedMarket: 'true' }];
for (const [index, value] of invalid.entries()) test(`strict rehearsal input rejects adversarial case ${index + 1}`, () => assert.throws(() => validateRehearsalInput(value), /INVALID_REQUEST/));

async function withServer(run: (base: string) => Promise<void>) {
  const server = createRehearsalServer(); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
test('HTTP rehearsal returns fixture result with restrictive headers', async () => withServer(async (base) => {
  const response = await fetch(`${base}/api/rehearse`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(valid) });
  assert.equal(response.status, 200); const result = await response.json() as Awaited<ReturnType<typeof rehearsePlan>>;
  assert.equal(result.plan.status, 'PLANNED_FOR_REVIEW'); assert.equal(result.executionEnabled, false);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.ok(response.headers.get('content-security-policy')!.includes("script-src 'self'"));
  assert.ok(!response.headers.has('access-control-allow-origin'));
}));
test('all UI assets serve and arbitrary filesystem and credential paths are absent', async () => withServer(async (base) => {
  for (const path of ['/', '/app.js', '/styles.css', '/logo.png']) assert.equal((await fetch(base + path)).status, 200);
  for (const path of ['/AGENTS.md', '/.env.local', '/src/signing.ts', '/%2e%2e/.env.local', '/api/submit', '/api/rehearse?mode=live']) assert.equal((await fetch(base + path)).status, 404);
  const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
}));
test('HTTP rejects wrong methods, content types, encoding, origin and DNS-rebinding hosts', async () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/api/rehearse`)).status, 405);
  assert.equal((await fetch(`${base}/api/rehearse`, { method: 'POST', body: '{}' })).status, 415);
  const options = { method: 'POST', body: JSON.stringify(valid), headers: { 'Content-Type': 'application/json' } };
  assert.equal((await fetch(`${base}/api/rehearse`, { ...options, headers: { ...options.headers, 'Content-Encoding': 'gzip' } })).status, 415);
  assert.equal((await fetch(`${base}/api/rehearse`, { ...options, headers: { ...options.headers, Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/rehearse`, { ...options, headers: { ...options.headers, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  await new Promise<void>((resolve, reject) => {
    const req = request(base, { headers: { Host: 'evil.example' } }, (response) => { assert.equal(response.statusCode, 403); response.resume(); response.on('end', resolve); });
    req.on('error', reject); req.end();
  });
}));
test('HTTP rejects malformed JSON, large bodies and client-selected live settings without reflecting them', async () => withServer(async (base) => {
  for (const body of ['{', JSON.stringify({ ...valid, executionEnabled: true, secret: 'DO-NOT-REFLECT' })]) {
    const response = await fetch(`${base}/api/rehearse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { code: 'INVALID_REQUEST' });
  }
  const response = await fetch(`${base}/api/rehearse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(4097) });
  assert.equal(response.status, 413);
}));
test('streaming body size is bounded even without content length', async () => withServer(async (base) => {
  await new Promise<void>((resolve, reject) => {
    const req = request(`${base}/api/rehearse`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, (response) => {
      assert.equal(response.statusCode, 413); response.resume(); response.on('end', resolve);
    });
    req.on('error', reject); req.write('x'.repeat(3000)); req.end('x'.repeat(2000));
  });
}));
test('rehearsal budget returns 429 rather than allocating unbounded work', async () => withServer(async (base) => {
  for (let n = 0; n < 30; n++) {
    const response = await fetch(`${base}/api/rehearse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 400);
  }
  const response = await fetch(`${base}/api/rehearse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
}));
test('browser asset has no credentials, external requests or wallet execution capability', async () => {
  const source = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /BINANCE_WEB3_|window\.ethereum|eth_sign|eth_send|https?:\/\//);
  assert.match(source, /TEST_FIXTURE/); assert.match(source, /current !== version/);
});
