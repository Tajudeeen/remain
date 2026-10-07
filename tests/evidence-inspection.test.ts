import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { EvidenceInspectionError, inspectEvidence } from '../src/evidence-inspection.ts';

const now = Date.parse('2026-10-07T01:00:00.000Z');
const runId = '00000000-0000-4000-8000-000000000001';
const secondRunId = '00000000-0000-4000-8000-000000000002';
const base = { runId, startedAt: new Date(now).toISOString(), status: 'passed', mode: 'LIVE_READ_ONLY', executionEnabled: false };
const stock = { chain: '56', tokenAddress: '0x2222222222222222222222222222222222222222', marketMetadataStatus: 'readable',
  marketStatus: 'closed', openState: false, marketIssues: [], tokenSymbol: 'private-arbitrary-symbol', privateKey: 'never-emit-secret' };
const catalog = { ...base, scope: 'STOCK_IDENTITY_DISCOVERY_ONLY', unavailableMarketCount: 0, stocks: [stock], notes: ['never-emit-secret'] };
const unknownStock = { ...stock, marketMetadataStatus: 'unavailable', marketStatus: null, openState: null,
  marketIssues: [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'null', extra: 'never-emit-secret' }] };
const smoke = { ...base, checks: ['authenticated_bsc_aggregator', 'supported_bsc_stock_identity', 'market_status_read',
  'wallet_balance_covers_input', 'matching_stock_to_usdt_rfq', 'inspectable_bsc_eip712_structure'],
  observations: [{ private: 'never-emit-secret' }], notes: ['never-emit-secret'] };

test('local evidence projection never certifies the live gate or echoes unknown fields', () => {
  for (const [report, kind] of [[catalog, 'discovery'], [smoke, 'smoke']] as const) {
    const summary = inspectEvidence(report, kind, now);
    assert.equal(summary.liveGate, 'UNVERIFIED');
    assert.equal(summary.source, 'LOCAL_FILE_UNAUTHENTICATED');
    assert.equal(summary.executionEnabled, false);
    assert.equal(summary.reportStatus, 'passed');
    assert.equal(JSON.stringify(summary).includes('never-emit-secret'), false);
    assert.equal(JSON.stringify(summary).includes('private-arbitrary-symbol'), false);
  }
});

test('partial market diagnosis aggregates fixed labels and bounds affected rows', () => {
  const summary = inspectEvidence({ ...catalog, status: 'partial', unavailableMarketCount: 8, stocks: Array(8).fill(unknownStock) }, 'discovery', now);
  assert.ok('stockCount' in summary);
  assert.equal(summary.stockCount, 8);
  assert.equal(summary.unavailableMarketCount, 8);
  assert.deepEqual(summary.issueCounts, { DISCOVERY_MARKET_STATUS: 8 });
  assert.equal(summary.affectedStocks.length, 5);
  assert.equal(summary.omittedAffectedStockCount, 3);
  assert.equal(JSON.stringify(summary).includes('never-emit-secret'), false);
});

test('empty stock coverage and legacy format have explicit next steps', () => {
  assert.equal(inspectEvidence({ ...catalog, stocks: [] }, 'discovery', now).nextStep, 'ASK_BINANCE_ABOUT_EMPTY_BSC_STOCK_CATALOG');
  const legacy = inspectEvidence({ ...base, stocks: [{ private: 'never-emit-secret' }] }, 'discovery', now);
  assert.ok('catalogFormat' in legacy);
  assert.equal(legacy.catalogFormat, 'legacy');
  assert.equal(legacy.nextStep, 'RERUN_CURRENT_DISCOVERY');
});

test('old reports remain historical, never promoted by inspection', () => {
  assert.equal(inspectEvidence(catalog, 'discovery', now + 901_000).freshness, 'historical');
  assert.equal(inspectEvidence(catalog, 'discovery', now + 900_000).freshness, 'recent');
  assert.equal(inspectEvidence({ ...catalog, mode: 'TEST_FIXTURE' }, 'discovery', now).reportedMode, 'TEST_FIXTURE');
});

for (const [code, nextStep] of [
  ['CONFIG_MISSING', 'CHECK_LOCAL_CONFIGURATION'],
  ['AUTH_SIGNATURE_INVALID', 'CHECK_DEVELOPER_PROJECT_AND_SIGNING'],
  ['AUTH_CLOCK_DRIFT', 'CHECK_SYSTEM_CLOCK'],
  ['ACCESS_COMPLIANCE_RESTRICTED', 'STOP_AND_CONTACT_BINANCE_SUPPORT'],
  ['INSUFFICIENT_POSITION', 'CHECK_HELD_STOCK_AND_RAW_AMOUNT'],
  ['MARKET_BLOCKED', 'WAIT_FOR_VERIFIED_MARKET_AVAILABILITY'],
  ['RFQ_OPAQUE', 'ASK_BINANCE_FOR_INSPECTABLE_RFQ_SCHEMA'],
  ['RFQ_UNAVAILABLE', 'CHECK_SUPPORTED_STOCK_TO_USDT_RFQ'],
  ['UPSTREAM_TIMEOUT', 'REVIEW_READ_ONLY_FAILURE']
] as const) {
  test(`fixed action for ${code} ignores raw error messages`, () => {
    const summary = inspectEvidence({ ...base, status: 'blocked', error: { code, message: 'never-emit-secret', upstreamCode: 'never-emit-secret' } }, 'discovery', now);
    assert.equal(summary.nextStep, nextStep);
    assert.equal(JSON.stringify(summary).includes('never-emit-secret'), false);
  });
}

test('blocked schema diagnosis keeps the fixed check, never a raw body', () => {
  const summary = inspectEvidence({ ...base, status: 'blocked', error: { code: 'UPSTREAM_SCHEMA_INVALID', validationCheck: 'DISCOVERY_MARKET_STATUS', body: 'never-emit-secret' } }, 'discovery', now);
  assert.ok('error' in summary);
  assert.deepEqual(summary.error, { code: 'UPSTREAM_SCHEMA_INVALID', validationCheck: 'DISCOVERY_MARKET_STATUS' });
});

for (const report of [
  null, [], { ...catalog, runId: 'never-emit-secret' }, { ...catalog, startedAt: '2026-02-30T01:00:00.000Z' },
  { ...catalog, startedAt: new Date(now + 300_001).toISOString() }, { ...catalog, executionEnabled: true },
  { ...catalog, status: 'never-emit-secret' }, { ...catalog, mode: 'LIVE_EXECUTION' },
  { ...catalog, unavailableMarketCount: 1 }, { ...catalog, status: 'partial' },
  { ...catalog, stocks: [{ ...stock, chain: '1' }] }, { ...catalog, stocks: [{ ...stock, tokenAddress: '0x' + '0'.repeat(40) }] },
  { ...catalog, stocks: [{ ...stock, marketStatus: 'unknown' }] },
  { ...catalog, status: 'partial', unavailableMarketCount: 1, stocks: [{ ...unknownStock, openState: true }] },
  { ...catalog, status: 'partial', unavailableMarketCount: 1, stocks: [{ ...unknownStock, marketIssues: [{ check: 'never-emit-secret', receivedType: 'null' }] }] },
  { ...catalog, status: 'partial', unavailableMarketCount: 1, stocks: [{ ...unknownStock, marketIssues: [{ check: 'DISCOVERY_MARKET_STATUS', receivedType: 'never-emit-secret' }] }] },
  { ...base, status: 'blocked', error: { code: 'never-emit-secret' } },
  { ...base, status: 'blocked', error: { code: 'UPSTREAM_SCHEMA_INVALID', validationCheck: 'never-emit-secret' } },
  { ...base, status: 'blocked', error: { code: 'CONFIG_MISSING', validationCheck: 'DISCOVERY_LIST' } }
]) {
  test('rejects inconsistent or unsafe evidence without echoing its content', () => {
    assert.throws(() => inspectEvidence(report, 'discovery', now), EvidenceInspectionError);
  });
}

test('smoke requires the exact ordered checks and never treats partial as a pass', () => {
  for (const report of [{ ...smoke, checks: [] }, { ...smoke, checks: [...smoke.checks].reverse() }, { ...smoke, status: 'partial' }]) {
    assert.throws(() => inspectEvidence(report, 'smoke', now), EvidenceInspectionError);
  }
});

const cli = resolve('scripts/inspect-binance.ts');
function withDirectory(action: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'remain-evidence-inspection-'));
  mkdirSync(join(directory, 'evidence'));
  try { action(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}
function save(directory: string, report: typeof base & Record<string, unknown>, kind = 'discovery') {
  const path = join(directory, 'evidence', `binance-${kind}-${report.runId}.json`);
  writeFileSync(path, JSON.stringify(report));
  return path;
}
function run(directory: string, args: string[] = []) {
  // No env-file flag, credentials or fetch in the inspector. Poison inherited
  // configuration to ensure it is irrelevant and absent from output.
  return spawnSync(process.execPath, [cli, ...args], { cwd: directory, encoding: 'utf8',
    env: { ...process.env, BINANCE_WEB3_API_KEY: 'never-emit-secret', BINANCE_WEB3_SECRET_KEY: 'never-emit-secret' } });
}

test('CLI selects report time rather than copied file modification time', () => withDirectory((directory) => {
  const old = save(directory, { ...catalog, startedAt: '2020-01-01T00:00:00.000Z' });
  const newer = save(directory, { ...catalog, runId: secondRunId, startedAt: '2021-01-01T00:00:00.000Z' });
  utimesSync(newer, 100, 100);
  utimesSync(old, new Date(), new Date());
  writeFileSync(join(directory, '.env.local'), 'never-emit-secret');
  writeFileSync(join(directory, 'evidence', 'irrelevant.json'), 'invalid ignored content');
  const result = run(directory);
  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.runId, secondRunId);
  assert.equal(summary.freshness, 'historical');
  assert.equal(result.stdout.includes('never-emit-secret'), false);
}));

test('explicit older evidence remains explicit and historical', () => withDirectory((directory) => {
  const path = save(directory, { ...catalog, startedAt: '2020-01-01T00:00:00.000Z' });
  save(directory, { ...catalog, runId: secondRunId, startedAt: '2021-01-01T00:00:00.000Z' });
  const result = run(directory, [path]);
  assert.equal(JSON.parse(result.stdout).runId, runId);
  assert.equal(result.status, 1);
}));

test('CLI preserves partial, blocked and fixture nonzero statuses', () => withDirectory((directory) => {
  for (const report of [
    { ...catalog, mode: 'TEST_FIXTURE' },
    { ...catalog, status: 'partial', unavailableMarketCount: 1, stocks: [unknownStock] },
    { ...base, status: 'blocked', error: { code: 'CONFIG_MISSING' } }
  ]) {
    const path = save(directory, { ...report, startedAt: new Date().toISOString() });
    const result = run(directory, [path]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).liveGate, 'UNVERIFIED');
  }
}));

test('CLI recent passed file exits zero without certifying live truth', () => withDirectory((directory) => {
  save(directory, { ...catalog, startedAt: new Date().toISOString() });
  const result = run(directory);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).liveGate, 'UNVERIFIED');
}));

test('CLI keeps empty and legacy passed catalogs nonzero', () => withDirectory((directory) => {
  for (const report of [{ ...catalog, stocks: [] }, { ...base, stocks: [stock] }]) {
    const path = save(directory, { ...report, startedAt: new Date().toISOString() });
    const result = run(directory, [path]);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).liveGate, 'UNVERIFIED');
  }
}));

test('malformed candidate prevents silently falling back to an older successful report', () => withDirectory((directory) => {
  save(directory, { ...catalog, startedAt: '2020-01-01T00:00:00.000Z' });
  writeFileSync(join(directory, 'evidence', `binance-discovery-${secondRunId}.json`), 'never-emit-secret');
  const result = run(directory);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).code, 'LOCAL_EVIDENCE_INVALID_OR_MISSING');
  assert.equal(result.stdout.includes('never-emit-secret'), false);
}));

test('CLI rejects missing files, arbitrary paths, oversized data and mismatched run identity', () => withDirectory((directory) => {
  assert.equal(run(directory).status, 2);
  writeFileSync(join(directory, '.env.local'), 'never-emit-secret');
  assert.equal(run(directory, ['.env.local']).status, 2);
  const path = save(directory, { ...catalog, startedAt: new Date().toISOString() });
  const name = join(directory, 'evidence', `binance-discovery-${secondRunId}.json`);
  writeFileSync(name, JSON.stringify({ ...catalog, startedAt: new Date().toISOString() }));
  assert.equal(run(directory, [name]).status, 2);
  writeFileSync(name, 'x'.repeat(2 * 1024 * 1024 + 1));
  assert.equal(run(directory, [name]).status, 2);
  assert.equal(run(directory, [path, path]).status, 2);
}));

test('CLI rejects symlink candidates', { skip: process.platform === 'win32' }, () => withDirectory((directory) => {
  const path = save(directory, { ...catalog, startedAt: new Date().toISOString() });
  const link = join(directory, 'evidence', `binance-discovery-${secondRunId}.json`);
  symlinkSync(path, link);
  assert.equal(run(directory, [link]).status, 2);
}));
