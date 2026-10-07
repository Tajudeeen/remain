import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFeasibility, type Reader } from '../src/feasibility.ts';
import { address, uint, checkMarket, inspectRfq, BSC_USDT } from '../src/validation.ts';

const wallet = '0x1111111111111111111111111111111111111111';
const token = '0x2222222222222222222222222222222222222222';
const env = { BINANCE_WEB3_API_KEY: 'fixture-key', BINANCE_WEB3_SECRET_KEY: 'fixture-secret', REMAIN_WALLET_ADDRESS: wallet, REMAIN_RWA_TOKEN_ADDRESS: token, REMAIN_SELL_AMOUNT_RAW: '100' };
const status = { openState: true, marketStatus: 'regular', reasonCode: null };
const typed = { domain: { chainId: 56, verifyingContract: token }, primaryType: 'Order', types: { Order: [{ name: 'amount', type: 'uint256' }] }, message: { amount: '100' } };
const rfq = { executionMode: 'RFQ', rfq: { vendor: 'PcsXRfq', typedDataToSign: typed } };

function fixtures(overrides: Record<string, unknown> = {}, staleQuote = false): { reader: Reader; calls: string[] } {
  const calls: string[] = [];
  const data: Record<string, unknown> = {
    '/api/v1/dex/aggregator/supported/chain': [{ binanceChainId: '56' }],
    '/api/v1/dex/market/rwa/tokens': [{ binanceChainId: '56', tokenContractAddress: token, assetType: 1, platformId: 'ondo', decimals: 18, tokenSymbol: 'FIXTUREon', underlyingTicker: 'FIXTURE', statusInfo: status }],
    '/api/v1/dex/market/rwa/underlying-market': { binanceChainId: '56', tokenContractAddress: token, statusInfo: status },
    '/api/v1/dex/balance/all-token-balances-by-address': [{ tokenAssets: [{ binanceChainId: '56', tokenContractAddress: token, address: wallet, rawBalance: '200', isRiskToken: false }] }],
    '/api/v1/dex/aggregator/quote': [{ binanceChainId: '56', executionMode: 'RFQ', fromTokenAmount: '100', toTokenAmount: '25000000000000000000', quoteId: 'fixture-quote', vendorName: 'PcsXRfq', fromToken: { tokenContractAddress: token }, toToken: { tokenContractAddress: BSC_USDT } }],
    '/api/v1/dex/aggregator/swap': rfq,
    ...overrides
  };
  const reader: Reader = { async get(endpoint) {
    calls.push(endpoint);
    return { data: data[endpoint], timestamp: Date.now() - (staleQuote && endpoint.endsWith('/quote') ? 21000 : 0), responseHash: 'a'.repeat(64), latencyMs: 1 };
  } };
  return { reader, calls };
}

test('missing config produces blocked report without network calls', async () => {
  const f = fixtures(); const report = await runFeasibility({}, f.reader);
  assert.equal(report.status, 'blocked'); assert.equal(report.error?.code, 'CONFIG_MISSING'); assert.equal(f.calls.length, 0);
});
test('fixture mode is labeled and never presented as live evidence', async () => {
  const f = fixtures(); const report = await runFeasibility(env, f.reader);
  assert.equal(report.status, 'passed'); assert.equal(report.mode, 'TEST_FIXTURE'); assert.equal(report.executionEnabled, false);
  assert.equal(report.checks.length, 6);
  assert.equal(f.calls.length, 6);
  const serialized = JSON.stringify(report);
  for (const sensitive of ['fixture-key', 'fixture-secret', wallet, token, 'fixture-quote', 'typedDataToSign']) assert.ok(!serialized.includes(sensitive));
});
test('stock must exist in the current BSC RWA list', async () => {
  const r = await runFeasibility(env, fixtures({ '/api/v1/dex/market/rwa/tokens': [] }).reader);
  assert.equal(r.error?.code, 'UNSUPPORTED_ASSET');
});
test('empty holdings block before quote', async () => {
  const f = fixtures({ '/api/v1/dex/balance/all-token-balances-by-address': [{ tokenAssets: [] }] });
  const r = await runFeasibility(env, f.reader);
  assert.equal(r.error?.code, 'INSUFFICIENT_POSITION'); assert.ok(!f.calls.some((p) => p.endsWith('/quote')));
});
test('stale quote blocks payload building', async () => {
  const f = fixtures({}, true); const r = await runFeasibility(env, f.reader);
  assert.equal(r.error?.code, 'QUOTE_EXPIRED'); assert.ok(!f.calls.some((p) => p.endsWith('/swap')));
});
test('opaque RFQ data remains blocked', async () => {
  const f = fixtures({ '/api/v1/dex/aggregator/swap': { executionMode: 'RFQ', rfq: { vendor: 'PcsXRfq', typedDataToSign: '0x1901' } } });
  const r = await runFeasibility(env, f.reader); assert.equal(r.error?.code, 'RFQ_OPAQUE'); assert.equal(r.status, 'blocked');
});
test('wrong RFQ domain chain blocks', () => assert.throws(() => inspectRfq({ executionMode: 'RFQ', rfq: { vendor: 'PcsXRfq', typedDataToSign: { ...typed, domain: { ...typed.domain, chainId: 1 } } } })));
test('JSON EIP-712 payload is accepted structurally', () => assert.equal(inspectRfq({ executionMode: 'RFQ', rfq: { vendor: 'PcsXRfq', typedDataToSign: JSON.stringify(typed) } }).typedDataHash.length, 64));
test('missing typed-data fields block', () => assert.throws(() => inspectRfq({ executionMode: 'RFQ', rfq: { vendor: 'PcsXRfq', typedDataToSign: {} } })));
test('unknown vendor blocks', () => assert.throws(() => inspectRfq({ executionMode: 'RFQ', rfq: { vendor: 'Unknown', typedDataToSign: typed } })));
for (const fields of [[], [{ name: 'amount', type: '' }], [{ name: 'missing', type: 'uint256' }], [{ name: 'amount', type: 'uint256' }, { name: 'amount', type: 'uint256' }]]) {
  test(`malformed primary type fields block: ${JSON.stringify(fields)}`, () => assert.throws(() => inspectRfq({ executionMode: 'RFQ', rfq: { vendor: 'PcsXRfq', typedDataToSign: { ...typed, types: { Order: fields } } } })));
}
test('RFQ build query disables approval and fixes protection limits', async () => {
  const f = fixtures();
  const report = await runFeasibility(env, { async get(path, query) {
    if (path.endsWith('/swap')) {
      const params = Object.fromEntries(query ?? []);
      assert.equal(params.approveTransaction, 'false');
      assert.equal(params.autoSlippage, 'false');
      assert.equal(params.slippagePercent, '0.5');
      assert.equal(params.priceImpactProtectionPercent, '0.5');
      assert.equal(params.amount, env.REMAIN_SELL_AMOUNT_RAW);
      assert.equal(params.userWalletAddress, wallet);
    }
    return f.reader.get(path, query);
  } });
  assert.equal(report.status, 'passed');
});

for (const code of ['MARKET_PAUSED', 'MARKET_MAINTENANCE', 'ASSET_PAUSED', 'ASSET_LIMITED', 'UNSUPPORTED', 'UNKNOWN_STATE']) {
  test(`market block ${code}`, () => assert.throws(() => checkMarket({ ...status, reasonCode: code })));
}
test('closed market is readable, not assumed executable', () => assert.doesNotThrow(() => checkMarket({ openState: false, marketStatus: 'closed', reasonCode: 'MARKET_CLOSED' })));
test('missing market state fails closed', () => assert.throws(() => checkMarket({})));

test('catalog status is advisory; fresh selected-stock market data is mandatory', async () => {
  const f = fixtures({ '/api/v1/dex/market/rwa/tokens': [{
    binanceChainId: '56', tokenContractAddress: token, assetType: 1, platformId: 'ondo',
    decimals: 18, tokenSymbol: 'FIXTUREon', underlyingTicker: 'FIXTURE',
    statusInfo: { marketStatus: null, openState: true }
  }] });
  const report = await runFeasibility(env, f.reader);
  assert.equal(report.status, 'passed');
  assert.equal(report.mode, 'TEST_FIXTURE');
  assert.equal(report.executionEnabled, false);
  assert.equal(f.calls[2], '/api/v1/dex/market/rwa/underlying-market');
  assert.ok(f.calls.indexOf('/api/v1/dex/market/rwa/underlying-market') < f.calls.indexOf('/api/v1/dex/aggregator/quote'));
});

for (const decimals of [['18'], { toString: () => '18' }]) {
  test('malformed stock decimals cannot be coerced into an identity', async () => {
    const f = fixtures({ '/api/v1/dex/market/rwa/tokens': [{
      binanceChainId: '56', tokenContractAddress: token, assetType: 1, platformId: 'ondo',
      decimals, tokenSymbol: 'FIXTUREon', underlyingTicker: 'FIXTURE', statusInfo: status
    }] });
    const report = await runFeasibility(env, f.reader);
    assert.equal(report.status, 'blocked');
    assert.equal(report.error?.code, 'UPSTREAM_SCHEMA_INVALID');
    assert.equal(f.calls.length, 2);
  });
}

for (const [freshStatus, code, check] of [
  [null, 'UPSTREAM_SCHEMA_INVALID', 'MARKET_RECORD'],
  [{ openState: true, marketStatus: null }, 'UPSTREAM_SCHEMA_INVALID', 'MARKET_STATUS'],
  [{ openState: true, marketStatus: 1 }, 'UPSTREAM_SCHEMA_INVALID', 'MARKET_STATUS'],
  [{ openState: true, marketStatus: { toString: () => 'regular' } }, 'UPSTREAM_SCHEMA_INVALID', 'MARKET_STATUS'],
  [{ openState: 'true', marketStatus: 'regular' }, 'UPSTREAM_SCHEMA_INVALID', 'MARKET_OPEN_STATE'],
  [{ openState: true, marketStatus: 'unexpected-state' }, 'UPSTREAM_SCHEMA_INVALID', 'MARKET_STATUS'],
  [{ openState: false, marketStatus: 'pause', reasonCode: 'MARKET_PAUSED' }, 'MARKET_BLOCKED', undefined],
  [{ ...status, reasonCode: 'MARKET_MAINTENANCE' }, 'MARKET_BLOCKED', undefined],
  [{ ...status, reasonCode: 'ASSET_LIMITED' }, 'MARKET_BLOCKED', undefined],
  [{ ...status, reasonCode: ['TRADING'] }, 'MARKET_BLOCKED', undefined],
  [{ ...status, reasonCode: { toString: () => 'TRADING' } }, 'MARKET_BLOCKED', undefined]
] as const) {
  test(`fresh market rejection ${code}/${check} stops before wallet, quote or build`, async () => {
    const f = fixtures({ '/api/v1/dex/market/rwa/underlying-market': {
      binanceChainId: '56', tokenContractAddress: token, statusInfo: freshStatus
    } });
    const report = await runFeasibility(env, f.reader);
    assert.equal(report.status, 'blocked');
    assert.equal(report.executionEnabled, false);
    assert.equal(report.error?.code, code);
    assert.equal(report.error?.validationCheck, check);
    assert.equal(f.calls.length, 3);
    assert.ok(!f.calls.some((path) => path.includes('balance') || path.endsWith('/quote') || path.endsWith('/swap')));
    assert.equal(JSON.stringify(report).includes('unexpected-state'), false);
  });
}
test('nonprimitive catalog issuer cannot reach fresh market, wallet or quote', async () => {
  const f = fixtures({ '/api/v1/dex/market/rwa/tokens': [{ binanceChainId: '56', tokenContractAddress: token,
    assetType: 1, platformId: ['ondo'], decimals: 18, tokenSymbol: 'FIXTURE', underlyingTicker: 'FIXTURE' }] });
  const report = await runFeasibility(env, f.reader);
  assert.equal(report.error?.code, 'UNSUPPORTED_ASSET');
  assert.equal(f.calls.length, 2);
});
test('fresh market identity mismatch blocks held-position feasibility before balances or quotes', async () => {
  for (const data of [null, { binanceChainId: '1', tokenContractAddress: token, statusInfo: status },
    { binanceChainId: '56', tokenContractAddress: wallet, statusInfo: status }]) {
    const f = fixtures({ '/api/v1/dex/market/rwa/underlying-market': data });
    const report = await runFeasibility(env, f.reader);
    assert.equal(report.error?.code, 'UPSTREAM_SCHEMA_INVALID');
    assert.equal(report.error?.validationCheck, data === null ? 'MARKET_RESPONSE' : 'MARKET_IDENTITY');
    assert.equal(f.calls.length, 3);
    assert.ok(!f.calls.some((path) => path.includes('balance') || path.endsWith('/quote') || path.endsWith('/swap')));
  }
});
test('malformed address and zero address reject', () => {
  assert.throws(() => address('0x123')); assert.throws(() => address(`0x${'0'.repeat(40)}`));
});
for (const amount of ['-1', '0.1', '01', '1e18', '0', ((1n << 256n)).toString()]) {
  test(`invalid raw amount ${amount.slice(0, 16)}`, () => assert.throws(() => uint(amount, true)));
}
test('wrong output token cannot pass RFQ selection', async () => {
  const f = fixtures({ '/api/v1/dex/aggregator/quote': [{ binanceChainId: '56', executionMode: 'RFQ', fromTokenAmount: '100', fromToken: { tokenContractAddress: token }, toToken: { tokenContractAddress: token } }] });
  const r = await runFeasibility(env, f.reader); assert.equal(r.error?.code, 'RFQ_UNAVAILABLE');
});
test('wrong wallet echo blocks', async () => {
  const f = fixtures({ '/api/v1/dex/balance/all-token-balances-by-address': [{ tokenAssets: [{ binanceChainId: '56', tokenContractAddress: token, address: token, rawBalance: '200', isRiskToken: false }] }] });
  const r = await runFeasibility(env, f.reader); assert.equal(r.error?.code, 'UPSTREAM_SCHEMA_INVALID');
});
