import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
import { createRehearsalServer } from '../src/rehearsal/server.ts';
import { inspectFixtureReceipt } from '../src/receipts/inspection.ts';
import { RECEIPT_MAX_BYTES } from '../src/receipts/canonical.ts';

const sample = readFileSync('web/demo-receipt.json', 'utf8');
const origin = 'https://remain-fixture.netlify.app';
const path = '/api/receipt/verify';
function request(body: string | Uint8Array, headers: Record<string, string> = {}) {
  return new Request(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : new Uint8Array(body) });
}
test('demo inspection replays accounting and exposes only bounded fixture facts', () => {
  const r = inspectFixtureReceipt(sample);
  assert.equal(r.status, 'CONSISTENT_FIXTURE'); assert.equal(r.source, 'UNAUTHENTICATED');
  assert.equal(r.signature, 'NOT_REQUESTED'); assert.equal(r.executionEnabled, false);
  assert.deepEqual(r.facts, { eventCount: 3, providerStatus: 'FILLED', settlementStatus: 'MATCHED_FIXTURE',
    stockRemainingRaw: '75', netCashReceivedRaw: '25000000000000000000' });
  const text = JSON.stringify(r);
  for (const forbidden of ['0x111111', 'planJSON', 'eventJSON', 'fixture-order']) assert.equal(text.includes(forbidden), false);
});
const attacks: [string, string, string][] = [
  ['duplicate fields', '{"mode":"TEST_FIXTURE","mode":"LIVE"}', 'DUPLICATE_KEY'],
  ['prototype key', '{"__proto__":{}}', 'INVALID_KEY'],
  ['deep nesting', '['.repeat(26) + '0' + ']'.repeat(26), 'STRUCTURE_LIMIT'],
  ['malformed JSON', '{', 'INVALID_JSON'],
  ['wrong receipt kind', '{"kind":"LIVE_RECEIPT"}', 'RECEIPT_SCHEMA']
];
for (const [label, input] of attacks) test(`receipt inspection rejects ${label} without reflecting input`, () => {
  const r = inspectFixtureReceipt(input);
  assert.equal(r.status, 'INVALID_RECEIPT'); assert.equal(r.facts, null);
  assert.equal(r.receiptChecksum, null); assert.ok(r.reasons.every(code => /^[A-Z_]+$/.test(code)));
});
test('altered summaries, provenance and checksum text never appear as verified facts', () => {
  for (const field of ['summary', 'provenance', 'receiptChecksum']) {
    const r = JSON.parse(sample);
    if (field === 'summary') r.summary.stockRemainingRaw = '74';
    if (field === 'provenance') r.provenance.authentication = 'SIGNED';
    if (field === 'receiptChecksum') r.receiptChecksum = '<script>private-sentinel</script>';
    const result = inspectFixtureReceipt(JSON.stringify(r));
    assert.equal(result.status, 'INVALID_RECEIPT'); assert.equal(result.facts, null);
    assert.equal(JSON.stringify(result).includes('private-sentinel'), false);
  }
});
test('Netlify receipt boundary returns the shared verifier contract without CORS', async () => {
  const response = await handleNetlifyFixture(request(sample), { origins: [origin] });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), inspectFixtureReceipt(sample));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal((await (await handleNetlifyFixture(request(attacks[0]![1]), { origins: [origin] })).json()).status, 'INVALID_RECEIPT');
});
const rejected: [string, string | Uint8Array, Record<string, string>, number][] = [
  ['actual size', ' '.repeat(RECEIPT_MAX_BYTES + 1), {}, 413],
  ['declared size', '{}', { 'content-length': String(RECEIPT_MAX_BYTES + 1) }, 413],
  ['malformed length', '{}', { 'content-length': 'no' }, 413],
  ['invalid UTF-8', new Uint8Array([0xff]), {}, 400],
  ['content type', '{}', { 'content-type': 'text/plain' }, 415],
  ['encoding', '{}', { 'content-encoding': 'gzip' }, 415],
  ['origin', '{}', { origin: 'https://evil.test' }, 403],
  ['cross-site', '{}', { 'sec-fetch-site': 'cross-site' }, 403]
];
for (const [label, body, headers, status] of rejected) test(`Netlify receipt rejects ${label}`, async () => {
  assert.equal((await handleNetlifyFixture(request(body, headers), { origins: [origin] })).status, status);
});
test('Netlify receipt cancels stalled and oversized streams', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(RECEIPT_MAX_BYTES + 1)); }, cancel() { cancelled = true; } });
  const r = new Request(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
  assert.equal((await handleNetlifyFixture(r, { origins: [origin] })).status, 413); assert.equal(cancelled, true);
  const controller = new AbortController();
  const stalled = new Request(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: new ReadableStream(), duplex: 'half', signal: controller.signal } as RequestInit);
  const pending = handleNetlifyFixture(stalled, { origins: [origin] }); controller.abort();
  assert.equal((await pending).status, 400);
});
test('local HTTP receipt boundary matches Netlify and remains usable after failures', async t => {
  const server = createRehearsalServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  for (const [body, status] of [[sample, 200], [' '.repeat(RECEIPT_MAX_BYTES + 1), 413], [new Uint8Array([0xff]), 400]] as const) {
    const r = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(r.status, status);
    if (status === 200) assert.deepEqual(await r.json(), inspectFixtureReceipt(sample));
  }
  assert.equal((await fetch(url + path)).status, 405);
  assert.equal((await fetch(url + path + '?live=true')).status, 404);
  assert.equal((await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.test' }, body: sample })).status, 403);
  assert.equal((await fetch(url + '/demo-receipt.json')).status, 200);
  assert.equal((await fetch(url + '/healthz')).status, 200);
});
