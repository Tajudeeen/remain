import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverStocks } from '../src/discovery.ts';
import { RemainError, safeError } from '../src/errors.ts';

const env = { BINANCE_WEB3_API_KEY: 'fixture-key', BINANCE_WEB3_SECRET_KEY: 'fixture-secret' };
const token = { binanceChainId: '56', assetType: 1, tokenContractAddress: '0x2222222222222222222222222222222222222222', tokenSymbol: 'TEST', underlyingTicker: 'TEST', platformId: 'xstocks', decimals: 18, statusInfo: { marketStatus: 'closed', openState: false }, sensitiveUnknownField: 'do-not-emit' };
test('discovery needs only API credentials and emits public allowlisted fields', async () => {
  const result = await discoverStocks(env, { async get(path, query) {
    assert.equal(path, '/api/v1/dex/market/rwa/tokens');
    assert.deepEqual(query, [['binanceChainId', '56']]);
    return { data: [token, { ...token, assetType: 2 }], timestamp: Date.now(), responseHash: 'fixture-hash', latencyMs: 1 };
  } });
  assert.equal(result.mode, 'TEST_FIXTURE');
  assert.equal(result.executionEnabled, false);
  assert.equal(result.stocks.length, 1);
  assert.equal(JSON.stringify(result).includes('do-not-emit'), false);
  assert.equal(JSON.stringify(result).includes('fixture-key'), false);
});
test('discovery rejects missing credentials before HTTP', async () => {
  await assert.rejects(discoverStocks({}, { async get() { throw new Error('must not call'); } }), (error) => error instanceof RemainError && error.code === 'CONFIG_MISSING');
});
test('discovery rejects malformed token metadata', async () => {
  await assert.rejects(discoverStocks(env, { async get() { return { data: [{ ...token, decimals: 100 }], timestamp: Date.now(), responseHash: 'fixture', latencyMs: 1 }; } }), RemainError);
});

for (const [data, check] of [
  [{ tokens: [token], private: 'never-emit' }, 'DISCOVERY_LIST'],
  [[null], 'DISCOVERY_ROW'],
  [[[]], 'DISCOVERY_ROW'],
  [[{ ...token, tokenSymbol: null }], 'DISCOVERY_SYMBOL'],
  [[{ ...token, underlyingTicker: null }], 'DISCOVERY_TICKER'],
  [[{ ...token, platformId: null }], 'DISCOVERY_ISSUER'],
  [[{ ...token, decimals: 100 }], 'DISCOVERY_DECIMALS'],
  [[{ ...token, tokenContractAddress: 'private-invalid-address' }], 'DISCOVERY_ADDRESS'],
  [[{ ...token, statusInfo: null }], 'DISCOVERY_STATUS'],
  [[{ ...token, statusInfo: [] }], 'DISCOVERY_STATUS'],
  [[{ ...token, statusInfo: { marketStatus: null, openState: false } }], 'DISCOVERY_MARKET_STATUS'],
  [[{ ...token, statusInfo: { marketStatus: 'closed', openState: 'false' } }], 'DISCOVERY_OPEN_STATE']
] as const) {
  test(`discovery identifies ${check} and remains blocked without raw metadata`, async () => {
    await assert.rejects(discoverStocks(env, { async get() {
      return { data, timestamp: Date.now(), responseHash: 'fixture', latencyMs: 1 };
    } }), (error) => {
      const safe = safeError(error);
      assert.equal(safe.code, 'UPSTREAM_SCHEMA_INVALID');
      assert.equal(safe.validationCheck, check);
      for (const forbidden of ['never-emit', 'private-invalid-address', 'fixture-key', 'fixture-secret', 'do-not-emit']) {
        assert.equal(JSON.stringify(safe).includes(forbidden), false);
      }
      return true;
    });
  });
}

test('documented string decimals and envelope pass through the real client parser', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 0, msg: 'success', success: true,
    timestamp: Date.now(), data: [{ ...token, decimals: '18' }] });
  try {
    const result = await discoverStocks(env);
    assert.equal(result.mode, 'LIVE_READ_ONLY');
    assert.equal(result.executionEnabled, false);
    assert.equal(result.stocks[0]?.decimals, 18);
    // A mocked fetch is only fixture test evidence, despite the adapter's mode.
    assert.equal(JSON.stringify(result).includes('do-not-emit'), false);
  } finally { globalThis.fetch = originalFetch; }
});
