import assert from 'node:assert/strict';
import { inspectFixtureReceipt } from '../src/receipts/inspection.ts';

function baseUrl(value: string | undefined): URL {
  if (!value) throw new Error('REMAIN_BASE_URL_MISSING');
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('REMAIN_BASE_URL_INVALID');
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if ((!local && url.protocol !== 'https:') || (local && !['http:', 'https:'].includes(url.protocol))) throw new Error('REMAIN_BASE_URL_INSECURE');
  return url;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') ?? '';
  assert.match(contentType, /^application\/json(?:;|$)/i);
  return await response.json() as Record<string, unknown>;
}

const base = baseUrl(process.env.REMAIN_BASE_URL);
const health = await fetch(new URL('/healthz', base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(health.status, 200);
assert.equal(health.headers.get('cache-control'), 'no-store');
assert.deepEqual(Object.keys(await health.clone().json()).sort(), ['buildSha', 'executionEnabled', 'liveGate', 'mode', 'service', 'status'].sort());
const healthBody = await readJson(health);
assert.equal(healthBody.status, 'ok');
assert.equal(healthBody.service, 'remain-rehearsal');
assert.equal(healthBody.mode, 'TEST_FIXTURE');
assert.equal(healthBody.executionEnabled, false);
assert.equal(healthBody.liveGate, 'BLOCKED');
assert.match(String(healthBody.buildSha), /^[a-f0-9]{40}$/);
if (process.env.REMAIN_EXPECTED_BUILD_SHA) assert.equal(healthBody.buildSha, process.env.REMAIN_EXPECTED_BUILD_SHA);

const page = await fetch(base, { redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /Remain/);
assert.match(html, /TEST_FIXTURE|synthetic/i);
const browserResponse = await fetch(new URL('/response.js', base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(browserResponse.status, 200);
assert.match(browserResponse.headers.get('content-type') ?? '', /(?:java|ecma)script/);
assert.match(await browserResponse.text(), /export function validatePlanningRecord/);
for (const file of ['live.js', 'wallet.js', 'position.js', 'preview.js']) {
  const response = await fetch(new URL('/' + file, base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type') ?? '', /(?:java|ecma)script/);
}
const readiness = await fetch(new URL('/api/live/status', base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(readiness.status, 200);
assert.deepEqual(await readJson(readiness), { kind: 'REMAIN_INTEGRATION_READINESS', mode: 'READ_ONLY_SETUP', inspectionAvailable: false, deployment: 'NOT_CONFIGURED', executionEnabled: false, liveGate: 'UNVERIFIED', signatureSemantics: 'UNVERIFIED' });
const inspect = await fetch(new URL('/api/live/inspect', base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(inspect.status, 503); assert.deepEqual(await readJson(inspect), { code: 'LOCAL_SETUP_REQUIRED' });
const position = await fetch(new URL('/api/live/position', base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(position.status, 503); assert.deepEqual(await readJson(position), { code: 'LOCAL_SETUP_REQUIRED' });
const preview = await fetch(new URL('/api/live/preview', base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(preview.status, 503); assert.deepEqual(await readJson(preview), { code: 'LOCAL_SETUP_REQUIRED' });

const input = { cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false };
const planResponse = await fetch(new URL('/api/rehearse', base), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
  redirect: 'error',
  signal: AbortSignal.timeout(5000)
});
assert.equal(planResponse.status, 200);
const plan = await readJson(planResponse);
assert.equal(plan.mode, 'TEST_FIXTURE');
assert.equal(plan.executionEnabled, false);
const result = plan.plan as { status: string; candidate?: { quote: { inputRaw: string }; verdict: { amounts: { remainingStockRaw: string; minimumNetCashRaw: string } } } };
assert.equal(result.status, 'PLANNED_FOR_REVIEW');
assert.equal(result.candidate?.quote.inputRaw, '25');
assert.equal(result.candidate?.verdict.amounts.remainingStockRaw, '75');
assert.equal(result.candidate?.verdict.amounts.minimumNetCashRaw, '25000000000000000000');

for (const [extra, expectedStatus] of [[{ executionEnabled: true }, 400], [{ market: 'pause' }, 200]] as const) {
  const response = await fetch(new URL('/api/rehearse', base), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, ...extra }), redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, expectedStatus);
  if (expectedStatus === 200) {
    const value = await readJson(response); assert.equal(value.executionEnabled, false);
    assert.equal((value.plan as { status: string }).status, 'BLOCKED');
  }
}

for (const body of [
  JSON.stringify(input).replace('"cashTarget":"25"', '"cashTarget":"99","cashTarget":"25"'),
  JSON.stringify(input).replace('"retainPercent":70', '"retainPercent":0,"\\u0072etainPercent":70'),
  JSON.stringify({ ...input, market: ['regular'] })
]) {
  const response = await fetch(new URL('/api/rehearse', base), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body, redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 400); assert.deepEqual(await readJson(response), { code: 'INVALID_REQUEST' });
}

const sampleResponse = await fetch(new URL('/demo-receipt.json', base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(sampleResponse.status, 200);
const sample = await sampleResponse.text();
assert.equal(inspectFixtureReceipt(sample).status, 'CONSISTENT_FIXTURE');
for (const [body, expected] of [[sample, 'CONSISTENT_FIXTURE'],
  [sample.replace('"stockRemainingRaw":"75"', '"stockRemainingRaw":"74"'), 'INVALID_RECEIPT'],
  ['{"mode":"TEST_FIXTURE","mode":"LIVE"}', 'INVALID_RECEIPT']] as const) {
  const response = await fetch(new URL('/api/receipt/verify', base), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body, redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), null);
  const checked = await readJson(response); assert.equal(checked.status, expected);
  assert.equal(checked.source, 'UNAUTHENTICATED'); assert.equal(checked.executionEnabled, false);
  if (expected === 'INVALID_RECEIPT') assert.equal(checked.facts, null);
}
const oversized = await fetch(new URL('/api/receipt/verify', base), { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: ' '.repeat(262145), redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(oversized.status, 413);

for (const path of ['/api/submit', '/api/sign', '/api/order']) {
  const response = await fetch(new URL(path, base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 404);
}

console.log(JSON.stringify({
  status: 'PASS',
  mode: 'TEST_FIXTURE',
  executionEnabled: false,
  liveGate: 'BLOCKED',
  baseOrigin: base.origin,
  buildSha: healthBody.buildSha,
  checks: ['health-build', 'static-page', 'browser-response-module', 'integration-modules', 'public-inspector-locked', 'planning-accounting', 'paused-market-guard', 'invalid-input', 'planner-duplicate-fields', 'planner-enum-coercion', 'receipt-replay', 'receipt-tampering', 'receipt-duplicate-fields', 'receipt-size-limit', 'execution-endpoints-absent']
}, null, 2));
