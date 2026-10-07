import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runMarketCheck } from '../src/market-check.ts';
import { RemainError } from '../src/errors.ts';
import type { Reader } from '../src/feasibility.ts';
import type { Query } from '../src/signing.ts';

const token = '0x2222222222222222222222222222222222222222';
const otherToken = '0x3333333333333333333333333333333333333333';
const env = { BINANCE_WEB3_API_KEY: 'fixture-key', BINANCE_WEB3_SECRET_KEY: 'fixture-secret',
  REMAIN_WALLET_ADDRESS: 'never-emit-wallet', REMAIN_RWA_TOKEN_ADDRESS: 'never-emit-held-config', REMAIN_SELL_AMOUNT_RAW: 'never-emit-amount' };
const stock = { binanceChainId: '56', tokenContractAddress: token, assetType: 1, platformId: 'ondo', decimals: '18',
  tokenSymbol: 'FIXTUREon', underlyingTicker: 'FIXTURE', statusInfo: { marketStatus: null, openState: true }, private: 'never-emit-provider-data' };
const market = { binanceChainId: '56', tokenContractAddress: token, statusInfo: { marketStatus: 'regular', openState: true, reasonCode: null }, private: 'never-emit-provider-data' };
function fixture(catalog: unknown = [stock], fresh: unknown = market, timestamps?: [number, number]) {
  const calls: { path: string; query: Query | undefined }[] = [];
  const reader: Reader = { async get(path, query) {
    calls.push({ path, query });
    assert.ok(calls.length <= 2, 'No balance, quote, build or other third request is allowed');
    return { data: calls.length === 1 ? catalog : fresh, timestamp: timestamps?.[calls.length - 1] ?? Date.now(), responseHash: 'a'.repeat(64), latencyMs: 1 };
  } };
  return { reader, calls };
}
function assertPrivate(report: unknown) {
  for (const privateValue of ['fixture-key', 'fixture-secret', 'never-emit-wallet', 'never-emit-held-config', 'never-emit-amount', 'never-emit-provider-data']) {
    assert.equal(JSON.stringify(report).includes(privateValue), false);
  }
}

test('holding-free read uses exactly catalog and fresh selected-token endpoints', async () => {
  const f = fixture();
  const report = await runMarketCheck(env, token.toUpperCase().replace('0X', '0x'), f.reader);
  assert.equal(report.status, 'passed');
  assert.equal(report.mode, 'TEST_FIXTURE');
  assert.equal(report.scope, 'SELECTED_STOCK_MARKET_READ_ONLY');
  assert.equal(report.executionEnabled, false);
  assert.equal(report.liveFeasibility, 'NOT_ESTABLISHED');
  assert.deepEqual(report.token, { chain: '56', tokenAddress: token });
  assert.equal(report.market?.marketStatus, 'regular');
  assert.equal(report.market?.openState, true);
  assert.deepEqual(f.calls, [
    { path: '/api/v1/dex/market/rwa/tokens', query: [['binanceChainId', '56']] },
    { path: '/api/v1/dex/market/rwa/underlying-market', query: [['binanceChainId', '56'], ['tokenContractAddress', token]] }
  ]);
  assertPrivate(report);
});

test('only credentials and explicit selected token are required, no wallet/amount', async () => {
  const f = fixture();
  const report = await runMarketCheck({ BINANCE_WEB3_API_KEY: env.BINANCE_WEB3_API_KEY, BINANCE_WEB3_SECRET_KEY: env.BINANCE_WEB3_SECRET_KEY }, token, f.reader);
  assert.equal(report.status, 'passed');
  assert.equal(f.calls.length, 2);
});

test('missing credentials and invalid selection fail before HTTP', async () => {
  const f = fixture();
  assert.equal((await runMarketCheck({}, token, f.reader)).error?.code, 'CONFIG_MISSING');
  for (const selection of [undefined, null, ['0x' + '2'.repeat(40)], 'AAL', 'https://private.example', '0x' + '0'.repeat(40)]) {
    assert.equal((await runMarketCheck(env, selection, f.reader)).error?.code, 'INVALID_INPUT');
  }
  assert.equal(f.calls.length, 0);
});

for (const issuer of ['unknown', ['ondo'], { toString: () => 'ondo' }]) {
  test('nonprimitive or unsupported issuer cannot pass identity validation', async () => {
    const f = fixture([{ ...stock, platformId: issuer }]);
    const report = await runMarketCheck(env, token, f.reader);
    assert.equal(report.error?.code, 'UNSUPPORTED_ASSET');
    assert.equal(f.calls.length, 1);
    assert.equal(report.market, undefined);
  });
}

test('missing, wrong-chain or nonstock catalog selection stops before fresh read', async () => {
  for (const catalog of [[], [{ ...stock, binanceChainId: '1' }], [{ ...stock, assetType: 2 }]]) {
    const f = fixture(catalog);
    const report = await runMarketCheck(env, token, f.reader);
    assert.equal(report.error?.code, 'UNSUPPORTED_ASSET');
    assert.equal(f.calls.length, 1);
  }
});

for (const [data, check] of [
  [null, 'MARKET_RESPONSE'], [[], 'MARKET_RESPONSE'],
  [{ ...market, binanceChainId: '1' }, 'MARKET_IDENTITY'],
  [{ ...market, binanceChainId: 56 }, 'MARKET_IDENTITY'],
  [{ ...market, tokenContractAddress: otherToken }, 'MARKET_IDENTITY'],
  [{ ...market, tokenContractAddress: 'never-emit-provider-data' }, 'MARKET_IDENTITY'],
  [{ ...market, tokenContractAddress: '0x' + '0'.repeat(40) }, 'MARKET_IDENTITY'],
  [{ ...market, statusInfo: null }, 'MARKET_RECORD'],
  [{ ...market, statusInfo: { openState: true, marketStatus: null } }, 'MARKET_STATUS'],
  [{ ...market, statusInfo: { openState: 'true', marketStatus: 'regular' } }, 'MARKET_OPEN_STATE']
] as const) {
  test(`fresh response failure ${check} remains blocked and safely classified`, async () => {
    const f = fixture([stock], data);
    const report = await runMarketCheck(env, token, f.reader);
    assert.equal(report.status, 'blocked');
    assert.equal(report.error?.code, 'UPSTREAM_SCHEMA_INVALID');
    assert.equal(report.error?.validationCheck, check);
    assert.equal(report.market, undefined);
    assert.equal(f.calls.length, 2);
    assertPrivate(report);
  });
}

for (const status of [
  { marketStatus: 'pause', openState: false, reasonCode: 'MARKET_PAUSED' },
  { ...market.statusInfo, reasonCode: 'MARKET_MAINTENANCE' },
  { ...market.statusInfo, reasonCode: 'ASSET_LIMITED' },
  { ...market.statusInfo, reasonCode: ['TRADING'] },
  { ...market.statusInfo, reasonCode: { toString: () => 'TRADING' } }
]) {
  test('paused, restricted and malformed reason states stay blocked', async () => {
    const f = fixture([stock], { ...market, statusInfo: status });
    const report = await runMarketCheck(env, token, f.reader);
    assert.equal(report.error?.code, 'MARKET_BLOCKED');
    assert.equal(report.market, undefined);
    assert.equal(f.calls.length, 2);
  });
}

test('closed market is readable but establishes no quote or execution permission', async () => {
  const f = fixture([stock], { ...market, statusInfo: { marketStatus: 'closed', openState: false, reasonCode: 'MARKET_CLOSED' } });
  const report = await runMarketCheck(env, token, f.reader);
  assert.equal(report.status, 'passed');
  assert.equal(report.market?.marketStatus, 'closed');
  assert.equal(report.market?.openState, false);
  assert.equal(report.liveFeasibility, 'NOT_ESTABLISHED');
  assert.equal(report.executionEnabled, false);
});

test('stale catalog or fresh market envelope cannot be reported as fresh', async () => {
  for (const [times, count] of [
    [[Date.now() - 70_000, Date.now()], 1], [[Date.now(), Date.now() - 70_000], 2], [[Date.now(), Date.now() + 70_000], 2]
  ] as const) {
    const f = fixture([stock], market, [...times]);
    const report = await runMarketCheck(env, token, f.reader);
    assert.equal(report.error?.code, 'AUTH_CLOCK_DRIFT');
    assert.equal(report.market, undefined);
    assert.equal(f.calls.length, count);
  }
});

test('invalid numeric timestamp is classified before serializing a date', async () => {
  const f = fixture([stock], market, [Date.now(), Infinity]);
  assert.equal((await runMarketCheck(env, token, f.reader)).error?.validationCheck, 'ENVELOPE_TIMESTAMP');
});

test('compliance and arbitrary reader failures stop without follow-up or raw error echo', async () => {
  for (const error of [new RemainError('ACCESS_COMPLIANCE_RESTRICTED', 40304), new Error('never-emit-provider-data')]) {
    let count = 0;
    const report = await runMarketCheck(env, token, { async get() { count++; throw error; } });
    assert.equal(report.status, 'blocked');
    assert.equal(report.observations.length, 1);
    assert.equal(report.observations[0]?.status, 'blocked');
    assert.equal(count, 1);
    assertPrivate(report);
  }
});

test('real client parser is exercised with synthetic fresh-market responses', async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input)); paths.push(url.pathname);
    assert.equal(options?.method, 'GET');
    assert.equal(options?.redirect, 'error');
    assert.equal(url.searchParams.has('userWalletAddress'), false);
    return Response.json({ code: 0, success: true, timestamp: Date.now(), data: paths.length === 1 ? [stock] : market });
  };
  try {
    const report = await runMarketCheck(env, token);
    assert.equal(report.status, 'passed');
    assert.equal(paths.length, 2);
    // Mocked fetch is synthetic evidence even though the real adapter labels
    // its own mode LIVE_READ_ONLY. It never proves successful Binance access.
    assert.equal(report.mode, 'LIVE_READ_ONLY');
    assertPrivate(report);
  } finally { globalThis.fetch = original; }
});

test('market CLI persists a sanitized report without requiring wallet configuration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'remain-market-cli-'));
  const preload = join(directory, 'synthetic-fetch.mjs');
  try {
    writeFileSync(preload, `let calls=0;globalThis.fetch=async()=>Response.json({code:0,success:true,timestamp:Date.now(),data:++calls===1?${JSON.stringify([stock])}:${JSON.stringify(market)}});`);
    const command = resolve('scripts/check-binance-market.ts');
    const result = spawnSync(process.execPath, ['--import', preload, command, token], { cwd: directory, encoding: 'utf8', env: { ...process.env, ...env } });
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.scope, 'SELECTED_STOCK_MARKET_READ_ONLY');
    assert.equal(report.liveFeasibility, 'NOT_ESTABLISHED');
    const persisted = JSON.parse(readFileSync(join(directory, report.evidenceFile), 'utf8'));
    assert.equal(persisted.status, 'passed');
    assertPrivate(persisted);
    const inspect = spawnSync(process.execPath, [resolve('scripts/inspect-binance.ts')], { cwd: directory, encoding: 'utf8' });
    assert.equal(inspect.status, 0);
    assert.equal(JSON.parse(inspect.stdout).kind, 'market');
    assert.equal(JSON.parse(inspect.stdout).liveGate, 'UNVERIFIED');
    for (const args of [[], [token, 'never-emit-provider-data']]) {
      const invalid = spawnSync(process.execPath, ['--import', preload, command, ...args], { cwd: directory, encoding: 'utf8', env: { ...process.env, ...env } });
      assert.equal(invalid.status, 1);
      assert.equal(JSON.parse(invalid.stdout).error.code, 'INVALID_INPUT');
      assert.equal(JSON.parse(invalid.stdout).observations.length, 0);
      assertPrivate(JSON.parse(invalid.stdout));
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
