import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
import { config } from '../netlify/functions/fixture.ts';

const origin = 'https://remain-fixture.netlify.app';
const options = { origins: [origin], buildSha: 'a'.repeat(40) };
const input = { cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false };
function request(path = '/api/rehearse', body = JSON.stringify(input), headers: Record<string, string> = {}) {
  return new Request(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
}

test('Netlify deployment preserves health, fixture planning and guard behavior', async () => {
  const health = await handleNetlifyFixture(new Request(origin + '/healthz'), options);
  assert.equal(health.status, 200); assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { status: 'ok', service: 'remain-rehearsal', mode: 'TEST_FIXTURE', executionEnabled: false, liveGate: 'BLOCKED', buildSha: options.buildSha });
  assert.equal(await (await handleNetlifyFixture(new Request(origin + '/healthz', { method: 'HEAD' }), options)).text(), '');
  const passed = await handleNetlifyFixture(request(), options); assert.equal(passed.status, 200);
  const p = await passed.json(); assert.equal(p.mode, 'TEST_FIXTURE'); assert.equal(p.executionEnabled, false);
  assert.equal(p.plan.status, 'PLANNED_FOR_REVIEW'); assert.equal(p.plan.candidate.quote.inputRaw, '25');
  assert.equal(p.plan.candidate.verdict.amounts.remainingStockRaw, '75');
  const blocked = await handleNetlifyFixture(request('/api/rehearse', JSON.stringify({ ...input, market: 'pause' })), options);
  const b = await blocked.json(); assert.equal(b.plan.status, 'BLOCKED'); assert.equal(b.plan.candidate, undefined);
  assert.equal(b.executionEnabled, false);
});
test('Netlify routes expose only fixture health/planning and platform rate limit', () => {
  assert.deepEqual(config.path, ['/healthz', '/api/rehearse', '/api/receipt/verify', '/api/live/status', '/api/live/inspect', '/api/live/position', '/api/live/preview']);
  assert.deepEqual(config.rateLimit, { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] });
});
const cases: [string, Request, number][] = [
  ['cross-site', request('/api/rehearse', JSON.stringify(input), { 'sec-fetch-site': 'cross-site' }), 403],
  ['wrong origin', request('/api/rehearse', JSON.stringify(input), { origin: 'https://evil.test' }), 403],
  ['null origin', request('/api/rehearse', JSON.stringify(input), { origin: 'null' }), 403],
  ['content type', request('/api/rehearse', JSON.stringify(input), { 'content-type': 'text/plain' }), 415],
  ['encoding', request('/api/rehearse', JSON.stringify(input), { 'content-encoding': 'gzip' }), 415],
  ['oversize', request('/api/rehearse', ' '.repeat(4097)), 413],
  ['declared oversize', request('/api/rehearse', '{}', { 'content-length': '4097' }), 413],
  ['malformed JSON', request('/api/rehearse', '{'), 400],
  ['extra fields', request('/api/rehearse', JSON.stringify({ ...input, executionEnabled: true })), 400],
  ['wrong method', new Request(origin + '/api/rehearse'), 405],
  ['health wrong method', request('/healthz'), 405],
  ['query', request('/api/rehearse?mode=live'), 404],
  ['submit absent', request('/api/submit'), 404],
  ['sign absent', request('/api/sign'), 404],
  ['order absent', request('/api/order'), 404]
];
for (const [label, r, status] of cases) test(`Netlify rejects ${label}`, async () => {
  const result = await handleNetlifyFixture(r, options); assert.equal(result.status, status);
  assert.match(result.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(result.headers.get('access-control-allow-origin'), null);
});
test('Netlify trusts configured origins, never a caller-selected host', async () => {
  assert.equal((await handleNetlifyFixture(new Request('https://evil.test/healthz'), options)).status, 403);
  assert.equal((await handleNetlifyFixture(new Request(origin + '/healthz'), { origins: [] })).status, 403);
  assert.equal((await handleNetlifyFixture(new Request(origin + '/healthz'), { origins: [origin + '/'] })).status, 403);
});
test('Netlify rejects invalid UTF-8 and aborted request bodies', async () => {
  const bad = new Request(origin + '/api/rehearse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: new Uint8Array([0xff]) });
  assert.equal((await handleNetlifyFixture(bad, options)).status, 400);
  const controller = new AbortController(); controller.abort();
  const r = new Request(origin + '/api/rehearse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal });
  assert.equal((await handleNetlifyFixture(r, options)).status, 400);
});
