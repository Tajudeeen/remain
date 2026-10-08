import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashTypedData, type Hex } from 'viem';
import { authorizeCow, approval, cancellation, verifyOrderSignature, COW_RELAYER } from '../src/execution/cow.ts';
import { ExecutionEngine, configuredEngine } from '../src/execution/engine.ts';
import { ExecutionStore } from '../src/execution/store.ts';
import { ExecutionHttp } from '../src/execution/http.ts';
import { BinanceExecutionVendor } from '../src/execution/vendor.ts';
import { reconcileChain } from '../src/execution/settlement.ts';
import { confirmInvalidation } from '../src/execution/invalidation.ts';
import { verifyChainReceipt } from '../src/execution/receipt.ts';
import { validateTradeOrder, validateWalletTransaction } from '../web/trade.js';
import { HttpRpc, boundedJSON, fetchHeaders } from '../src/execution/rpc.ts';
import { observeContractPins } from '../src/execution/pins.ts';
import { createRehearsalServer } from '../src/rehearsal/server.ts';
import { signRequest } from '../src/signing.ts';
import { executionFixture, time, stock, txHash, cash } from './fixtures/execution.ts';

function auth(f = executionFixture()) {
  return authorizeCow({ typedData: f.typed, wallet: f.wallet, stock, expectedDebitRaw: '25', balanceRaw: '100', floorRaw: '70', targetRaw: cash.toString(), maximumFeeRaw: '1', quoteAtMs: time, nowMs: time });
}
function setup(t: import('node:test').TestContext, submit?: () => Promise<unknown>) {
  const f = executionFixture(), folder = mkdtempSync(join(tmpdir(), 'remain-execution-')), key = randomBytes(32).toString('hex'), file = join(folder, 'orders.sqlite');
  const store = new ExecutionStore(file, key); let now = time, calls = 0;
  const engine = new ExecutionEngine({ reader: f.reader, rpcs: [f.rpc, f.rpc], store, pins: f.pins, maximumStockFeeRaw: '1', mode: 'TEST_FIXTURE', now: () => now,
    vendor: { async submit(body) { calls++; assert.equal(body.quoteId, 'rfq-context-id'); assert.equal(body.vendor, 'CowSwap'); return submit ? await submit() as never : { orderId: 'platform-order', status: 'PENDING_VENDOR', txHash: null }; },
      async status() { return { orderId: 'platform-order', status: f.flags.settled ? 'FILLED' : 'PENDING_VENDOR', txHash: f.flags.settled ? txHash : null }; } } });
  t.after(() => { store.close(); rmSync(folder, { recursive: true, force: true }); });
  return { f, store, engine, key, file, advance: (ms: number) => { now += ms; }, calls: () => calls };
}
test('CoW economics bind total debit including fee, minimum net cash, receiver, exact type hash and UID', () => {
  const f = executionFixture(), a = auth(f); assert.equal(a.totalDebitRaw, '25'); assert.equal(a.stockFeeRaw, '1'); assert.equal(a.minimumCashRaw, cash.toString());
  assert.equal(a.orderDigest, hashTypedData(a.typedData)); assert.equal(a.orderUid.length, 114); assert.ok(a.orderUid.includes(f.wallet.slice(2)));
  assert.equal(approval(a).to, stock); assert.ok(approval(a).data.includes(COW_RELAYER.slice(2))); assert.ok(approval(a).data.endsWith('19'.padStart(64, '0'))); assert.ok(approval(a, true).data.endsWith('0'.repeat(64)));
  assert.equal(cancellation(a).from, f.wallet);
});
test('CoW refuses hostile signed fields, partial fills, hooks, different chain/domain and shape changes', () => {
  const changes: Record<string, unknown>[] = [{ receiver: stock }, { sellToken: COW_RELAYER }, { buyToken: stock }, { sellAmount: '25' }, { feeAmount: '2' }, { buyAmount: (cash - 1n).toString() }, { kind: 'buy' }, { partiallyFillable: true }, { appData: '0x' + '1'.repeat(64) }, { sellTokenBalance: 'internal' }, { buyTokenBalance: 'external' }, { validTo: time / 1000 }, { extra: 'x' }];
  for (const patch of changes) { const f = executionFixture(); Object.assign(f.typed.message, patch); assert.throws(() => auth(f)); }
  for (const patch of [{ chainId: 1 }, { name: 'fake' }, { version: '1' }, { verifyingContract: stock }, { salt: '0x' + '0'.repeat(64) }]) {
    const f = executionFixture(); Object.assign(f.typed.domain, patch); assert.throws(() => auth(f));
  }
  const f = executionFixture(); f.typed.types.Order.reverse(); assert.throws(() => auth(f));
});
test('fee caps, floor breach, stale quote and long order validity are independently rejected', () => {
  const f = executionFixture(), input = { typedData: f.typed, wallet: f.wallet, stock, expectedDebitRaw: '25', balanceRaw: '100', floorRaw: '70', targetRaw: cash.toString(), maximumFeeRaw: '1', quoteAtMs: time, nowMs: time };
  for (const patch of [{ maximumFeeRaw: '0' }, { floorRaw: '76' }, { balanceRaw: '94' }, { quoteAtMs: time - 30000 }, { quoteAtMs: time + 1 }, { nowMs: NaN }]) assert.throws(() => authorizeCow({ ...input, ...patch }));
  f.typed.message.validTo = time / 1000 + 1801; assert.throws(() => authorizeCow(input));
});
test('recovered signer must be the exact stock owner and altered signed payloads cannot pass', async () => {
  const f = executionFixture(), a = auth(f), signature = await f.account.signTypedData(a.typedData); assert.equal(await verifyOrderSignature(a, signature), signature);
  await assert.rejects(verifyOrderSignature(a, '0x00')); await assert.rejects(verifyOrderSignature(auth(), signature));
  const modified = { ...a, typedData: { ...a.typedData, message: { ...a.typedData.message, buyAmount: (cash + 1n).toString() } } }; await assert.rejects(verifyOrderSignature(modified, signature));
});
test('prepared order requires wallet ownership, contract pins and exact held-stock feasibility', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input); assert.equal(r.mode, 'TEST_FIXTURE'); assert.equal(r.state, 'PREPARED'); assert.equal(r.approval, null);
  assert.equal(JSON.stringify(r).includes('rfq-context-id'), false); assert.equal(JSON.stringify(r).includes('signature'), false);
  await assert.rejects(s.engine.prepare(stock, s.f.input)); await assert.rejects(s.engine.prepare(s.f.wallet, s.f.input), /ACTIVE_ORDER_EXISTS/);
  assert.throws(() => s.engine.get(stock, r.id), /ORDER_NOT_FOUND/);
});
test('zero-first exact approval remains separate from signing and a fresh allowance check is required', async t => {
  const s = setup(t); s.f.flags.allowance = 1n; const r = await s.engine.prepare(s.f.wallet, s.f.input); assert.ok(r.approval?.data.endsWith('0'.repeat(64)));
  await assert.rejects(s.engine.signing(s.f.wallet, r.id), /APPROVAL_REQUIRED/);
  s.f.flags.allowance = 0n; assert.ok((await s.engine.approve(s.f.wallet, r.id)).approval?.data.endsWith('19'.padStart(64, '0')));
  s.f.flags.allowance = 25n; assert.equal((await s.engine.approve(s.f.wallet, r.id)).approval, null); assert.equal((await s.engine.signing(s.f.wallet, r.id)).state, 'PREPARED');
});
test('one signed sale submits once, uses rfq.orderId, then reconciles the precise UID and two-provider balances', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input); s.f.flags.orderUid = r.auth.orderUid;
  const signature = await s.f.account.signTypedData(r.auth.typedData!); assert.equal((await s.engine.sign(s.f.wallet, r.id, signature)).state, 'SIGNED');
  const attempts = await Promise.allSettled([s.engine.submit(s.f.wallet, r.id), s.engine.submit(s.f.wallet, r.id)]);
  assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1); assert.equal(s.calls(), 1);
  s.f.flags.settled = true; assert.equal((await s.engine.poll(s.f.wallet, r.id)).state, 'FILLED'); const reconciled = await s.engine.poll(s.f.wallet, r.id);
  assert.equal(reconciled.state, 'RECONCILED'); assert.equal((reconciled.result as { cashReceivedRaw: string }).cashReceivedRaw, cash.toString());
  assert.equal(s.engine.receipt(s.f.wallet, r.id).provenance, 'RPC_OBSERVATIONS_RECHECK_BEFORE_RELYING');
  assert.equal((await s.engine.poll(s.f.wallet, r.id)).state, 'RECONCILED');
});
test('vendor timeout preserves encrypted signature and UUID across restart, without a second submission', async t => {
  const s = setup(t, async () => { throw new Error('timeout with private provider detail'); }), r = await s.engine.prepare(s.f.wallet, s.f.input);
  await s.engine.sign(s.f.wallet, r.id, await s.f.account.signTypedData(r.auth.typedData!)); const result = await s.engine.submit(s.f.wallet, r.id);
  assert.equal(result.state, 'UNKNOWN'); assert.equal(s.calls(), 1); await assert.rejects(s.engine.submit(s.f.wallet, r.id), /STATE_CONFLICT/);
  const reopened = new ExecutionStore(s.file, s.key); t.after(() => reopened.close()); assert.equal(reopened.get(r.id, s.f.wallet).state, 'UNKNOWN');
  assert.equal((await s.engine.poll(s.f.wallet, r.id)).state, 'UNKNOWN'); assert.equal(s.calls(), 1);
  const bytes = readFileSync(s.file); assert.equal(bytes.includes(Buffer.from(s.f.wallet)), false); assert.equal(bytes.includes(Buffer.from('rfq-context-id')), false);
  s.f.flags.settled = true; s.f.flags.orderUid = r.auth.orderUid; assert.equal((await s.engine.recoverSettlement(s.f.wallet, r.id, txHash)).state, 'RECONCILED');
});
test('expired, changed holding, wrong chain and already-used order all block before signature/submission', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input);
  s.f.flags.stockBalance = 94n; await assert.rejects(s.engine.signing(s.f.wallet, r.id), /FLOOR_BREACH/); s.f.flags.stockBalance = 100n;
  s.f.flags.wrongChain = true; await assert.rejects(s.engine.signing(s.f.wallet, r.id), /CHAIN_MISMATCH/); s.f.flags.wrongChain = false;
  s.f.flags.filled = 24n; await assert.rejects(s.engine.signing(s.f.wallet, r.id), /ORDER_ALREADY_USED/); s.f.flags.filled = 0n;
  s.advance(30000); await assert.rejects(s.engine.signing(s.f.wallet, r.id), /ORDER_EXPIRED/); assert.equal(s.calls(), 0);
});
test('unsigned cancellation releases the wallet lock, signed cancellation only prepares chain invalidation', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input); assert.equal(s.engine.cancel(s.f.wallet, r.id).state, 'CANCELLED');
  const f = executionFixture(); Object.assign(s.f.typed.message, f.typed.message, { receiver: s.f.wallet, validTo: time / 1000 + 601 });
  const next = await s.engine.prepare(s.f.wallet, s.f.input); await s.engine.sign(s.f.wallet, next.id, await s.f.account.signTypedData(next.auth.typedData!));
  const cancellation = s.engine.cancel(s.f.wallet, next.id); assert.equal(cancellation.state, 'SIGNED'); assert.ok('cancellation' in cancellation);
});
test('settlement refuses counterfeit UID, shortfall, concurrent transfers, removed logs and duplicate Trade events', async () => {
  for (const flag of ['shortfall', 'concurrent', 'removed', 'duplicate', 'wrongUid'] as const) {
    const f = executionFixture(), a = auth(f); f.flags.settled = true; f.flags.orderUid = flag === 'wrongUid' ? (a.orderUid.replace(/.$/, '0') as Hex) : a.orderUid;
    if (flag !== 'wrongUid') f.flags[flag] = true;
    if (flag === 'removed') await assert.rejects(reconcileChain([f.rpc, f.rpc], a, txHash, true));
    else assert.equal((await reconcileChain([f.rpc, f.rpc], a, txHash, true)).status, 'MISMATCH');
  }
});
test('settlement waits for 12 confirmations, detects canonical reorg and disagreed RPC evidence', async () => {
  const f = executionFixture(), a = auth(f); f.flags.orderUid = a.orderUid; f.flags.settled = true; f.flags.head = 110n;
  assert.equal((await reconcileChain([f.rpc, f.rpc], a, txHash, true)).status, 'WAITING'); f.flags.head = 111n;
  assert.equal((await reconcileChain([f.rpc, f.rpc], a, txHash, true)).status, 'RECONCILED');
  f.flags.reorg = true; await assert.rejects(reconcileChain([f.rpc, f.rpc], a, txHash, true), /REORG_DETECTED/); f.flags.reorg = false;
  const other = { async call(method: string, params: unknown[]) { const result = await f.rpc.call(method, params); return method === 'eth_call' && (params[0] as { data: string }).data.startsWith('0x70a08231') ? '0x' + '1'.padStart(64, '0') : result; } };
  await assert.rejects(reconcileChain([f.rpc, other], a, txHash, true), /RPC_DISAGREEMENT/);
});
test('database ciphertext tampering and wrong encryption keys fail closed', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input), other = new ExecutionStore(s.file, randomBytes(32).toString('hex')); t.after(() => other.close());
  assert.throws(() => other.get(r.id, s.f.wallet), /STORAGE_CORRUPT/);
  const db = new DatabaseSync(s.file); db.prepare('UPDATE execution_orders SET payload=? WHERE id=?').run('AAAA', r.id); db.close(); assert.throws(() => s.engine.get(s.f.wallet, r.id), /STORAGE_CORRUPT/);
});
test('wallet login challenge binds origin, purpose and owner, is single use, and protects order reads', async t => {
  const s = setup(t), http = new ExecutionHttp(s.engine, 'http://127.0.0.1:3000', () => time);
  const challenge = await http.handle('challenge', { wallet: s.f.wallet }, undefined) as Parameters<typeof hashTypedData>[0] & { message: { nonce: string } };
  const signature = await s.f.account.signTypedData(challenge);
  const login = await http.handle('login', { nonce: challenge.message.nonce, signature }, undefined) as { token: string };
  await assert.rejects(http.handle('login', { nonce: challenge.message.nonce, signature }, undefined), /SESSION_REQUIRED/);
  await assert.rejects(http.handle('prepare', s.f.input, undefined), /SESSION_REQUIRED/);
  const r = await http.handle('prepare', s.f.input, 'Bearer ' + login.token) as { id: string };
  assert.equal((await http.handle('get', { id: r.id }, 'Bearer ' + login.token) as { id: string }).id, r.id);
  await assert.rejects(http.handle('get', { id: r.id }, 'Bearer ' + login.token + 'x'), /SESSION_REQUIRED/);
});
test('execution is opt-in and cannot activate from a flag without reviewed protected configuration', () => {
  assert.equal(configuredEngine({}), undefined); assert.throws(() => configuredEngine({ REMAIN_EXECUTION_ENABLED: 'true' }), /VENDOR_REVIEW_REQUIRED/);
  assert.throws(() => configuredEngine({ REMAIN_EXECUTION_ENABLED: 'true', REMAIN_COW_PROFILE_REVIEWED: 'true' }), /EXECUTION_CONFIG_MISSING/);
});
test('Binance execution HMAC binds the exact POST bytes and never retries an uncertain outcome', async () => {
  let count = 0; const credentials = { apiKey: 'fixture-key', secretKey: 'fixture-secret' }, body = { requestId: '550e8400-e29b-41d4-a716-446655440000', userSignature: '0x' + '1'.repeat(130), vendor: 'CowSwap' as const, quoteId: 'rfq-context-id' };
  const client = new BinanceExecutionVendor(credentials, async (url, init) => {
    count++; assert.equal(String(url), 'https://web3.binance.com/build/api/v1/dex/aggregator/order/submit'); assert.equal(init?.method, 'POST');
    const headers = init!.headers as Record<string, string>, expected = signRequest({ ...credentials, method: 'POST', requestPath: '/build/api/v1/dex/aggregator/order/submit', body: JSON.stringify(body), timestamp: headers['X-OC-TIMESTAMP']!, nonce: headers['X-OC-NONCE']! });
    assert.equal(headers['X-OC-SIGN'], expected['X-OC-SIGN']); throw new Error('unknown');
  }, () => time);
  await assert.rejects(client.submit(body)); assert.equal(count, 1);
});
test('browser signing validation refuses fictional orders and bound wallet transactions reject altered allowances', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input);
  const selection = { input: s.f.input, floorRaw: '70', balanceRaw: '100', stockDecimals: 0, stockSymbol: 'FIXon' };
  assert.equal(validateTradeOrder(r, selection, time).id, r.id);
  assert.throws(() => validateTradeOrder(r, selection, time, true), /FIXTURE_CANNOT_REQUEST_WALLET/);
  const live = { ...r, mode: 'LIVE_EXECUTION' }; assert.equal(validateTradeOrder(live, selection, time, true).id, r.id);
  for (const change of [{ totalDebitRaw: '26' }, { floorRaw: '69' }, { stockFeeRaw: '25' }, { minimumCashRaw: '1' }, { wallet: stock }]) assert.throws(() => validateTradeOrder({ ...live, auth: { ...live.auth, ...change } }, selection, time, true));
  const tx = approval(auth(s.f)); assert.equal(validateWalletTransaction(tx, r).data, tx.data);
  assert.throws(() => validateWalletTransaction({ ...tx, data: tx.data.slice(0, -64) + 'f'.repeat(64) }, r));
  const cancel = cancellation(auth(s.f)); assert.equal(validateWalletTransaction(cancel, r, true).to, cancel.to);
  assert.throws(() => validateWalletTransaction({ ...cancel, value: '0x1' }, r, true));
});
test('independent private-receipt verifier replays the signed economics and rejects tampered floors and fixture provenance', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input); s.f.flags.orderUid = r.auth.orderUid; s.f.flags.settled = true;
  const receipt = { ...s.engine.receipt(s.f.wallet, r.id), txHash };
  assert.equal((await verifyChainReceipt(receipt, [s.f.rpc, s.f.rpc], true)).status, 'RECONCILED');
  await assert.rejects(verifyChainReceipt(receipt, [s.f.rpc, s.f.rpc]), /RECEIPT_MODE_INVALID/);
  await assert.rejects(verifyChainReceipt({ ...receipt, auth: { ...receipt.auth, floorRaw: '69' } }, [s.f.rpc, s.f.rpc], true));
  await assert.rejects(verifyChainReceipt({ ...receipt, intent: { ...receipt.intent, amountRaw: '26' } }, [s.f.rpc, s.f.rpc], true));
});
test('a reorg withdraws durable reconciliation and browser-visible success', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input);
  await s.engine.sign(s.f.wallet, r.id, await s.f.account.signTypedData(r.auth.typedData!)); await s.engine.submit(s.f.wallet, r.id);
  s.f.flags.orderUid = r.auth.orderUid; s.f.flags.settled = true; await s.engine.poll(s.f.wallet, r.id); await s.engine.poll(s.f.wallet, r.id);
  assert.equal(s.engine.get(s.f.wallet, r.id).state, 'RECONCILED'); s.f.flags.reorg = true;
  await assert.rejects(s.engine.poll(s.f.wallet, r.id), /REORG_DETECTED/);
  assert.equal(s.engine.get(s.f.wallet, r.id).state, 'INVALIDATED'); assert.equal(s.engine.get(s.f.wallet, r.id).result, null);
});
test('confirmed invalidation never claims absence of a raced fill or releases the unresolved order lock', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input);
  await s.engine.sign(s.f.wallet, r.id, await s.f.account.signTypedData(r.auth.typedData!)); await s.engine.submit(s.f.wallet, r.id);
  s.f.flags.orderUid = r.auth.orderUid; s.f.flags.invalidated = true;
  assert.equal((await s.engine.invalidate(s.f.wallet, r.id, txHash)).state, 'INVALIDATED'); assert.equal(s.store.get(r.id, s.f.wallet).invalidationTxHash, txHash);
  await assert.rejects(s.engine.prepare(s.f.wallet, s.f.input), /ACTIVE_ORDER_EXISTS/);
  assert.equal(s.engine.get(s.f.wallet, r.id).result, null);
});
test('lost signature-prompt responses persist possible escaped authority before any signature reaches the server', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input);
  await s.engine.signing(s.f.wallet, r.id); assert.equal(s.store.get(r.id, s.f.wallet).signaturePrompted, true);
  assert.equal(s.store.get(r.id, s.f.wallet).signature, null);
  const cancellation = s.engine.cancel(s.f.wallet, r.id); assert.equal(cancellation.state, 'PREPARED'); assert.ok('cancellation' in cancellation);
  await assert.rejects(s.engine.prepare(s.f.wallet, s.f.input), /ACTIVE_ORDER_EXISTS/);
  const reopened = new ExecutionStore(s.file, s.key); t.after(() => reopened.close()); assert.equal(reopened.get(r.id, s.f.wallet).signaturePrompted, true);
  s.f.flags.orderUid = r.auth.orderUid; s.f.flags.invalidated = true;
  assert.equal((await s.engine.invalidate(s.f.wallet, r.id, txHash)).state, 'INVALIDATED'); assert.equal(s.calls(), 0);
});
test('an externally filled prompted draft can be reconciled even without server receipt of its signature', async t => {
  const s = setup(t), r = await s.engine.prepare(s.f.wallet, s.f.input); await s.engine.signing(s.f.wallet, r.id);
  s.f.flags.orderUid = r.auth.orderUid; s.f.flags.settled = true;
  assert.equal((await s.engine.recoverSettlement(s.f.wallet, r.id, txHash)).state, 'RECONCILED'); assert.equal(s.calls(), 0);
});
test('invalidation requires canonical, confirmed, unique exact-UID events and revoked on-chain authority', async () => {
  const f = executionFixture(), a = auth(f); f.flags.orderUid = a.orderUid;
  await assert.rejects(confirmInvalidation([f.rpc, f.rpc], a, txHash), /CANCELLATION_UNCONFIRMED/);
  f.flags.invalidated = true; assert.equal((await confirmInvalidation([f.rpc, f.rpc], a, txHash)).orderUid, a.orderUid);
  f.flags.head = 110n; await assert.rejects(confirmInvalidation([f.rpc, f.rpc], a, txHash)); f.flags.head = 111n;
  f.flags.duplicate = true; await assert.rejects(confirmInvalidation([f.rpc, f.rpc], a, txHash)); f.flags.duplicate = false;
  f.flags.removed = true; await assert.rejects(confirmInvalidation([f.rpc, f.rpc], a, txHash)); f.flags.removed = false;
  f.flags.reorg = true; await assert.rejects(confirmInvalidation([f.rpc, f.rpc], a, txHash), /REORG_DETECTED/);
});
test('RPC transport rejects signing methods, duplicate fields, oversized data and mismatched response IDs', async () => {
  let calls = 0;
  const rpc = new HttpRpc('https://fixture-rpc.invalid/', async () => { calls++; return Response.json({ jsonrpc: '2.0', id: 99, result: '0x38' }); });
  await assert.rejects(rpc.call('eth_sendRawTransaction', []), /RPC_METHOD_REJECTED/); assert.equal(calls, 0);
  await assert.rejects(rpc.call('eth_chainId', []), /RPC_SCHEMA_INVALID/);
  await assert.rejects(boundedJSON(new Response('{"a":1,"a":2}'), AbortSignal.timeout(1000)));
  await assert.rejects(boundedJSON(new Response(' '.repeat(257)), AbortSignal.timeout(1000), 256), /UPSTREAM_TOO_LARGE/);
});
test('late response bodies and stalled streams are cancelled after the independent timeout', async () => {
  const controller = new AbortController(); let release!: (value: Response) => void, cancelled = false;
  const pending = fetchHeaders(async () => new Promise<Response>(resolve => { release = resolve; }), 'https://fixture.invalid', {}, controller.signal);
  await new Promise(resolve => setImmediate(resolve)); controller.abort(); await assert.rejects(pending);
  release(new Response(new ReadableStream({ cancel() { cancelled = true; } }))); await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, true);
  const stalled = new AbortController(); const read = boundedJSON(new Response(new ReadableStream()), stalled.signal); stalled.abort(); await assert.rejects(read);
});
test('observed contract pins remain unreviewed and a second-provider mismatch blocks export', async () => {
  const f = executionFixture(), result = await observeContractPins([f.rpc, f.rpc], stock); assert.equal(result.review, 'UNVERIFIED'); assert.deepEqual(result.pins, f.pins);
  const other = { async call(method: string, params: unknown[]) { return method === 'eth_getCode' ? '0x6001' : f.rpc.call(method, params); } };
  await assert.rejects(observeContractPins([f.rpc, other], stock), /RPC_DISAGREEMENT/);
});
test('execution HTTP boundary requires exact origin and bearer authentication before private order operations', async t => {
  const s = setup(t), options: { execution?: ExecutionHttp } = {}, server = createRehearsalServer(options);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const bound = server.address(); assert.ok(bound && typeof bound !== 'string'); const origin = `http://127.0.0.1:${bound.port}`;
  options.execution = new ExecutionHttp(s.engine, origin, () => time);
  const request = (action: string, body: unknown, headers: Record<string, string> = {}) => fetch(origin + '/api/execution/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify(body) });
  assert.equal((await request('challenge', { wallet: s.f.wallet }, { Origin: 'https://evil.invalid' })).status, 403);
  const blocked = await request('prepare', s.f.input); assert.deepEqual(await blocked.json(), { code: 'SESSION_REQUIRED' });
  const challenge = await (await request('challenge', { wallet: s.f.wallet })).json();
  const signature = await s.f.account.signTypedData(challenge);
  const login = await (await request('login', { nonce: challenge.message.nonce, signature })).json();
  const prepared = await (await request('prepare', s.f.input, { Authorization: 'Bearer ' + login.token })).json(); assert.equal(prepared.state, 'PREPARED');
  const malformed = await fetch(origin + '/api/execution/get', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Authorization: 'Bearer ' + login.token }, body: '{"id":"x","id":"y"}' });
  assert.equal(malformed.status, 400); assert.equal(s.calls(), 0);
});
