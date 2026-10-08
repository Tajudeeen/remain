import test from 'node:test';
import assert from 'node:assert/strict';
import { readSelectedPosition, positionInput, projectPosition, localPositionReader, type PositionRead } from '../src/integration/position.ts';
import { validatePosition, preparePositionAmount, formatPositionUnits } from '../web/position.js';
import { createRehearsalServer, type RehearsalServerOptions } from '../src/rehearsal/server.ts';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
import { RemainError } from '../src/errors.ts';
import type { Reader } from '../src/feasibility.ts';
import type { Query } from '../src/signing.ts';

const wallet = '0x' + '1'.repeat(40), token = '0x' + '2'.repeat(40), other = '0x' + '3'.repeat(40);
const input = { wallet, token }, time = 100000;
const stock = () => ({ binanceChainId: '56', tokenContractAddress: token, assetType: 1, platformId: 'ondo', decimals: 2, tokenSymbol: 'FIXon', underlyingTicker: 'FIX' });
const asset = (contract = token, rawBalance = '250') => ({ binanceChainId: '56', address: wallet, tokenContractAddress: contract, rawBalance, balance: '999999', isRiskToken: false });
const group = (assets: unknown[], page = 1) => [{ page, pageSize: 100, tokenAssets: assets }];
const snapshot = (now = time): PositionRead => ({ kind: 'REMAIN_POSITION_READ', mode: 'TEST_FIXTURE', wallet,
  stock: { chain: '56', token, symbol: 'FIXon', ticker: 'FIX', issuer: 'ondo', decimals: 2 },
  status: 'HELD_OBSERVED', balanceRaw: '250', observedAtMs: now, pagesRead: 1, executionEnabled: false, liveGate: 'UNVERIFIED', ownership: 'NOT_AUTHENTICATED' });
function fixture(balance: (page: number) => unknown = () => group([asset()]), catalog: unknown = [stock()], timestamp = time) {
  const calls: { endpoint: string; query: Query }[] = [];
  const reader: Reader = { async get(endpoint, query = []) {
    calls.push({ endpoint, query });
    return { data: endpoint.endsWith('/tokens') ? catalog : balance(Number(query.find(([k]) => k === 'page')?.[1])), timestamp, responseHash: 'fixture', latencyMs: 0 };
  } };
  return { reader, calls };
}
const run = (f = fixture(), signal = new AbortController().signal, clock = () => time) => readSelectedPosition(input, f.reader, signal, 'TEST_FIXTURE', clock);
const code = (expected: string) => (e: unknown) => e instanceof RemainError && e.code === expected;

test('position input is exact immutable data and rejects executable properties before reading', () => {
  assert.ok(Object.isFrozen(positionInput(input))); let invoked = 0;
  const getter = { ...input }; Object.defineProperty(getter, 'wallet', { enumerable: true, get() { invoked++; return wallet; } });
  for (const invalid of [getter, null, [], { ...input, amountRaw: '1' }, { ...input, token: '0x' + '0'.repeat(40) }, { ...input, wallet: [wallet] }, Object.create(input)]) assert.throws(() => positionInput(invalid), code('INVALID_INPUT'));
  assert.equal(invoked, 0);
});
test('selected read projects one identity and raw balance with no quotes, markets or payloads', async () => {
  const f = fixture(); const result = await run(f);
  assert.deepEqual(result, snapshot()); assert.ok(Object.isFrozen(result.stock));
  assert.deepEqual(f.calls.map(c => c.endpoint), ['/api/v1/dex/market/rwa/tokens', '/api/v1/dex/balance/all-token-balances-by-address']);
  assert.deepEqual(f.calls[1]?.query, [['address', wallet], ['chains', '56'], ['excludeRiskToken', 'true'], ['page', '1'], ['pageSize', '100']]);
  assert.equal(JSON.stringify(result).includes('999999'), false);
});
test('zero, missing, and raw-unavailable positions remain distinct without guessing', async () => {
  for (const [data, status, raw] of [[group([asset(token, '0')]), 'ZERO_OBSERVED', '0'], [group([]), 'NOT_REPORTED', null], [group([asset(token, '')]), 'RAW_UNAVAILABLE', null]] as const) {
    const result = await run(fixture(() => data)); assert.equal(result.status, status); assert.equal(result.balanceRaw, raw);
    assert.throws(() => preparePositionAmount('1', result, input, time), /POSITION_UNKNOWN/);
  }
});
test('paging advances to an actual second page and selects only the requested contract', async () => {
  const first = Array.from({ length: 100 }, (_, i) => asset('0x' + (i + 10).toString(16).padStart(40, '0')));
  const f = fixture(page => group(page === 1 ? first : [asset()], page));
  const result = await run(f); assert.equal(result.pagesRead, 2); assert.equal(result.balanceRaw, '250'); assert.equal(f.calls.length, 3);
});
test('ten full pages produce an incomplete unknown rather than zero or an unbounded read', async () => {
  const f = fixture(page => group(Array.from({ length: 100 }, (_, i) => asset('0x' + (page * 100 + i).toString(16).padStart(40, '0'))), page));
  const result = await run(f); assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.balanceRaw, null); assert.equal(result.pagesRead, 10); assert.equal(f.calls.length, 11);
});
test('page echoes, sizes and chain-group shape must match the requested single-chain page', async () => {
  for (const data of [[], group([], 2), [{ page: '1', pageSize: 100, tokenAssets: [] }], [{ page: 1, pageSize: 20, tokenAssets: [] }], [...group([]), ...group([])], group(Array(101).fill(asset(other)))]) await assert.rejects(run(fixture(() => data)), code('UPSTREAM_SCHEMA_INVALID'));
});
test('wallet, chain, risk flags and every returned contract are validated before selecting', async () => {
  for (const patch of [{ address: other }, { binanceChainId: '1' }, { isRiskToken: true }, { isRiskToken: 'false' }, { tokenContractAddress: 'broken' }, { rawBalance: '01' }, { rawBalance: null }, { rawBalance: (1n << 256n).toString() }]) await assert.rejects(run(fixture(() => group([{ ...asset(), ...patch }]))), code('UPSTREAM_SCHEMA_INVALID'));
  const result = await run(fixture(() => group([asset('', '1'), asset()]))); assert.equal(result.balanceRaw, '250');
});
test('duplicate selected rows, cross-case contracts and repeated pages never choose a convenient balance', async () => {
  await assert.rejects(run(fixture(() => group([asset(), asset(token, '999')]))), code('UPSTREAM_SCHEMA_INVALID'));
  const first = Array.from({ length: 100 }, (_, i) => asset('0x' + (i + 10).toString(16).padStart(40, '0')));
  await assert.rejects(run(fixture(page => group(page === 1 ? first : [first[0], asset()], page))), code('UPSTREAM_SCHEMA_INVALID'));
});
test('catalog ambiguity, unsupported assets and invalid decimals fail before any balance read', async () => {
  for (const [catalog, expected] of [[[stock(), stock()], 'UPSTREAM_SCHEMA_INVALID'], [[{ ...stock(), assetType: 2 }], 'UNSUPPORTED_ASSET'], [[{ ...stock(), decimals: '02' }], 'UPSTREAM_SCHEMA_INVALID'], [[{ ...stock(), decimals: 37 }], 'UPSTREAM_SCHEMA_INVALID'], [[{ ...stock(), platformId: 'unknown' }], 'UNSUPPORTED_ASSET']] as const) {
    const f = fixture(undefined, catalog); await assert.rejects(run(f), code(expected)); assert.equal(f.calls.length, 1);
  }
});
test('accessors and sparse arrays are rejected before invoking provider data hooks', async () => {
  let invoked = 0; const row = stock(); Object.defineProperty(row, 'decimals', { enumerable: true, get() { invoked++; return 2; } });
  await assert.rejects(run(fixture(undefined, [row])), code('UPSTREAM_SCHEMA_INVALID'));
  await assert.rejects(run(fixture(() => group(new Array(2)))), code('UPSTREAM_SCHEMA_INVALID'));
  assert.equal(invoked, 0);
});
test('upstream timestamps and regressing clocks cannot mint fresh position evidence', async () => {
  for (const timestamp of [time - 15001, time + 1, NaN, 1.2]) await assert.rejects(run(fixture(undefined, undefined, timestamp)), code('UPSTREAM_SCHEMA_INVALID'));
  let tick = time; await assert.rejects(run(fixture(), undefined, () => tick--), code('AUTH_CLOCK_DRIFT'));
});
test('abort before a read performs no requests and abort after a read prevents the next endpoint', async () => {
  const controller = new AbortController(), f = fixture(); controller.abort(); await assert.rejects(run(f, controller.signal), code('REQUEST_CANCELLED')); assert.equal(f.calls.length, 0);
  const second = new AbortController(); let calls = 0;
  await assert.rejects(readSelectedPosition(input, { async get() { calls++; second.abort(); return { data: [stock()], timestamp: time, responseHash: 'fixture', latencyMs: 0 }; } }, second.signal), code('REQUEST_CANCELLED')); assert.equal(calls, 1);
});
test('local position factory is opt-in and injected readers keep TEST_FIXTURE mode', async () => {
  assert.equal(localPositionReader({}), undefined); assert.throws(() => localPositionReader({ REMAIN_LOCAL_READ_ONLY: 'true' }), code('CONFIG_MISSING'));
  const f = fixture(undefined, undefined, Date.now());
  const read = localPositionReader({ REMAIN_LOCAL_READ_ONLY: 'true', BINANCE_WEB3_API_KEY: 'test-placeholder', BINANCE_WEB3_SECRET_KEY: 'test-placeholder' }, f.reader)!;
  assert.equal((await read(input, new AbortController().signal)).mode, 'TEST_FIXTURE');
});
test('response projection rejects surplus private fields, getters and forged execution claims', () => {
  let invoked = 0; const v = snapshot(); Object.defineProperty(v.stock, 'decimals', { enumerable: true, get() { invoked++; return 18; } });
  for (const value of [v, { ...snapshot(), privatePayload: 'not-reflected' }, { ...snapshot(), executionEnabled: true }, { ...snapshot(), wallet: other }, { ...snapshot(), balanceRaw: '0' }, { ...snapshot(), status: 'NOT_REPORTED' }, { ...snapshot(), mode: 'READ_ONLY_SETUP' }]) assert.throws(() => projectPosition(value, input, time), code('UPSTREAM_SCHEMA_INVALID'));
  assert.equal(invoked, 0);
});
test('response validation detaches stock data and rejects stale, future and mismatched identities', () => {
  const v = snapshot(); const result = validatePosition(v, input, time); (v.stock as { symbol: string }).symbol = 'mutated'; assert.equal(result.stock.symbol, 'FIXon');
  for (const value of [{ ...snapshot(), observedAtMs: time + 1 }, { ...snapshot(), observedAtMs: time - 15001 }, { ...snapshot(), stock: { ...snapshot().stock, token: other } }, { ...snapshot(), status: 'INCOMPLETE', balanceRaw: null, pagesRead: 9 }]) assert.throws(() => validatePosition(value, input, time));
});
test('decimal conversion is exact above float precision and across zero, eighteen and thirty-six decimals', () => {
  for (const decimals of [0, 2, 18, 36]) {
    const v = { ...snapshot(), balanceRaw: ((1n << 256n) - 1n).toString(), stock: { ...snapshot().stock, decimals } };
    assert.equal(preparePositionAmount('9007199254740993', v, input, time), (9007199254740993n * 10n ** BigInt(decimals)).toString());
    if (decimals) assert.equal(preparePositionAmount('0.' + '0'.repeat(decimals - 1) + '1', v, input, time), '1');
    assert.equal(formatPositionUnits('1', decimals), decimals ? '0.' + '0'.repeat(decimals - 1) + '1' : '1');
  }
  assert.equal(preparePositionAmount('2.50', snapshot(), input, time), '250'); assert.equal(formatPositionUnits('250', 2), '2.5');
});
test('amount preparation rejects excess balance, precision, coercion and uint256 overflow without rounding', () => {
  for (const value of ['0', '0.00', '01', '.1', '1.', '-1', '+1', '1e2', '1,000', ' 1', '2.501', '2.51', '9'.repeat(117)]) assert.throws(() => preparePositionAmount(value, snapshot(), input, time));
  assert.throws(() => preparePositionAmount((1n << 256n).toString(), { ...snapshot(), balanceRaw: ((1n << 256n) - 1n).toString(), stock: { ...snapshot().stock, decimals: 0 } }, input, time));
  assert.throws(() => preparePositionAmount('1', snapshot(), input, time, 15001), /POSITION_EXPIRED/);
  assert.throws(() => preparePositionAmount('1', snapshot(), input, time, -1), /POSITION_EXPIRED/);
});

async function withServer(runServer: (url: string) => Promise<void>, options: RehearsalServerOptions = {}) {
  const server = createRehearsalServer(options); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
  try { await runServer(`http://127.0.0.1:${addr.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const post = (url: string, body = JSON.stringify(input), origin: string | null = url) => fetch(url + '/api/live/position', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body });
test('unconfigured and hosted position endpoints never read or parse a private request', async () => {
  await withServer(async url => { const r = await post(url); assert.equal(r.status, 503); assert.deepEqual(await r.json(), { code: 'LOCAL_SETUP_REQUIRED' }); });
  const origin = 'https://remain-fixture.netlify.app';
  for (const method of ['POST', 'GET']) {
    const request = new Request(origin + '/api/live/position', { method, ...(method === 'POST' ? { body: 'malformed-private-body' } : {}) });
    const result = await handleNetlifyFixture(request, { origins: [origin] }); assert.equal(result.status, method === 'POST' ? 503 : 405); assert.equal(request.bodyUsed, false);
  }
});
test('loopback position route requires Origin, exact duplicate-free input and matching response identity', async () => {
  let calls = 0;
  await withServer(async url => {
    assert.equal((await post(url, undefined, null)).status, 403); assert.equal((await post(url, undefined, 'https://other.example')).status, 403);
    assert.equal((await post(url, JSON.stringify({ ...input, amountRaw: '1' }))).status, 400);
    assert.equal((await post(url, `{"wallet":"${wallet}","wallet":"${other}","token":"${token}"}`)).status, 400);
    assert.equal(calls, 0); const response = await post(url); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); validatePosition(await response.json(), input);
  }, { positionReader: async () => { calls++; return snapshot(Date.now()); } });
  await withServer(async url => { const response = await post(url); assert.equal(response.status, 502); assert.deepEqual(await response.json(), { code: 'UPSTREAM_SCHEMA_INVALID' }); }, { positionReader: async () => ({ ...snapshot(Date.now()), wallet: other }) });
});
test('position callbacks cannot outlive the request deadline or leak provider error text', async () => {
  let observed: AbortSignal | undefined;
  await withServer(async url => { const response = await post(url); assert.equal(response.status, 408); assert.equal(observed?.aborted, true); }, { inspectionTimeoutMs: 10, positionReader: (_input, signal) => { observed = signal; return new Promise(() => {}); } });
  await withServer(async url => { const response = await post(url); assert.equal(response.status, 400); assert.equal((await response.text()).includes('private-provider-message'), false); }, { positionReader: async () => { throw new Error('private-provider-message'); } });
});
