import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreCashTarget, cashPreviewInput, projectCashPreview, localCashPreviewer } from '../src/integration/preview.ts';
import { previewInput, cashTargetRaw, impactWithin, validatePreview, type PreviewInput } from '../web/preview.js';
import { readReadOnlyJSON, readFixtureJSON } from '../web/response.js';
import { BSC_USDT } from '../src/validation.ts';
import { RemainError } from '../src/errors.ts';
import { createRehearsalServer, type RehearsalServerOptions } from '../src/rehearsal/server.ts';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
import type { Reader } from '../src/feasibility.ts';
import type { Query } from '../src/signing.ts';

const wallet = '0x' + '1'.repeat(40), token = '0x' + '2'.repeat(40), other = '0x' + '3'.repeat(40), time = 100000;
const input: PreviewInput = { wallet, token, cashTarget: '25', retainBps: 7000, maxImpactBps: 50, allowClosedMarket: false };
const stock = { binanceChainId: '56', tokenContractAddress: token, assetType: 1, platformId: 'ondo', decimals: 0, tokenSymbol: 'FIXon', underlyingTicker: 'FIX' };
function route(amount: string, output = (BigInt(amount) * 1000000n).toString(), id = 'fixture-' + amount) {
  return { binanceChainId: '56', fromTokenAmount: amount, toTokenAmount: output, executionMode: 'RFQ', vendorName: 'PcsXRfq', quoteId: id,
    fromToken: { tokenContractAddress: token, decimal: '0', isHoneyPot: false, taxRate: '0' },
    toToken: { tokenContractAddress: BSC_USDT, decimal: '6', isHoneyPot: false, taxRate: '0' },
    priceImpactPercent: '-0.01', feeAmount: null, feeToken: null, actualSwapAmount: null, tradeFee: '9.999', estimateGasFee: null };
}
type Overrides = { quote?: (amount: string, call: number) => unknown; market?: unknown; balance?: string; timestamp?: (endpoint: string) => number; clock?: () => number; after?: (endpoint: string) => void };
function fixture(options: Overrides = {}) {
  const calls: { endpoint: string; query: Query; at: number }[] = []; let count = 0;
  const reader: Reader = { async get(endpoint, query = []) {
    calls.push({ endpoint, query, at: performance.now() });
    let data: unknown;
    if (endpoint.endsWith('/tokens')) data = [stock];
    else if (endpoint.includes('/balance/')) data = [{ page: 1, pageSize: 100, tokenAssets: [{ binanceChainId: '56', address: wallet, tokenContractAddress: token, rawBalance: options.balance ?? '100', isRiskToken: false }] }];
    else if (endpoint.endsWith('/underlying-market')) data = { binanceChainId: '56', tokenContractAddress: token, statusInfo: options.market ?? { marketStatus: 'regular', openState: true, reasonCode: 'TRADING' } };
    else data = options.quote ? options.quote(query.find(([k]) => k === 'amount')![1], ++count) : [route(query.find(([k]) => k === 'amount')![1])];
    options.after?.(endpoint);
    return { data, timestamp: options.timestamp?.(endpoint) ?? time, responseHash: 'fixture', latencyMs: 0 };
  } };
  return { reader, calls, clock: options.clock ?? (() => time) };
}
const run = (f = fixture(), value = input, signal = new AbortController().signal) => exploreCashTarget(value, f.reader, signal, 'TEST_FIXTURE', f.clock);
const code = (expected: string) => (e: unknown) => e instanceof RemainError && e.code === expected;

test('cash target search reads a fresh holding and market, retains the floor and selects the smallest qualifying observed input', async () => {
  const f = fixture(), result = await run(f);
  assert.equal(result.mode, 'TEST_FIXTURE'); assert.equal(result.floorRaw, '70'); assert.equal(result.maxInputRaw, '30'); assert.equal(result.cashDecimals, 6);
  assert.equal(result.cashTargetRaw, '25000000'); assert.equal(result.probes.length, 8); assert.equal(result.stopReason, 'SEARCH_LIMIT');
  const candidate = result.probes[result.candidate!.probeIndex]!; assert.equal(candidate.inputRaw, '25');
  assert.equal(result.executionEnabled, false); assert.equal(result.minimumOutputBinding, 'UNVERIFIED'); assert.equal(result.fees, 'UNVERIFIED');
  assert.ok(Object.isFrozen(result.probes)); assert.ok(Object.isFrozen(candidate.routes[0]));
  assert.deepEqual(f.calls.slice(0, 3).map(c => c.endpoint), ['/api/v1/dex/market/rwa/tokens', '/api/v1/dex/balance/all-token-balances-by-address', '/api/v1/dex/market/rwa/underlying-market']);
  for (const c of f.calls.slice(3)) { assert.equal(c.endpoint, '/api/v1/dex/aggregator/quote'); const q = new Map(c.query); assert.equal(q.get('userWalletAddress'), wallet); assert.equal(q.get('toTokenAddress'), BSC_USDT.toLowerCase()); assert.ok(BigInt(q.get('amount')!) <= 30n); assert.equal(q.has('vendor'), false); assert.equal(q.has('feePercent'), false); }
  for (let i = 4; i < f.calls.length; i++) assert.ok(f.calls[i]!.at - f.calls[i - 1]!.at >= 190, 'spacing is bounded by an independent timer');
  assert.equal(JSON.stringify(result).includes('fixture-'), false); assert.equal(JSON.stringify(result).includes('9.999'), false);
});
test('request and decimal conversion reject coercion, surplus fields, uint overflow and overprecision before treating output as cash', () => {
  assert.ok(Object.isFrozen(previewInput(input))); let invoked = 0;
  const getter = { ...input }; Object.defineProperty(getter, 'cashTarget', { enumerable: true, get() { invoked++; return '25'; } });
  for (const bad of [getter, null, [], Object.create(input), { ...input, signing: true }, { ...input, retainBps: '7000' }, { ...input, maxImpactBps: 501 }, { ...input, allowClosedMarket: 'false' }, ...['0', '0.00', '01', '.1', '1e2', '-1', ' 25'].map(cashTarget => ({ ...input, cashTarget }))]) assert.throws(() => cashPreviewInput(bad), code('INVALID_INPUT'));
  assert.equal(invoked, 0);
  assert.equal(cashTargetRaw('9007199254740993', 6), '9007199254740993000000'); assert.equal(cashTargetRaw('0.' + '0'.repeat(35) + '1', 36), '1');
  for (const [value, decimals] of [['1.001', 2], ['1', 37], [(1n << 256n).toString(), 0], ['1.0', 0]] as const) assert.throws(() => cashTargetRaw(value, decimals));
});
test('impact uses exact absolute percent, including fractional basis points, and missing impact never qualifies', () => {
  assert.equal(impactWithin('0.50', 50), true); assert.equal(impactWithin('-0.50', 50), true); assert.equal(impactWithin('-0.5000000000000000001', 50), false); assert.equal(impactWithin(null, 50), false);
  for (const value of ['NaN', '1e-2', '+0.1', '00.1', '-.1', '0.']) assert.throws(() => impactWithin(value, 50));
});
test('retention rounds up in raw units and a tiny position exhausts a finite domain without global optimum claims', async () => {
  const result = await run(fixture({ balance: '3' }), { ...input, cashTarget: '1', retainBps: 3333 });
  assert.equal(result.floorRaw, '1'); assert.equal(result.maxInputRaw, '2'); assert.equal(result.probes.length, 2); assert.equal(result.stopReason, 'EXHAUSTED'); assert.equal(result.probes[result.candidate!.probeIndex]!.inputRaw, '1');
});
test('missing, zero and fully retained holdings never reach a market or quote endpoint', async () => {
  for (const [balance, retainBps] of [['0', 0], ['100', 10000], ['', 0]] as const) { const f = fixture({ balance }); await assert.rejects(run(f, { ...input, retainBps }), code('INSUFFICIENT_POSITION')); assert.equal(f.calls.length, 2); }
});
test('paused, unknown, contradictory and unpermitted closed markets block every quote', async () => {
  for (const market of [{ marketStatus: 'pause', openState: true }, { marketStatus: null, openState: null }, { marketStatus: 'regular', openState: false }, { marketStatus: 'closed', openState: true }, { marketStatus: 'closed', openState: false }, { marketStatus: 'regular', openState: true, reasonCode: 'MAINTENANCE' }]) { const f = fixture({ market }); await assert.rejects(run(f)); assert.equal(f.calls.length, 3); }
  const result = await run(fixture({ balance: '3', market: { marketStatus: 'closed', openState: false, reasonCode: 'MARKET_CLOSED' } }), { ...input, cashTarget: '1', retainBps: 3333, allowClosedMarket: true }); assert.equal(result.market.openState, false); assert.ok(result.candidate);
});
test('all returned routes are admitted atomically and unexpected fee, tax, precision, identity or vendor data discards the attempt', async () => {
  const patches = [{ binanceChainId: '1' }, { fromTokenAmount: '1' }, { executionMode: 'SWAP' }, { vendorName: 'unknown' }, { toTokenAmount: '01' }, { toTokenAmount: '0' }, { priceImpactPercent: undefined }, { quoteId: 'bad id' }, { feeAmount: '0' }, { actualSwapAmount: '30' },
    { fromToken: { ...route('30').fromToken, decimal: '18' } }, { fromToken: { ...route('30').fromToken, isHoneyPot: true } }, { fromToken: { ...route('30').fromToken, taxRate: 0 } },
    { toToken: { ...route('30').toToken, tokenContractAddress: other } }, { toToken: { ...route('30').toToken, taxRate: '0.01' } }, { toToken: { ...route('30').toToken, decimal: '06' } }];
  for (const patch of patches) { const f = fixture({ quote: amount => [route(amount), { ...route(amount, undefined, 'second'), ...patch }] }); await assert.rejects(run(f), code('UPSTREAM_SCHEMA_INVALID')); assert.equal(f.calls.length, 4); }
});
test('duplicate quote IDs, sparse batches and provider accessors fail without invoking getters', async () => {
  let invoked = 0;
  for (const quote of [(a: string) => [route(a), route(a)], () => new Array(2), (a: string) => { const r = route(a); Object.defineProperty(r, 'toTokenAmount', { enumerable: true, get() { invoked++; return '25000000'; } }); return [r]; }]) await assert.rejects(run(fixture({ quote })), code('UPSTREAM_SCHEMA_INVALID'));
  assert.equal(invoked, 0);
});
test('cross-probe cash precision drift and repeated IDs discard an earlier promising route', async () => {
  for (const variant of ['decimals', 'id']) { const f = fixture({ quote: (a, n) => [{ ...route(a, undefined, variant === 'id' ? 'repeated' : 'quote-' + a), ...(variant === 'decimals' && n === 2 ? { toToken: { ...route(a).toToken, decimal: '18' } } : {}) }] }); await assert.rejects(run(f), code('UPSTREAM_SCHEMA_INVALID')); assert.equal(f.calls.length, 5); }
});
test('empty and missing-impact routes yield no candidate and never create a fake minimum or zero-fee plan', async () => {
  for (const quote of [() => [], (a: string) => [{ ...route(a), priceImpactPercent: null }], (a: string) => [{ ...route(a), priceImpactPercent: '-0.50001' }]]) {
    const result = await run(fixture({ balance: '3', quote }), { ...input, cashTarget: '1', retainBps: 3333 }); assert.equal(result.candidate, null); assert.equal(result.minimumOutputBinding, 'UNVERIFIED'); assert.equal(result.fees, 'UNVERIFIED'); assert.equal(Object.hasOwn(result, 'minimumNetCashRaw'), false);
  }
});
test('a non-monotonic quote curve can only promise the smallest qualifying sampled input', async () => {
  const result = await run(fixture({ balance: '4', quote: a => [route(a, a === '1' ? '100000000' : '1000000')] }), { ...input, retainBps: 0 });
  assert.equal(result.probes[result.candidate!.probeIndex]!.inputRaw, '1'); assert.equal(result.stopReason, 'EXHAUSTED');
});
test('past or future timestamps and balance ageing invalidate every previously observed candidate', async () => {
  for (const timestamp of [time + 1, time - 15001]) await assert.rejects(run(fixture({ timestamp: () => timestamp })), code('UPSTREAM_SCHEMA_INVALID'));
  let clock = time;
  const f = fixture({ timestamp: endpoint => endpoint.includes('/balance/') ? time - 14000 : clock, clock: () => clock, after: endpoint => { if (endpoint.endsWith('/quote')) clock += 1100; } });
  await assert.rejects(run(f), code('QUOTE_EXPIRED')); assert.equal(f.calls.length, 4);
});
test('clock regression inside initial position reads is preserved as a clock fault', async () => {
  let clock = time; const f = fixture({ clock: () => clock, after: endpoint => { if (endpoint.endsWith('/tokens')) clock--; } }); await assert.rejects(run(f), code('AUTH_CLOCK_DRIFT')); assert.equal(f.calls.length, 1);
});
test('deadline advancement during a quote discards the result and stops every subsequent request', async () => {
  let clock = time;
  const f = fixture({ clock: () => clock, timestamp: () => clock, after: endpoint => { if (endpoint.endsWith('/quote')) clock += 12001; } }); await assert.rejects(run(f), code('UPSTREAM_TIMEOUT')); assert.equal(f.calls.length, 4);
});
test('cancellation before a read and during an uncooperative reader perform no later endpoints', async () => {
  const c = new AbortController(), f = fixture(); c.abort(); await assert.rejects(run(f, input, c.signal), code('REQUEST_CANCELLED')); assert.equal(f.calls.length, 0);
  const active = new AbortController(); let calls = 0, observed: AbortSignal | undefined;
  const pending = exploreCashTarget(input, { get(_e, _q, s) { calls++; observed = s; return new Promise(() => {}); } }, active.signal, 'TEST_FIXTURE', () => time);
  setTimeout(() => active.abort(), 10); await assert.rejects(pending, code('REQUEST_CANCELLED')); assert.equal(calls, 1); assert.equal(observed?.aborted, true);
});
test('local factory captures protected config only after opt-in and injected data remains TEST_FIXTURE', async () => {
  assert.equal(localCashPreviewer({}), undefined); assert.throws(() => localCashPreviewer({ REMAIN_LOCAL_READ_ONLY: 'true' }), code('CONFIG_MISSING'));
  const f = fixture({ balance: '3', timestamp: () => Date.now(), clock: Date.now });
  const preview = localCashPreviewer({ REMAIN_LOCAL_READ_ONLY: 'true', BINANCE_WEB3_API_KEY: 'test-placeholder', BINANCE_WEB3_SECRET_KEY: 'test-placeholder' }, f.reader)!;
  const result = await preview({ ...input, cashTarget: '1', retainBps: 3333 }, new AbortController().signal); assert.equal(result.mode, 'TEST_FIXTURE');
});
test('cancelling spacing discards a promising first quote without issuing another probe', async () => {
  const c = new AbortController(), f = fixture({ after: endpoint => { if (endpoint.endsWith('/quote')) setTimeout(() => c.abort(), 10); } });
  await assert.rejects(run(f, input, c.signal), code('REQUEST_CANCELLED')); assert.equal(f.calls.length, 4);
});
test('read-only error transport retains bounded parsing and fixture transport still rejects errors', async () => {
  const signal = new AbortController().signal, response = (body: string) => new Response(body, { status: 502, headers: { 'Content-Type': 'application/json' } });
  assert.equal((await readReadOnlyJSON(response('{"code":"INSUFFICIENT_POSITION"}'), signal) as { code: string }).code, 'INSUFFICIENT_POSITION');
  await assert.rejects(readFixtureJSON(response('{"code":"INSUFFICIENT_POSITION"}'), signal));
  for (const body of ['{"code":"A","code":"B"}', ' '.repeat(262145), '{"code":"A","private":1e500}']) await assert.rejects(readReadOnlyJSON(response(body), signal));
});
test('shared projection independently recomputes floor, target, candidate ranking and fixed safety labels', async () => {
  const v = await run(fixture({ balance: '3' }), { ...input, cashTarget: '1', retainBps: 3333 }), submitted = v.input;
  validatePreview(v, submitted, time);
  for (const patch of [{ floorRaw: '0' }, { maxInputRaw: '3' }, { cashTargetRaw: '2' }, { cashDecimals: 18 }, { fees: 'VERIFIED' }, { executionEnabled: true }, { privatePayload: 'PRIVATE_SENTINEL' }, { candidate: null }, { candidate: { probeIndex: 0, routeIndex: 0 } }, { input: { ...submitted, cashTarget: '2' } }, { market: { ...v.market, openState: false } }]) assert.throws(() => projectCashPreview({ ...v, ...patch }, submitted, time), code('UPSTREAM_SCHEMA_INVALID'));
});
test('projection rejects duplicate probes, dishonest timestamps and getters without executing them', async () => {
  const v = await run(fixture({ balance: '3' }), { ...input, cashTarget: '1', retainBps: 3333 }); let invoked = 0;
  const getter = { ...v }; Object.defineProperty(getter, 'floorRaw', { enumerable: true, get() { invoked++; return '1'; } });
  for (const value of [getter, { ...v, probes: [v.probes[0], v.probes[0]] }, { ...v, probes: [{ ...v.probes[0], inputRaw: '3' }] }, { ...v, probes: [{ ...v.probes[0], observedAtMs: time + 1 }] }, { ...v, createdAtMs: time - 1 }]) assert.throws(() => validatePreview(value, v.input, time));
  assert.equal(invoked, 0);
});
async function withServer(runServer: (url: string) => Promise<void>, options: RehearsalServerOptions = {}) {
  const server = createRehearsalServer(options); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
  try { await runServer(`http://127.0.0.1:${addr.port}`); } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const post = (url: string, body = JSON.stringify(input), origin: string | null = url) => fetch(url + '/api/live/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body });
test('unconfigured and hosted cash preview endpoints neither parse nor send private requests', async () => {
  await withServer(async url => { const r = await post(url); assert.equal(r.status, 503); });
  const origin = 'https://remain-fixture.netlify.app';
  for (const method of ['POST', 'GET']) { const request = new Request(origin + '/api/live/preview', { method, ...(method === 'POST' ? { body: 'private-malformed-input' } : {}) }); const r = await handleNetlifyFixture(request, { origins: [origin] }); assert.equal(r.status, method === 'POST' ? 503 : 405); assert.equal(request.bodyUsed, false); }
});
test('local cash endpoint requires Origin and duplicate-free exact input before running the callback', async () => {
  let calls = 0;
  await withServer(async url => {
    assert.equal((await post(url, undefined, null)).status, 403); assert.equal((await post(url, `{"wallet":"${wallet}","wallet":"${other}"}`)).status, 400);
    assert.equal((await post(url, JSON.stringify({ ...input, retainBps: '7000' }))).status, 400); assert.equal(calls, 0);
    const r = await post(url); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); validatePreview(await r.json(), input);
  }, { cashPreviewer: async value => { calls++; const f = fixture({ timestamp: () => Date.now(), clock: Date.now }); return run(f, value); } });
});
test('local callback projection and deadlines discard forged results and redact raw exception text', async () => {
  await withServer(async url => { const r = await post(url); assert.equal(r.status, 408); }, { inspectionTimeoutMs: 10, cashPreviewer: () => new Promise(() => {}) });
  await withServer(async url => { const r = await post(url); assert.equal(r.status, 400); assert.equal((await r.text()).includes('PRIVATE_SENTINEL'), false); }, { cashPreviewer: async () => { throw new Error('PRIVATE_SENTINEL'); } });
});
