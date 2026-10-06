import assert from 'node:assert/strict';

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

const page = await fetch(base, { redirect: 'error', signal: AbortSignal.timeout(5000) });
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /Remain/);
assert.match(html, /TEST_FIXTURE|synthetic/i);

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
  checks: ['health', 'static-page', 'planning-rehearsal', 'execution-endpoints-absent']
}, null, 2));
