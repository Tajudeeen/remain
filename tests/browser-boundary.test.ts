import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { inspectFixtureReceipt } from '../src/receipts/inspection.ts';
import * as responseBoundary from '../web/response.js';

const sample = readFileSync('web/demo-receipt.json', 'utf8');
const valid = inspectFixtureReceipt(sample);
type Element = { textContent: string; disabled: boolean; hidden: boolean; value: string; files?: File[];
  className: string; attributes: Map<string, string>; children: unknown[]; classList: { toggle: () => void; add: () => void };
  setAttribute: (name: string, value: string) => void; replaceChildren: () => void; append: (value: unknown) => void;
  addEventListener: (name: string, handler: () => unknown) => void; events: Map<string, () => unknown> };
function harness(fetcher: typeof fetch, imports: Record<string, unknown> = {}) {
  const elements = new Map<string, Element>();
  const get = (id: string): Element => {
    let element = elements.get(id);
    if (!element) {
      const events = new Map<string, () => unknown>(); const attributes = new Map<string, string>(); const children: unknown[] = [];
      element = { textContent: '', disabled: true, hidden: true, value: '', className: '', events, attributes, children,
        classList: { toggle() {}, add() {} }, setAttribute(name, value) { attributes.set(name, value); },
        replaceChildren() { children.length = 0; }, append(value) { children.push(value); },
        addEventListener(name, handler) { events.set(name, handler); } };
      elements.set(id, element);
    }
    return element;
  };
  const code = readFileSync('web/proof.js', 'utf8').replace(/^import .*;\n/gm, '');
  runInNewContext(code, { ...imports, document: { getElementById: get, createElement: () => get('created') },
    fetch: fetcher, AbortController, TextDecoder, TextEncoder, Response, Blob, URL, setTimeout, clearTimeout });
  return { get, click: async (id: string) => { await get(id).events.get('click')!(); } };
}
// Exercises the actual receipt page, rather than copying its render conditions.
// Imports are injected once the response boundary exists.
const imports: Record<string, unknown> = responseBoundary;
type MutableReport = Record<string, unknown> & { facts: Record<string, unknown> };
const attacks: [string, (report: MutableReport) => void][] = [
  ['unknown settlement', r => { r.facts.settlementStatus = 'PRIVATE_SENTINEL'; }],
  ['unknown provider', r => { r.facts.providerStatus = 'PRIVATE_SENTINEL'; }],
  ['success with rejection reasons', r => { r.reasons = ['SUMMARY_MISMATCH']; }],
  ['success without checksum', r => { r.receiptChecksum = null; }],
  ['matched settlement without amounts', r => { r.facts.stockRemainingRaw = null; }],
  ['unbounded canonical bytes', r => { r.canonicalBytes = 999999999; }],
  ['unexpected reflected field', r => { r.privateSentinel = 'PRIVATE_SENTINEL'; }]
];
for (const [label, mutate] of attacks) test(`receipt page rejects ${label} before publishing success`, async () => {
  const report = structuredClone(valid) as unknown as MutableReport; mutate(report);
  const page = harness((async (url: string | URL | Request) => new Response(String(url) === '/demo-receipt.json' ? sample : JSON.stringify(report),
    { headers: { 'content-type': 'application/json' } })) as typeof fetch, imports);
  await page.click('receipt-demo');
  assert.equal(page.get('receipt-status').textContent, 'Awaiting receipt');
  assert.equal(page.get('receipt-report').disabled, true);
  assert.equal(page.get('receipt-facts').hidden, true);
  assert.equal(page.get('receipt-result').attributes.get('aria-busy'), 'false');
});
test('receipt page rejects an oversized declared response before reading it', async () => {
  let reads = 0;
  const page = harness((async () => {
    const response = new Response(sample, { headers: { 'content-type': 'application/json', 'content-length': '262145' } });
    const original = response.arrayBuffer.bind(response);
    response.arrayBuffer = async () => { reads++; return original(); };
    return response;
  }) as typeof fetch, imports);
  await page.click('receipt-demo');
  assert.equal(reads, 0);
  assert.equal(page.get('receipt-verify').disabled, true);
});
test('receipt page can retry a malformed response without reloading the selected demo', async () => {
  let reject = true; let demoReads = 0;
  const page = harness((async (url: string | URL | Request) => {
    if (String(url) === '/demo-receipt.json') { demoReads++; return new Response(sample, { headers: { 'content-type': 'application/json' } }); }
    return new Response(JSON.stringify(reject ? { ...valid, facts: { ...valid.facts, settlementStatus: 'UNKNOWN' } } : valid), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch, imports);
  await page.click('receipt-demo');
  assert.equal(page.get('receipt-report').disabled, true); assert.equal(page.get('receipt-verify').disabled, false);
  reject = false; await page.click('receipt-verify');
  assert.equal(page.get('receipt-status').textContent, 'Consistent fixture');
  assert.equal(page.get('receipt-stock').textContent, '75'); assert.equal(page.get('receipt-report').disabled, false);
  assert.equal(demoReads, 1);
});
test('clearing during a stalled receipt response releases the UI and never restores its old result', async () => {
  let cancelled = false; let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const page = harness((async (url: string | URL | Request) => {
    if (String(url) === '/demo-receipt.json') return new Response(sample, { headers: { 'content-type': 'application/json' } });
    entered(); return new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise<void>(() => {}); } }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch, imports);
  const pending = page.click('receipt-demo'); await started;
  await page.click('receipt-clear'); await pending;
  assert.equal(cancelled, true); assert.equal(page.get('receipt-status').textContent, 'Awaiting receipt');
  assert.equal(page.get('receipt-report').disabled, true); assert.equal(page.get('receipt-verify').disabled, true);
  assert.equal(page.get('receipt-result').attributes.get('aria-busy'), 'false');
});
test('receipt failure messages never reflect network exception text', async () => {
  const page = harness((async () => { throw new Error('PRIVATE_SENTINEL'); }) as typeof fetch, imports);
  await page.click('receipt-demo');
  assert.equal(page.get('receipt-message').textContent, 'Inspection unavailable or invalid. Please retry.');
});
test('receipt service size and rate errors retain actionable fixed messages', async () => {
  for (const [status, message] of [[429, 'Please wait a minute, then retry.'], [413, 'The file exceeds 256 KiB.']] as const) {
    const page = harness((async (url: string | URL | Request) => String(url) === '/demo-receipt.json'
      ? new Response(sample, { headers: { 'content-type': 'application/json' } })
      : new Response('PRIVATE_SENTINEL', { status })) as typeof fetch, imports);
    await page.click('receipt-demo');
    assert.equal(page.get('receipt-message').textContent, message);
    assert.equal(page.get('receipt-verify').disabled, false);
  }
});
