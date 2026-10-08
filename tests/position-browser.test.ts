import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { readFixtureJSON } from '../web/response.js';
import * as boundary from '../web/position.js';
import { readinessStatus } from '../src/integration/readiness.ts';

const wallet = '0x' + '1'.repeat(40), token = '0x' + '2'.repeat(40), other = '0x' + '3'.repeat(40), time = 100000;
const position = () => ({ kind: 'REMAIN_POSITION_READ', mode: 'TEST_FIXTURE', wallet,
  stock: { chain: '56', token, symbol: 'FIXon', ticker: 'FIX', issuer: 'ondo', decimals: 2 },
  status: 'HELD_OBSERVED', balanceRaw: '250', observedAtMs: time, pagesRead: 1, executionEnabled: false, liveGate: 'UNVERIFIED', ownership: 'NOT_AUTHENTICATED' });
type Handler = (...args: unknown[]) => unknown;
type Element = { textContent: string; value: string; disabled: boolean; hidden: boolean; events: Map<string, Handler>; attrs: Map<string, string>;
  classList: { toggle: Handler; add: Handler; remove: Handler }; setAttribute: Handler; replaceChildren: Handler; append: Handler; addEventListener: (name: string, handler: Handler) => void; reportValidity: () => boolean };
function harness(positionFetch: (signal: AbortSignal) => Promise<Response> = async () => json(position())) {
  const elements = new Map<string, Element>(), timers = new Map<number, { ms: number; run: () => void }>(), events = new Map<string, Handler>();
  let timerId = 0, wall = time, elapsed = 0, changed!: (state: Record<string, unknown>) => void, state: Record<string, unknown> = { status: 'IDLE' };
  const requests: string[] = [];
  const get = (id: string): Element => {
    let element = elements.get(id);
    if (!element) { element = { textContent: '', value: '', disabled: true, hidden: true, events: new Map(), attrs: new Map(),
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute(name, value) { element!.attrs.set(String(name), String(value)); }, replaceChildren() {}, append() {},
      addEventListener(name, handler) { element!.events.set(name, handler); }, reportValidity: () => true }; elements.set(id, element); }
    return element;
  };
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
  const sessionFactory = (_provider: unknown, onChange: typeof changed) => {
    changed = onChange;
    return { get state() { return state; }, connect() { state = { status: 'CONNECTED', address: wallet }; changed(state); }, forget() { state = { status: 'IDLE' }; changed(state); }, destroy() {} };
  };
  const source = readFileSync('web/live.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  runInNewContext(source, { readFixtureJSON, walletSession: sessionFactory,
    validatePosition: (v: unknown, input: boundary.PositionInput) => boundary.validatePosition(v, plain(input), wall), formatPositionUnits: boundary.formatPositionUnits,
    preparePositionAmount: (a: string, v: unknown, input: boundary.PositionInput, now: number, age: number) => boundary.preparePositionAmount(a, v, plain(input), now, age),
    document: { getElementById: get, createElement: () => get('created') }, location: { hash: '#home' }, window: { addEventListener(name: string, handler: Handler) { events.set(name, handler); } },
    fetch: async (url: string, options: RequestInit) => { requests.push(url); return url === '/api/live/status' ? json(readinessStatus(true)) : positionFetch(options.signal!); },
    Date: { now: () => wall }, performance: { now: () => elapsed }, AbortController,
    setTimeout(run: () => void, ms: number) { timers.set(++timerId, { ms, run }); return timerId; }, clearTimeout(id: number) { timers.delete(id); }
  });
  const event = async (id: string, name = 'click') => { await get(id).events.get(name)?.({ preventDefault() {} }); };
  return { get, event, requests, timers, async ready() { await event('live-refresh'); await event('wallet-connect'); get('live-token').value = token; await event('live-token', 'input'); },
    accountChange() { state = { status: 'CHANGED' }; changed(state); }, pagehide() { events.get('pagehide')?.(); }, clocks(w: number, e: number) { wall = w; elapsed = e; } };
}
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
test('actual integration page prepares exact units only on explicit action and never requests an RFQ automatically', async () => {
  const page = harness(); await page.ready(); await page.event('position-read');
  assert.equal(page.get('position-balance').textContent, '2.5 FIXon'); assert.match(page.get('position-label').textContent, /TEST_FIXTURE/);
  page.get('position-units').value = '1.00'; await page.event('position-use'); assert.equal(page.get('live-amount').value, '100');
  assert.deepEqual(page.requests, ['/api/live/status', '/api/live/position']); assert.equal(page.get('live-result').hidden, true);
});
for (const [label, patch] of [['other wallet', { wallet: other }], ['unbound stock', { stock: { ...position().stock, token: other } }], ['stale data', { observedAtMs: time - 15001 }], ['execution claim', { executionEnabled: true }], ['extra private field', { privatePayload: 'PRIVATE_SENTINEL' }]] as const) test(`actual position page rejects ${label} atomically and can retry`, async () => {
  let malformed = true; const page = harness(async () => json(malformed ? { ...position(), ...patch } : position())); await page.ready(); await page.event('position-read');
  assert.equal(page.get('position-result').hidden, true); assert.equal(page.get('position-balance').textContent, ''); assert.equal(page.get('position-use').disabled, true);
  assert.equal(page.get('position-read').disabled, false); assert.equal(page.get('position-panel').attrs.get('aria-busy'), 'false');
  malformed = false; await page.event('position-read'); assert.equal(page.get('position-result').hidden, false);
});
test('actual position page clears and aborts an in-flight read when the stock changes', async () => {
  let release!: (r: Response) => void, signal!: AbortSignal;
  const page = harness(s => { signal = s; return new Promise(resolve => { release = resolve; }); }); await page.ready();
  const pending = page.event('position-read'); page.get('live-token').value = other; await page.event('live-token', 'input'); assert.equal(signal.aborted, true);
  release(json(position())); await pending; assert.equal(page.get('position-result').hidden, true); assert.equal(page.get('position-use').disabled, true); assert.equal(page.get('position-read').disabled, false);
});
test('actual position page clears account state, derived input and selected balance after a wallet change', async () => {
  const page = harness(); await page.ready(); await page.event('position-read'); page.get('position-units').value = '1'; await page.event('position-use');
  page.accountChange(); assert.equal(page.get('position-balance').textContent, ''); assert.equal(page.get('position-result').hidden, true); assert.equal(page.get('live-amount').value, ''); assert.equal(page.get('position-read').disabled, true);
});
test('actual position page rejects elapsed expiry even if wall-clock time has not advanced', async () => {
  const page = harness(); await page.ready(); await page.event('position-read'); page.get('position-units').value = '1'; page.clocks(time, 15001); await page.event('position-use');
  assert.equal(page.get('live-amount').value, ''); assert.match(page.get('live-message').textContent, /expired/);
});
test('actual position page expires conversion and clears balances on page exit', async () => {
  const page = harness(); await page.ready(); await page.event('position-read');
  [...page.timers.values()].find(timer => timer.ms === 15000)!.run(); assert.equal(page.get('position-use').disabled, true); assert.match(page.get('position-message').textContent, /expired/);
  page.pagehide(); assert.equal(page.get('position-balance').textContent, ''); assert.equal(page.get('position-result').hidden, true);
});
test('actual position page counts upstream observation age in the elapsed budget despite wall-clock rollback', async () => {
  const page = harness(async () => json({ ...position(), observedAtMs: time - 10000 })); await page.ready(); await page.event('position-read');
  page.get('position-units').value = '1'; page.clocks(time - 5000, 6000); await page.event('position-use');
  assert.equal(page.get('live-amount').value, ''); assert.match(page.get('live-message').textContent, /expired/);
});
test('actual position page keeps absent balance unknown and rejects overprecision without replacing the manual input', async () => {
  const unknown = harness(async () => json({ ...position(), status: 'NOT_REPORTED', balanceRaw: null })); await unknown.ready(); await unknown.event('position-read');
  assert.equal(unknown.get('position-balance').textContent, 'Balance unknown'); assert.equal(unknown.get('position-use').disabled, true);
  const page = harness(); await page.ready(); await page.event('position-read'); page.get('live-amount').value = '100'; page.get('position-units').value = '1.001'; await page.event('position-use');
  assert.equal(page.get('live-amount').value, '100'); assert.match(page.get('live-message').textContent, /decimal places/);
});
