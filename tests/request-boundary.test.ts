import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createRehearsalServer, type RehearsalServerOptions } from '../src/rehearsal/server.ts';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
import { validateRehearsalInput } from '../src/rehearsal/plan.ts';
import { normalizeIntent, normalizeQuote } from '../src/planning/model.ts';
import { dataRecord } from '../src/input/data.ts';
import { intent } from './planning-fixtures.ts';

const valid = { cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false };
const origin = 'https://remain-fixture.netlify.app';
const duplicates = [
  JSON.stringify(valid).replace('"cashTarget":"25"', '"cashTarget":"99","cashTarget":"25"'),
  JSON.stringify(valid).replace('"retainPercent":70', '"retainPercent":0,"\\u0072etainPercent":70'),
  JSON.stringify(valid).replace('"allowClosedMarket":false', '"allowClosedMarket":true,"allowClosedMarket":false')
];
async function withServer(run: (url: string, server: ReturnType<typeof createRehearsalServer>) => Promise<void>, options: RehearsalServerOptions = {}) {
  const server = createRehearsalServer(options);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address(); assert.ok(addr && typeof addr === 'object');
  try { await run(`http://127.0.0.1:${addr.port}`, server); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
for (const [index, body] of duplicates.entries()) {
  test(`Netlify rejects duplicate planner field ${index}`, async () => {
    const req = new Request(origin + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const result = await handleNetlifyFixture(req, { origins: [origin] });
    assert.equal(result.status, 400); assert.deepEqual(await result.json(), { code: 'INVALID_REQUEST' });
  });
  test(`HTTP rejects duplicate planner field ${index}`, async () => withServer(async url => {
    const result = await fetch(url + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(result.status, 400); assert.deepEqual(await result.json(), { code: 'INVALID_REQUEST' });
  }));
}
test('planner enum validation rejects arrays and objects without executing coercion', () => {
  let invoked = 0;
  for (const market of [['regular'], { toString() { invoked++; return 'regular'; } }]) assert.throws(() => validateRehearsalInput({ ...valid, market }));
  assert.equal(invoked, 0);
  const quote = { id: 'fixture-quote', vendor: 'PcsXRfq', wallet: '0x' + '1'.repeat(40), chain: '56',
    stockToken: '0x' + '2'.repeat(40), cashToken: '0x55d398326f99059fF775485246999027B3197955', inputRaw: '1',
    inputFeeRaw: '0', expectedGrossOutputRaw: '1', minimumGrossOutputRaw: '1', outputFeeUpperBoundRaw: '0',
    impactBps: 0, issuedAtMs: 1, expiresAtMs: 2, minimumOutputBinding: 'VERIFIED_ORDER' };
  for (const patch of [{ vendor: ['PcsXRfq'] }, { minimumOutputBinding: ['VERIFIED_ORDER'] },
    { vendor: { toString() { invoked++; return 'PcsXRfq'; } } }]) assert.throws(() => normalizeQuote({ ...quote, ...patch }));
  assert.equal(invoked, 0);
});
test('an incomplete HTTP body gets a bounded deadline and releases its slot', async () => withServer(async url => {
  await new Promise<void>((resolve, reject) => {
    const req = httpRequest(url + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '100' } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk);
      res.on('end', () => { try { assert.equal(res.statusCode, 408); assert.deepEqual(JSON.parse(text), { code: 'BODY_TIMEOUT' }); resolve(); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('TEST_DEADLINE_EXCEEDED')));
    req.write('{');
  });
  const healthy = await fetch(url + '/healthz'); assert.equal(healthy.status, 200);
  const next = await fetch(url + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
  assert.equal(next.status, 200);
}, { bodyReadTimeoutMs: 40 } as RehearsalServerOptions));
test('Netlify body-size rejection cannot wait forever for upstream cancellation', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4097)); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  const req = new Request(origin + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
  const result = await Promise.race([handleNetlifyFixture(req, { origins: [origin] }), new Promise<null>(resolve => setTimeout(() => resolve(null), 200))]);
  assert.ok(result, 'Body rejection stalled behind an unresponsive cancel implementation');
  assert.equal(result.status, 413); assert.equal(cancelled, true);
});

test('planning inputs reject getters before invoking caller code', () => {
  let invoked = 0;
  const input = { ...valid };
  Object.defineProperty(input, 'cashTarget', { get() { invoked++; return '25'; }, enumerable: true });
  assert.throws(() => validateRehearsalInput(input));
  const cashIntent = intent();
  Object.defineProperty(cashIntent.market, 'marketStatus', { get() { invoked++; return 'regular'; }, enumerable: true });
  assert.throws(() => normalizeIntent(cashIntent));
  assert.equal(invoked, 0);
});
test('non-data object shapes cannot cross the planning boundary', () => {
  const hidden = { ...valid }; Object.defineProperty(hidden, 'privateField', { value: 'never-reflect' });
  const inherited = Object.create(valid);
  const polluted = JSON.parse('{"__proto__":{},"constructor":1}');
  for (const input of [null, [], hidden, inherited, polluted, { ...valid, [Symbol('x')]: 1 }, new Date()]) assert.throws(() => dataRecord(input));
  assert.doesNotThrow(() => validateRehearsalInput(Object.assign(Object.create(null), valid)));
  assert.throws(() => dataRecord(Object.fromEntries(Array.from({ length: 129 }, (_, i) => ['x' + i, 1]))));
});
test('body-read deadline configuration fails closed', () => {
  for (const value of [0, -1, 5001, 0.5, NaN, Infinity]) assert.throws(() => createRehearsalServer({ bodyReadTimeoutMs: value }));
});
test('four stalled uploads cannot retain concurrency slots after their deadlines', async () => withServer(async url => {
  const pending: Promise<number>[] = [];
  for (let i = 0; i < 4; i++) {
    pending.push(new Promise<number>((resolve, reject) => {
      const req = httpRequest(url + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '100' } }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode!));
      });
      req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('TEST_DEADLINE_EXCEEDED'))); req.write('{');
    }));
  }
  const health = await fetch(url + '/healthz'); assert.equal(health.status, 200);
  assert.deepEqual(await Promise.all(pending), [408, 408, 408, 408]);
  const next = await fetch(url + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
  assert.equal(next.status, 200);
}, { bodyReadTimeoutMs: 60 }));
test('malformed UTF-8 and lossy numeric JSON cannot become planner input', async () => withServer(async url => {
  const number = JSON.stringify(valid).replace('"retainPercent":70', '"retainPercent":70.00000000000000000001');
  for (const body of [number, new Uint8Array([0xff])]) {
    const res = await fetch(url + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(res.status, 400); assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' });
  }
}));
test('Netlify cancellation releases a stalled body without reflecting abort reasons', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([123])); }, cancel() { cancelled = true; } });
  const controller = new AbortController();
  const req = new Request(origin + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: stream, duplex: 'half', signal: controller.signal } as RequestInit);
  const pending = handleNetlifyFixture(req, { origins: [origin] });
  controller.abort(new Error('private-abort-reason'));
  const response = await pending;
  assert.equal(response.status, 400); assert.equal(cancelled, true);
  assert.equal((await response.text()).includes('private-abort-reason'), false);
});

test('HTTP client disconnect cleans up the accepted upload without crashing the server', async () => withServer(async (url, server) => {
  const closed = new Promise<void>(resolve => server.once('request', message => message.once('close', resolve)));
  const req = httpRequest(url + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '100' } });
  req.on('error', () => {});
  server.once('request', () => req.destroy()); req.write('{');
  await closed;
  const next = await fetch(url + '/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) });
  assert.equal(next.status, 200);
}));
