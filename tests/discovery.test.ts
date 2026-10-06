import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverStocks } from '../src/discovery.ts';
import { RemainError } from '../src/errors.ts';

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
