import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import type { hashTypedData } from 'viem';
import { readReadOnlyJSON } from '../web/response.js';
import { validatePreview, previewInput, cashTargetRaw, qualifiesPreview } from '../web/preview.js';
import { orderReviewInput } from '../web/order-review.js';
import { formatPositionUnits } from '../web/position.js';
import { ExecutionEngine } from '../src/execution/engine.ts';
import { ExecutionStore } from '../src/execution/store.ts';
import { ExecutionHttp } from '../src/execution/http.ts';
import { executionFixture, time, txHash } from './fixtures/execution.ts';

function harness(t: import('node:test').TestContext, enabled = true) {
  const f = executionFixture(), folder = mkdtempSync(join(tmpdir(), 'remain-trade-browser-'));
  const store = new ExecutionStore(join(folder, 'orders.sqlite'), randomBytes(32).toString('hex'));
  t.after(() => { store.close(); rmSync(folder, { recursive: true, force: true }); });
  const engine = new ExecutionEngine({ reader: f.reader, rpcs: [f.rpc, f.rpc], pins: f.pins, store, maximumStockFeeRaw: '1', mode: 'TEST_FIXTURE', now: () => time,
    vendor: { async submit() { return { orderId: 'fixture-platform', status: 'FILLED', txHash }; }, async status() { return { orderId: 'fixture-platform', status: 'FILLED', txHash }; } } });
  const http = new ExecutionHttp(engine, 'http://127.0.0.1:3000', () => time);
  const elements = new Map<string, { textContent: string; value: string; disabled: boolean; hidden: boolean; listeners: Map<string, () => Promise<void>> }>();
  const get = (id: string) => { if (!elements.has(id)) elements.set(id, { textContent: '', value: '', disabled: false, hidden: true, listeners: new Map() }); return elements.get(id)!; };
  const domGet = (id: string) => Object.assign(get(id), { addEventListener(event: string, callback: () => Promise<void>) { get(id).listeners.set(event, callback); } });
  const methods: string[] = [], actions: string[] = [], listeners = new Map<string, () => void>();
  const provider = { async request(request: { method: string; params?: string[] }) {
    methods.push(request.method);
    if (request.method === 'eth_chainId') return '0x38';
    if (['eth_requestAccounts', 'eth_accounts'].includes(request.method)) return [f.wallet];
    if (request.method === 'eth_signTypedData_v4') return f.account.signTypedData(JSON.parse(request.params![1]!));
    throw new Error('FIXTURE_WALLET_METHOD_FORBIDDEN');
  }, on(event: string, callback: () => void) { listeners.set(event, callback); }, removeListener(event: string) { listeners.delete(event); } };
  const fetcher = async (url: string, init?: RequestInit) => {
    const action = url.split('/').at(-1)!; actions.push(action);
    if (action === 'status') return Response.json({ kind: 'REMAIN_EXECUTION_STATUS', available: enabled, profile: 'COW_BSC_SELL_V1', userConfirmationRequired: true });
    try { return Response.json(await http.handle(action, JSON.parse(String(init?.body)), (init?.headers as Record<string, string>)?.Authorization)); }
    catch { return Response.json({ code: 'EXECUTION_REQUEST_BLOCKED' }, { status: 400 }); }
  };
  const code = readFileSync('web/trade.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/export function /g, 'function ');
  class FixtureDate extends Date { static override now() { return time; } }
  runInNewContext(code, { readReadOnlyJSON, validatePreview, previewInput, cashTargetRaw, qualifiesPreview, orderReviewInput, formatPositionUnits,
    document: { getElementById: domGet, querySelector: domGet }, window: { ethereum: provider, addEventListener() {} },
    fetch: fetcher, Date: FixtureDate, location: { origin: http.origin, hash: '#trade' }, AbortSignal, structuredClone, setTimeout, clearTimeout, console });
  return { f, engine, get, methods, actions, listeners, click: async (id: string) => { await get(id).listeners.get('click')!(); } };
}
test('unconfigured sale review never asks a wallet to connect or sign', async t => {
  const h = harness(t, false); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.get('trade-server').textContent, 'Trading service not configured'); assert.equal(h.get('trade-login').disabled, true);
  assert.equal(h.get('trade-sign').disabled, true); assert.deepEqual(h.methods, []); assert.deepEqual(h.actions, ['status']);
});
test('fixture wallet login and original-order recovery keep financial actions disabled and withdraw a reorg receipt', async t => {
  const h = harness(t); await new Promise(resolve => setImmediate(resolve));
  await h.click('trade-login'); assert.ok(h.get('trade-message').textContent.startsWith('Signed in.'));
  const r = await h.engine.prepare(h.f.wallet, h.f.input); h.get('trade-recovery-id').value = r.id;
  await h.click('trade-load'); assert.equal(h.get('trade-state').textContent, 'TEST_FIXTURE / PREPARED'); assert.equal(h.get('trade-sign').disabled, true);
  await h.engine.sign(h.f.wallet, r.id, await h.f.account.signTypedData(h.f.typed as Parameters<typeof hashTypedData>[0])); await h.engine.submit(h.f.wallet, r.id);
  h.f.flags.settled = true; h.f.flags.orderUid = r.auth.orderUid; await h.click('trade-poll');
  assert.equal(h.get('trade-state').textContent, 'TEST_FIXTURE / RECONCILED'); assert.ok(h.get('trade-receipt').textContent.startsWith('RECONCILED.'));
  assert.equal(h.get('trade-settled-facts').hidden, false); assert.equal(h.get('trade-actual-cash').textContent, '25 USDT'); assert.equal(h.get('trade-actual-stock').textContent, '75 FIXon');
  h.f.flags.reorg = true; await h.click('trade-poll'); assert.equal(h.get('trade-state').textContent, 'TEST_FIXTURE / INVALIDATED');
  assert.equal(h.get('trade-receipt').textContent.includes('RECONCILED'), false);
  assert.equal(h.get('trade-settled-facts').hidden, true); assert.equal(h.get('trade-actual-cash').textContent, '');
  assert.ok(h.methods.every(method => ['eth_chainId', 'eth_accounts', 'eth_requestAccounts', 'eth_signTypedData_v4'].includes(method)));
  assert.equal(h.actions.includes('submit'), false); h.listeners.get('accountsChanged')!(); assert.equal(h.get('trade-result').hidden, true); assert.equal(h.get('trade-load').disabled, true);
});
