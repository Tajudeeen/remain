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
for (const file of ['live.js', 'wallet.js', 'wallet-providers.js', 'wallet-ui.js', 'position.js', 'preview.js', 'order-review.js', 'trade.js', 'onchain.js', 'balance-evidence.js', 'balance-evidence-ui.js', 'portfolio.js', 'catalog.js', 'service-status.js']) {
  const response = await fetch(new URL('/' + file, base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type') ?? '', /(?:java|ecma)script/);
}
const readiness = await fetch(new URL('/api/live/status', base), { redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(readiness.status, 200);
const market = await readJson(readiness);
assert.deepEqual(Object.keys(market).sort(), ['kind','mode','inspectionAvailable','deployment','executionEnabled','liveGate','signatureSemantics'].sort());
assert.equal(market.kind,'REMAIN_INTEGRATION_READINESS');
assert.equal(market.mode,'READ_ONLY_SETUP');
assert.equal(market.executionEnabled,false);
assert.equal(market.liveGate,'UNVERIFIED');
assert.equal(market.signatureSemantics,'UNVERIFIED');
assert.equal(typeof market.inspectionAvailable,'boolean');
const marketConfigured=market.inspectionAvailable===true;
assert.ok(marketConfigured?['LOCAL_ONLY','HOSTED_READ_ONLY'].includes(String(market.deployment)):market.deployment==='NOT_CONFIGURED');
if(process.env.REMAIN_REQUIRE_HOSTED_READ_ONLY==='true')
  assert.ok(marketConfigured && market.deployment==='HOSTED_READ_ONLY','HOSTED_READ_ONLY_NOT_ENABLED');
for(const route of ['inspect','position','preview','review']){
  const endpoint=new URL('/api/live/'+route,base);
  // No wallet data is supplied. An unconfigured service must block with 503,
  // while a configured server must reject incorrect methods without any vendor call.
  const actual=await fetch(endpoint,{method:marketConfigured?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(5000)});
  assert.equal(actual.status,marketConfigured?405:503);
  assert.deepEqual(await readJson(actual),{code:marketConfigured?'METHOD_REJECTED':'LOCAL_SETUP_REQUIRED'});
}
const catalog=await fetch(new URL('/api/live/catalog',base),{method:marketConfigured?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(5000)});
// The container's localhost-only API intentionally has no catalog route;
 // the hosted Netlify function exposes the provider catalog when configured.
if(market.deployment==='LOCAL_ONLY'||base.hostname==='localhost'||base.hostname==='127.0.0.1'){
  assert.equal(catalog.status,404);
  assert.deepEqual(await readJson(catalog),{code:'NOT_FOUND'});
}else{
  assert.equal(catalog.status,marketConfigured?405:503);
  assert.deepEqual(await readJson(catalog),{code:marketConfigured?'METHOD_REJECTED':'LOCAL_SETUP_REQUIRED'});
}
const executionStatus=await fetch(new URL('/api/execution/status',base),{redirect:'error',signal:AbortSignal.timeout(5000)});
assert.equal(executionStatus.status,200);
const execution=await readJson(executionStatus);
assert.deepEqual(Object.keys(execution).sort(),['kind','available','profile','userConfirmationRequired'].sort());
assert.equal(execution.kind,'REMAIN_EXECUTION_STATUS');
assert.equal(typeof execution.available,'boolean');
assert.equal(execution.profile,'COW_BSC_SELL_V1');
assert.equal(execution.userConfirmationRequired,true);
const executionConfigured=execution.available===true;
if(process.env.REMAIN_REQUIRE_EXECUTION==='true')assert.equal(executionConfigured,true,'EXECUTION_NOT_ENABLED');
for(const action of ['challenge','login','prepare','sign','submit','recover','invalidate']){
  const checked=await fetch(new URL('/api/execution/'+action,base),
    {method:executionConfigured?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(5000)});
  assert.equal(checked.status,executionConfigured?405:503);
  assert.deepEqual(await readJson(checked),{code:executionConfigured?'METHOD_REJECTED':'EXECUTION_SETUP_REQUIRED'});
}

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
  marketService: marketConfigured?'CONFIGURED_NOT_VERIFIED':'NOT_CONFIGURED',
  executionService: executionConfigured?'CONFIGURED_NOT_SETTLED':'NOT_CONFIGURED',
  checks: ['health-build', 'static-page', 'browser-response-module', 'integration-modules', 'public-inspector-locked', 'planning-accounting', 'paused-market-guard', 'invalid-input', 'planner-duplicate-fields', 'planner-enum-coercion', 'receipt-replay', 'receipt-tampering', 'receipt-duplicate-fields', 'receipt-size-limit', 'execution-endpoints-absent']
}, null, 2));
