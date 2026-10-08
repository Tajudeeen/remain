import test from 'node:test';
import assert from 'node:assert/strict';
import { cashOrderInput, localCashReviewer, reviewCashCandidate, projectCashOrder } from '../src/integration/preview.ts';
import { candidateForReview, orderReviewInput, validateOrderReview, type OrderReviewInput } from '../web/order-review.js';
import { fixtureTyped, wallet, token, output } from './fixtures/rfq.ts';
import { RemainError } from '../src/errors.ts';
import type { Reader } from '../src/feasibility.ts';
import type { Query } from '../src/signing.ts';
import { createRehearsalServer, type RehearsalServerOptions } from '../src/rehearsal/server.ts';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';

const time = 100000;
const input: OrderReviewInput = { intent: { wallet, token, cashTarget: '25', retainBps: 7000, maxImpactBps: 50, allowClosedMarket: false }, amountRaw: '25', vendor: 'PcsXRfq', expectedOutputRaw: '25000000', cashDecimals: 6 };
const quote = () => ({ binanceChainId: '56', executionMode: 'RFQ', vendorName: 'PcsXRfq', quoteId: 'private-quote-id', fromTokenAmount: '25', toTokenAmount: '25000000',
  fromToken: { tokenContractAddress: token, decimal: '0', isHoneyPot: false, taxRate: '0' }, toToken: { tokenContractAddress: output, decimal: '6', isHoneyPot: false, taxRate: '0' },
  priceImpactPercent: '-0.01', feeAmount: null, feeToken: null, actualSwapAmount: null });
type Options = { balance?: string; market?: unknown; quote?: unknown; build?: (value: Record<string, unknown>) => unknown; after?: (endpoint: string) => void; clock?: () => number; timestamp?: (endpoint: string) => number };
function fixture(options: Options = {}) {
  const calls: { endpoint: string; query: Query }[] = [];
  const reader: Reader = { async get(endpoint, query = []) {
    calls.push({ endpoint, query }); let data: unknown;
    if (endpoint.endsWith('/tokens')) data = [{ binanceChainId: '56', tokenContractAddress: token, assetType: 1, platformId: 'ondo', decimals: 0, tokenSymbol: 'FIXon', underlyingTicker: 'FIX' }];
    else if (endpoint.includes('/balance/')) data = [{ page: 1, pageSize: 100, tokenAssets: [{ binanceChainId: '56', address: wallet, tokenContractAddress: token, rawBalance: options.balance ?? '100', isRiskToken: false }] }];
    else if (endpoint.endsWith('/underlying-market')) data = { binanceChainId: '56', tokenContractAddress: token, statusInfo: options.market ?? { marketStatus: 'regular', openState: true, reasonCode: 'TRADING' } };
    else if (endpoint.endsWith('/quote')) data = options.quote ?? [quote()];
    else {
      const route = structuredClone((options.quote as Record<string, unknown>[] | undefined)?.[0] ?? quote()); delete route.executionMode; delete route.quoteId;
      const built = { executionMode: 'RFQ', routerResult: route, tx: { from: wallet }, rfq: { vendor: 'PcsXRfq', signingScheme: 'EIP712', typedDataToSign: fixtureTyped() } };
      data = options.build ? options.build(built) : built;
    }
    options.after?.(endpoint);
    return { data, timestamp: options.timestamp?.(endpoint) ?? time, responseHash: 'fixture', latencyMs: 0 };
  } };
  return { reader, calls, clock: options.clock ?? (() => time) };
}
const run = (f = fixture(), value = input, signal = new AbortController().signal) => reviewCashCandidate(value, f.reader, signal, 'TEST_FIXTURE', f.clock);
const code = (expected: string) => (e: unknown) => e instanceof RemainError && e.code === expected;

test('unsigned cash review rereads balance and market, refreshes the exact input and vendor, and builds once with approvals disabled', async () => {
  const f = fixture(), r = await run(f);
  assert.equal(r.kind, 'REMAIN_UNSIGNED_CASH_REVIEW'); assert.equal(r.preview.probes.length, 1); assert.equal(r.preview.probes[0]!.inputRaw, '25');
  assert.equal(r.preview.floorRaw, '70'); assert.equal(r.estimateChanged, false); assert.equal(r.executionEnabled, false); assert.equal(r.rfqReview.signatureSemantics, 'UNVERIFIED');
  assert.deepEqual(f.calls.map(c => c.endpoint), ['/api/v1/dex/market/rwa/tokens', '/api/v1/dex/balance/all-token-balances-by-address', '/api/v1/dex/market/rwa/underlying-market', '/api/v1/dex/aggregator/quote', '/api/v1/dex/aggregator/swap']);
  const q = new Map(f.calls[4]!.query); assert.equal(q.get('amount'), '25'); assert.equal(q.get('userWalletAddress'), wallet); assert.equal(q.get('quoteId'), 'private-quote-id'); assert.equal(q.get('approveTransaction'), 'false'); assert.equal(q.get('autoSlippage'), 'false'); assert.equal(q.get('priceImpactProtectionPercent'), '0.5'); assert.equal(q.has('vendor'), false);
  assert.ok(Object.isFrozen(r.input.intent)); assert.ok(Object.isFrozen(r.rfqReview));
  for (const privateValue of ['private-quote-id', 'typedDataToSign', 'verifyingContract', 'signatureData']) assert.equal(JSON.stringify(r).includes(privateValue), false);
  // The fictional signed amount is deliberately different. Structure alone is
  // insufficient, so this result cannot authorize any wallet signature.
  assert.equal(r.rfqReview.structure, 'VALIDATED'); assert.equal(r.preview.minimumOutputBinding, 'UNVERIFIED');
});
test('a changed estimate is displayed without changing selected input or substituting a better venue', async () => {
  const chosen = { ...quote(), toTokenAmount: '26000000' };
  const f = fixture({ quote: [chosen, { ...quote(), quoteId: 'better-other', vendorName: 'CowSwap', toTokenAmount: '999000000' }] });
  const r = await run(f); assert.equal(r.estimateChanged, true); assert.equal(r.preview.probes[0]!.routes[0]!.vendor, 'PcsXRfq'); assert.equal(r.preview.probes[0]!.routes[0]!.estimatedOutputRaw, '26000000'); assert.equal(f.calls.length, 5);
});
test('fresh holding shrinkage and full retention stop before market, quote and build', async () => {
  for (const value of [{ ...input, intent: { ...input.intent, retainBps: 10000 } }, input]) {
    const f = fixture({ balance: '80' }); await assert.rejects(run(f, value), code('INSUFFICIENT_POSITION')); assert.equal(f.calls.length, 2);
  }
});
test('market closure requires the same explicit cash intent permission and never substitutes permission', async () => {
  const opts = { market: { marketStatus: 'closed', openState: false, reasonCode: 'MARKET_CLOSED' } };
  const f = fixture(opts); await assert.rejects(run(f), code('MARKET_BLOCKED')); assert.equal(f.calls.length, 3);
  const r = await run(fixture(opts), { ...input, intent: { ...input.intent, allowClosedMarket: true } }); assert.equal(r.preview.market.openState, false);
});
test('missing or ambiguous selected venue, insufficient refreshed cash and excessive or absent impact never request a build', async () => {
  for (const routes of [[], [{ ...quote(), vendorName: 'CowSwap' }], [quote(), { ...quote(), quoteId: 'second-same-venue' }], [{ ...quote(), toTokenAmount: '24999999' }], [{ ...quote(), priceImpactPercent: '-0.50001' }], [{ ...quote(), priceImpactPercent: null }]]) {
    const f = fixture({ quote: routes }); await assert.rejects(run(f)); assert.equal(f.calls.length, 4);
  }
});
test('cash precision drift, malformed unselected routes and taxed quotes fail atomically before build', async () => {
  for (const routes of [[{ ...quote(), toToken: { ...quote().toToken, decimal: '18' } }], [quote(), { ...quote(), quoteId: 'other', fromTokenAmount: '26' }], [{ ...quote(), feeAmount: '0' }]]) {
    const f = fixture({ quote: routes }); await assert.rejects(run(f), code('UPSTREAM_SCHEMA_INVALID')); assert.equal(f.calls.length, 4);
  }
});
test('changed unsigned wallet, vendor, estimate, token, decimal, fee and impact discard the build', async () => {
  const changes = [
    (b: Record<string, unknown>) => ({ ...b, tx: { from: token } }),
    (b: Record<string, unknown>) => ({ ...b, rfq: { ...(b.rfq as object), vendor: 'CowSwap' } }),
    ...[{ toTokenAmount: '26000000' }, { fromTokenAmount: '26' }, { binanceChainId: '1' }, { priceImpactPercent: '-0.02' }, { feeAmount: '1' }, { fromToken: { ...quote().fromToken, decimal: '18' } }, { toToken: { ...quote().toToken, tokenContractAddress: token } }].map(p => (b: Record<string, unknown>) => ({ ...b, routerResult: { ...(b.routerResult as object), ...p } }))
  ];
  for (const build of changes) { const f = fixture({ build }); await assert.rejects(run(f), code('UPSTREAM_SCHEMA_INVALID')); assert.equal(f.calls.length, 5); }
});
test('opaque signed bytes remain blocked and no refreshed quote or build retry follows a provider failure', async () => {
  for (const build of [(b: Record<string, unknown>) => ({ ...b, rfq: { ...(b.rfq as object), typedDataToSign: '0x1901' } }), () => { throw new RemainError('QUOTE_EXPIRED'); }]) {
    const f = fixture({ build }); await assert.rejects(run(f)); assert.equal(f.calls.length, 5);
  }
});
test('stale builds, ageing balances and clock regression cannot extend the unsigned review', async () => {
  for (const variant of ['stale', 'regression', 'deadline']) {
    let at = time; const f = fixture({ clock: () => at, timestamp: () => variant === 'stale' ? time - 14000 : at,
      after: e => { if (e.endsWith('/swap')) at += variant === 'regression' ? -1 : variant === 'deadline' ? 12001 : 1100; } });
    await assert.rejects(run(f), code(variant === 'regression' ? 'AUTH_CLOCK_DRIFT' : variant === 'deadline' ? 'UPSTREAM_TIMEOUT' : 'QUOTE_EXPIRED')); assert.equal(f.calls.length, 5);
  }
});
test('a quote older than its market or a build older than its selected quote fails despite being within the freshness cap', async () => {
  for (const endpoint of ['/quote', '/swap']) {
    const f = fixture({ timestamp: e => e.endsWith(endpoint) ? time - 1 : time });
    await assert.rejects(run(f), code('UPSTREAM_SCHEMA_INVALID')); assert.equal(f.calls.length, endpoint === '/quote' ? 4 : 5);
  }
  const f = fixture({ build: b => ({ ...b, routerResult: { ...(b.routerResult as object), quoteId: 'unrelated-quote' } }) });
  await assert.rejects(run(f), code('UPSTREAM_SCHEMA_INVALID'));
});
test('cancelling an uncooperative build stops promptly and discards its late result', async () => {
  const f = fixture(), c = new AbortController(); let buildSignal: AbortSignal | undefined;
  const reader: Reader = { get(e, q, s) { if (e.endsWith('/swap')) { buildSignal = s; setTimeout(() => c.abort(), 5); return new Promise(() => {}); } return f.reader.get(e, q, s); } };
  await assert.rejects(reviewCashCandidate(input, reader, c.signal, 'TEST_FIXTURE', () => time), code('REQUEST_CANCELLED')); assert.equal(buildSignal?.aborted, true);
});
test('review input rejects surplus fields, coercion, overflow and accessors without invoking them', () => {
  let invoked = 0; const getter = { ...input }; Object.defineProperty(getter, 'amountRaw', { enumerable: true, get() { invoked++; return '25'; } });
  for (const v of [getter, null, Object.create(input), { ...input, execute: true }, { ...input, amountRaw: '0' }, { ...input, amountRaw: '025' }, { ...input, amountRaw: (1n << 256n).toString() }, { ...input, vendor: 'Pancake' }, { ...input, cashDecimals: '6' }, { ...input, cashDecimals: 37 }, { ...input, expectedOutputRaw: '24999999' }]) assert.throws(() => cashOrderInput(v), code('INVALID_INPUT'));
  assert.equal(invoked, 0); assert.ok(Object.isFrozen(orderReviewInput(input)));
});
test('shared order projection binds selected cash intent and recomputes estimate-change labels before display', async () => {
  const r = await run(); validateOrderReview(r, input, time); assert.deepEqual(candidateForReview(r.preview, time), input);
  for (const patch of [{ executionEnabled: true }, { estimateChanged: true }, { input: { ...input, amountRaw: '26' } }, { preview: { ...r.preview, floorRaw: '0' } }, { rfqReview: { ...r.rfqReview, signatureSemantics: 'VERIFIED' } }, { rfqReview: { ...r.rfqReview, artifactChecksum: 'bad' } }, { rawOrder: 'PRIVATE_SENTINEL' }]) assert.throws(() => projectCashOrder({ ...r, ...patch }, input, time), code('UPSTREAM_SCHEMA_INVALID'));
  assert.throws(() => candidateForReview({ ...r.preview, candidate: null }, time)); assert.throws(() => validateOrderReview(r, input, time + 15001));
});
test('factory requires explicit loopback opt-in and labels injected data as fictional', async () => {
  assert.equal(localCashReviewer({}), undefined); assert.throws(() => localCashReviewer({ REMAIN_LOCAL_READ_ONLY: 'true' }), code('CONFIG_MISSING'));
  const f = fixture({ timestamp: Date.now }); const review = localCashReviewer({ REMAIN_LOCAL_READ_ONLY: 'true', BINANCE_WEB3_API_KEY: 'fixture-placeholder', BINANCE_WEB3_SECRET_KEY: 'fixture-placeholder' }, f.reader)!;
  assert.equal((await review(input, new AbortController().signal)).preview.mode, 'TEST_FIXTURE');
});
async function withServer(options: RehearsalServerOptions, check: (url: string) => Promise<void>) {
  const s = createRehearsalServer(options); await new Promise<void>(resolve => s.listen(0, '127.0.0.1', resolve)); const a = s.address(); assert.ok(a && typeof a !== 'string');
  try { await check(`http://127.0.0.1:${a.port}`); } finally { s.closeAllConnections(); await new Promise<void>(resolve => s.close(() => resolve())); }
}
const post = (url: string, body = JSON.stringify(input), origin: string | null = url) => fetch(url + '/api/live/review', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body });
test('local unsigned review requires same-origin duplicate-free intent and validates callback projections', async () => {
  let calls = 0; await withServer({ cashReviewer: async value => { calls++; return run(fixture({ clock: Date.now, timestamp: Date.now }), value); } }, async url => {
    assert.equal((await post(url, undefined, null)).status, 403); assert.equal((await post(url, '{"intent":1,"intent":2}')).status, 400); assert.equal((await post(url, JSON.stringify({ ...input, amountRaw: '0' }))).status, 400); assert.equal(calls, 0);
    const r = await post(url); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); validateOrderReview(await r.json(), input);
  });
  await withServer({ inspectionTimeoutMs: 10, cashReviewer: () => new Promise(() => {}) }, async url => { assert.equal((await post(url)).status, 408); });
  await withServer({ cashReviewer: async () => { throw new Error('PRIVATE_SENTINEL'); } }, async url => { const r = await post(url); assert.equal(r.status, 400); assert.equal((await r.text()).includes('PRIVATE_SENTINEL'), false); });
});
test('public and unconfigured review endpoints reject before reading private request bodies', async () => {
  await withServer({}, async url => { assert.equal((await post(url)).status, 503); });
  const origin = 'https://remain-fixture.netlify.app'; for (const method of ['GET', 'POST']) {
    const request = new Request(origin + '/api/live/review', { method, ...(method === 'POST' ? { body: 'private malformed' } : {}) });
    assert.equal((await handleNetlifyFixture(request, { origins: [origin] })).status, method === 'POST' ? 503 : 405); assert.equal(request.bodyUsed, false);
  }
});
