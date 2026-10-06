import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverStocks } from '../src/discovery.ts';
import { RemainError, safeError } from '../src/errors.ts';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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
  assert.equal(result.status, 'passed');
  assert.equal(result.scope, 'STOCK_IDENTITY_DISCOVERY_ONLY');
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
  [[{ ...token, decimals: ['18'] }], 'DISCOVERY_DECIMALS']
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

for (const [statusInfo, expected] of [
  [undefined, [{ check: 'DISCOVERY_STATUS', receivedType: 'missing' }]],
  [null, [{ check: 'DISCOVERY_STATUS', receivedType: 'null' }]],
  [[], [{ check: 'DISCOVERY_STATUS', receivedType: 'array' }]],
  [{ openState: true }, [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'missing' }]],
  [{ marketStatus: null, openState: true }, [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'null' }]],
  [{ marketStatus: 1, openState: true }, [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'number' }]],
  [{ marketStatus: false, openState: true }, [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'boolean' }]],
  [{ marketStatus: ['regular'], openState: true }, [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'array' }]],
  [{ marketStatus: { private: 'never-emit' }, openState: true }, [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'object' }]],
  [{ marketStatus: 'secret-unknown-status', openState: true }, [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'string' }]],
  [{ marketStatus: 'regular', openState: 'true' }, [{ check: 'DISCOVERY_OPEN_STATE', receivedType: 'string' }]],
  [{}, [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'missing' }, { check: 'DISCOVERY_OPEN_STATE', receivedType: 'missing' }]]
] as const) {
  test(`catalog preserves identity and unknown market metadata: ${JSON.stringify(expected)}`, async () => {
    const result = await discoverStocks(env, { async get() {
      return { data: [{ ...token, statusInfo }, token], timestamp: Date.now(), responseHash: 'fixture', latencyMs: 1 };
    } });
    assert.equal(result.status, 'partial');
    assert.equal(result.executionEnabled, false);
    assert.equal(result.unavailableMarketCount, 1);
    assert.equal(result.stocks.length, 2);
    assert.equal(result.stocks[0]?.marketMetadataStatus, 'unavailable');
    assert.equal(result.stocks[0]?.marketStatus, null);
    assert.equal(result.stocks[0]?.openState, null);
    assert.deepEqual(result.stocks[0]?.marketIssues, expected);
    assert.equal(result.stocks[1]?.marketMetadataStatus, 'readable');
    assert.equal(result.stocks[1]?.openState, false);
    for (const value of ['never-emit', 'secret-unknown-status', 'do-not-emit', 'fixture-key', 'fixture-secret']) {
      assert.equal(JSON.stringify(result).includes(value), false);
    }
  });
}

test('partial discovery CLI preserves the catalog but exits nonzero', () => {
  const directory = mkdtempSync(join(tmpdir(), 'remain-partial-catalog-'));
  const preload = join(directory, 'fixture-preload.mjs');
  try {
    // This child response is synthetic and its temporary artifact is removed.
    // The real-client mode label does not make this a live API observation.
    writeFileSync(preload, 'globalThis.fetch = async () => Response.json({code:0,success:true,timestamp:Date.now(),data:' +
      JSON.stringify([{ ...token, statusInfo: { marketStatus: null, openState: true } }]) + '});');
    const result = spawnSync(process.execPath, ['--import', preload, resolve('scripts/discover-binance.ts')], {
      cwd: directory, encoding: 'utf8', env: { ...process.env, ...env }
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'partial');
    assert.equal(report.executionEnabled, false);
    assert.equal(report.scope, 'STOCK_IDENTITY_DISCOVERY_ONLY');
    assert.equal(report.stocks.length, 1);
    assert.equal(report.stocks[0].marketStatus, null);
    assert.equal(JSON.parse(readFileSync(join(directory, report.evidenceFile), 'utf8')).status, 'partial');
    assert.equal(result.stdout.includes('fixture-secret'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
