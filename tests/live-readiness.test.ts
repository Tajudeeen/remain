import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { contractPins, executionDoctor, rpcPair } from '../src/execution/configuration.ts';
import { executionPreflight } from '../src/execution/preflight.ts';
import { ExecutionStore } from '../src/execution/store.ts';
import { ExecutionEngine } from '../src/execution/engine.ts';
import { backupExecutionJournal, inspectExecutionBackup } from '../src/execution/backup.ts';
import { privateJSON } from '../src/release/private-file.ts';
import { smokeExecutionHost } from '../src/release/execution-smoke.ts';
import { checkLiveEvidence } from '../src/release/live-evidence.ts';
import { assessLiveSubmission, liveSubmissionManifest, publicSourceCheck } from '../src/release/live-submission.ts';
import { createRehearsalServer } from '../src/rehearsal/server.ts';
import { executionFixture, time, stock, txHash } from './fixtures/execution.ts';

async function workspace(t: import('node:test').TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'remain-live-readiness-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
function preflightOptions(f = executionFixture()) {
  return { reader: f.reader, rpcs: [f.rpc, f.rpc] as const, pins: f.pins, maximumStockFeeRaw: '1', mode: 'TEST_FIXTURE' as const, now: () => time };
}
test('read-only preflight validates held quote, build, pinned contracts and signed bounds without exporting authority', async () => {
  const f = executionFixture(), r = await executionPreflight(f.input, preflightOptions(f));
  assert.equal(r.mode, 'TEST_FIXTURE'); assert.equal(r.status, 'COMPATIBLE_OBSERVATION');
  assert.equal(r.liveGate, 'UNVERIFIED'); assert.equal(r.executionEnabled, false);
  for (const secret of [f.wallet, stock, 'typedData', 'rfq-context-id', 'cache-quote', 'balanceRaw', 'orderUid']) assert.equal(JSON.stringify(r).includes(secret), false);
});
test('preflight rejects unsigned economics with hooks, shortfall or fee beyond operator cap', async () => {
  for (const patch of [{ appData: '0x' + '1'.repeat(64) }, { feeAmount: '2' }, { receiver: stock }, { buyAmount: '1' }]) {
    const f = executionFixture(); Object.assign(f.typed.message, patch);
    await assert.rejects(executionPreflight(f.input, preflightOptions(f)));
  }
});
test('preflight rejects changed holdings, missing pins and unsupported selected vendors', async () => {
  const f = executionFixture(); f.flags.stockBalance = 99n;
  await assert.rejects(executionPreflight(f.input, preflightOptions(f)), /POSITION_CHANGED/);
  const other = executionFixture(); await assert.rejects(executionPreflight(other.input, { ...preflightOptions(other), pins: [] }), /CONTRACT_UNVERIFIED/);
  await assert.rejects(executionPreflight({ ...other.input, vendor: 'InchFusion' }, preflightOptions(other)), /VENDOR_PROFILE_UNSUPPORTED/);
});
test('preflight rejects disagreement between RPC balances and stale quote facts', async () => {
  const f = executionFixture(), g = executionFixture(); g.flags.stockBalance = 99n;
  await assert.rejects(executionPreflight(f.input, { ...preflightOptions(f), rpcs: [f.rpc, g.rpc] }), /RPC_DISAGREEMENT/);
  await assert.rejects(executionPreflight(f.input, { ...preflightOptions(f), now: () => time + 30000 }));
});
test('pin configuration rejects duplicates, duplicate JSON keys, missing settlement and hostile objects', () => {
  const f = executionFixture(); assert.deepEqual(contractPins(JSON.stringify(f.pins)), f.pins);
  assert.throws(() => contractPins(JSON.stringify([...f.pins, f.pins[0]])));
  assert.throws(() => contractPins(JSON.stringify(f.pins).replace('"address":', '"address":"' + stock + '","address":')));
  assert.throws(() => contractPins(JSON.stringify(f.pins.slice(0, 3))));
  const pins = structuredClone(f.pins); pins[2]!.address = '0x' + 'a'.repeat(40); assert.throws(() => contractPins(JSON.stringify(pins)));
  assert.throws(() => contractPins('[]' + ' '.repeat(16385)));
});
test('RPC pairs reject shared hostname, HTTP, credentials and fragments without echoing values', () => {
  for (const pair of [['https://rpc.one/a', 'https://rpc.one/b'], ['http://rpc.one', 'https://rpc.two'], ['https://user:secret@rpc.one', 'https://rpc.two'], ['https://rpc.one/#secret', 'https://rpc.two']]) {
    assert.throws(() => rpcPair({ REMAIN_RPC_PRIMARY: pair[0], REMAIN_RPC_SECONDARY: pair[1] }));
  }
  assert.equal(rpcPair({ REMAIN_RPC_PRIMARY: 'https://rpc.one/?key=private', REMAIN_RPC_SECONDARY: 'https://rpc.two' }).length, 2);
});
test('doctor reports only fixed checks and never converts flags into verified live evidence', () => {
  const f = executionFixture(), key = randomBytes(32).toString('hex');
  const env = { BINANCE_WEB3_API_KEY: 'private-a', BINANCE_WEB3_SECRET_KEY: 'private-b', REMAIN_RPC_PRIMARY: 'https://rpc.one/?key=private', REMAIN_RPC_SECONDARY: 'https://rpc.two',
    REMAIN_STORAGE_KEY: key, REMAIN_CONTRACT_PINS: JSON.stringify(f.pins), REMAIN_MAXIMUM_STOCK_FEE_RAW: '1', REMAIN_EXECUTION_ORIGIN: 'https://remain.example',
    REMAIN_EXECUTION_DB: '/private/state.sqlite', HOST: '0.0.0.0', REMAIN_ALLOWED_HOSTS: 'remain.example', REMAIN_EXECUTION_ENABLED: 'false',
    REMAIN_NODE_IMAGE: 'node:24-bookworm-slim@sha256:' + 'a'.repeat(64), REMAIN_CADDY_IMAGE: 'caddy:2.10.2-alpine@sha256:' + 'b'.repeat(64), REMAIN_BUILD_SHA: 'a'.repeat(40) };
  const r = executionDoctor(env); assert.equal(r.status, 'CONFIGURED'); assert.equal(r.activationRequested, false); assert.equal(r.liveGate, 'UNVERIFIED');
  for (const s of ['private-a', 'private-b', key, '/private/state.sqlite', f.wallet, 'rpc.one']) assert.equal(JSON.stringify(r).includes(s), false);
  for (const patch of [{ REMAIN_LOCAL_READ_ONLY: 'true' }, { REMAIN_ALLOWED_HOSTS: 'wrong.example' }, { REMAIN_EXECUTION_ORIGIN: 'http://remain.example' }, { REMAIN_EXECUTION_ENABLED: 'TRUE' }, { REMAIN_EXECUTION_ENABLED: 'true', REMAIN_COW_PROFILE_REVIEWED: 'false' }, { REMAIN_NODE_IMAGE: 'node:24-bookworm-slim' }, { REMAIN_CADDY_IMAGE: 'caddy:latest' }, { REMAIN_BUILD_SHA: 'unknown' }]) assert.equal(executionDoctor({ ...env, ...patch }).status, 'BLOCKED');
  assert.equal(executionDoctor({}).status, 'BLOCKED');
});
test('private JSON rejects duplicate keys, oversized data, public permissions and symlinks', async t => {
  const dir = await workspace(t), file = join(dir, 'private.json');
  await writeFile(file, '{"ok":true}', { mode: 0o600 }); assert.equal((await privateJSON(file) as { ok: boolean }).ok, true);
  await writeFile(file, '{"ok":true,"ok":false}'); await assert.rejects(privateJSON(file));
  await writeFile(file, ' '.repeat(262145)); await assert.rejects(privateJSON(file));
  await writeFile(file, '{}'); await chmod(file, 0o644); await assert.rejects(privateJSON(file)); await chmod(file, 0o600);
  const link = join(dir, 'link.json'); await symlink(file, link); await assert.rejects(privateJSON(link));
  const alias = join(dir, 'alias'); await symlink(dir, alias); await assert.rejects(privateJSON(join(alias, 'private.json')));
});
async function journal(t: import('node:test').TestContext) {
  const dir = await workspace(t), file = join(dir, 'orders.sqlite'), key = randomBytes(32).toString('hex'), f = executionFixture();
  const store = new ExecutionStore(file, key); t.after(() => store.close());
  const engine = new ExecutionEngine({ ...preflightOptions(f), store, mode: 'TEST_FIXTURE', vendor: { async submit() { throw new Error('uncertain'); }, async status() { throw new Error(); } } });
  const order = await engine.prepare(f.wallet, f.input);
  await engine.signing(f.wallet, order.id); // WAL contains potentially escaped authority.
  return { dir, file, key, f, store, order, engine };
}
test('SQLite backup includes committed WAL and preserves potentially signed authority across recovery', async t => {
  const s = await journal(t), dest = join(s.dir, 'backup.sqlite');
  const r = await backupExecutionJournal(s.file, dest, s.key);
  assert.equal(r.records, 1); assert.equal(r.activeLocks, 1); assert.equal(r.unresolvedRecords, 1); assert.equal(r.keyAuthenticated, true);
  const reopened = new ExecutionStore(dest, s.key); t.after(() => reopened.close());
  const restored = reopened.get(s.order.id, s.f.wallet); assert.equal(restored.signaturePrompted, true); assert.equal(restored.state, 'PREPARED');
  assert.equal(restored.auth.orderUid, s.order.auth.orderUid); assert.deepEqual(restored, s.store.get(s.order.id, s.f.wallet));
  const bytes = await readFile(dest); for (const hidden of [s.f.wallet, 'rfq-context-id', 'Gnosis Protocol']) assert.equal(bytes.includes(Buffer.from(hidden)), false);
});
test('journal backup and drill reject a wrong key and leave destination absent', async t => {
  const s = await journal(t), dest = join(s.dir, 'backup.sqlite');
  await assert.rejects(backupExecutionJournal(s.file, dest, randomBytes(32).toString('hex')));
  await assert.rejects(readFile(dest)); await assert.rejects(inspectExecutionBackup(s.file, randomBytes(32).toString('hex')));
});
test('backup preserves an uncertain one-attempt submission and its encrypted signature without enabling replay', async t => {
  const s = await journal(t);
  await s.engine.sign(s.f.wallet, s.order.id, await s.f.account.signTypedData(s.f.typed as Parameters<typeof s.f.account.signTypedData>[0]));
  const signedBackup = join(s.dir, 'signed.sqlite');
  const signed = await backupExecutionJournal(s.file, signedBackup, s.key); assert.equal(signed.unresolvedRecords, 1);
  await s.engine.submit(s.f.wallet, s.order.id);
  const original = s.store.get(s.order.id, s.f.wallet); assert.equal(original.state, 'UNKNOWN'); assert.equal(original.attempts, 1);
  const dest = join(s.dir, 'uncertain.sqlite'); await backupExecutionJournal(s.file, dest, s.key);
  const restored = new ExecutionStore(dest, s.key); t.after(() => restored.close());
  assert.deepEqual(restored.get(s.order.id, s.f.wallet), original);
  const bytes = await readFile(dest); assert.equal(bytes.includes(Buffer.from(original.signature!)), false);
  await assert.rejects(s.engine.submit(s.f.wallet, s.order.id), /STATE_CONFLICT/);
});
test('backup cannot replace an existing file, alias a journal or use a public backup directory', async t => {
  const s = await journal(t), dest = join(s.dir, 'existing.sqlite'); await writeFile(dest, 'preserve', { mode: 0o600 });
  await assert.rejects(backupExecutionJournal(s.file, dest, s.key)); assert.equal(await readFile(dest, 'utf8'), 'preserve');
  await assert.rejects(backupExecutionJournal(s.file, s.file, s.key));
  const alias = join(s.dir, 'alias.sqlite'); await symlink(s.file, alias); await assert.rejects(inspectExecutionBackup(alias, s.key));
  const folder = join(s.dir, 'public'); await mkdir(folder, { mode: 0o755 }); await assert.rejects(backupExecutionJournal(s.file, join(folder, 'backup.sqlite'), s.key));
});
test('drill detects tampered indexes even when SQLite integrity is valid', async t => {
  const s = await journal(t); const db = new DatabaseSync(s.file); db.prepare('UPDATE execution_orders SET active=0').run(); db.close();
  await assert.rejects(inspectExecutionBackup(s.file, s.key), /STORAGE_CORRUPT/);
});
const sha = 'a'.repeat(40);
function fakeHost(change?: (value: Record<string, unknown>, path: string) => void, calls: string[] = []) {
  return (async (url, init) => {
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error'); const path = new URL(String(url)).pathname; calls.push(path);
    const value = path === '/healthz' ? { status: 'ok', service: 'remain-rehearsal', mode: 'TEST_FIXTURE', executionEnabled: false, liveGate: 'BLOCKED', buildSha: sha } :
      { kind: 'REMAIN_EXECUTION_STATUS', available: false, profile: 'COW_BSC_SELL_V1', userConfirmationRequired: true };
    change?.(value, path); return new Response(JSON.stringify(value), { headers: { 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'x-frame-options': 'DENY' } });
  }) as typeof fetch;
}
test('host smoke uses only public GETs and requires exact build and execution availability', async () => {
  const calls: string[] = [], r = await smokeExecutionHost('https://remain.example', sha, 'disabled', fakeHost(undefined, calls));
  assert.equal(r.status, 'PASS'); assert.equal(r.liveGate, 'UNVERIFIED'); assert.deepEqual(calls, ['/healthz', '/api/execution/status']);
  await assert.rejects(smokeExecutionHost('https://remain.example', 'b'.repeat(40), 'disabled', fakeHost()), /HOST_BUILD_MISMATCH/);
  await assert.rejects(smokeExecutionHost('https://remain.example', sha, 'enabled', fakeHost()), /HOST_EXECUTION_MISMATCH/);
});
test('host smoke rejects hostile URLs, schema drift, missing security headers and wallet-free confirmations', async () => {
  for (const origin of ['http://remain.example', 'https://user:secret@remain.example', 'https://remain.example/path', 'https://remain.example/?key=secret']) await assert.rejects(smokeExecutionHost(origin, sha, 'disabled', fakeHost()));
  await assert.rejects(smokeExecutionHost('https://remain.example', sha, 'disabled', fakeHost(v => { v.extra = true; })));
  await assert.rejects(smokeExecutionHost('https://remain.example', sha, 'disabled', (async () => new Response('{}')) as typeof fetch));
  await assert.rejects(smokeExecutionHost('https://remain.example', sha, 'disabled', fakeHost((v, p) => { if (p !== '/healthz') v.userConfirmationRequired = false; })));
});
test('host smoke verifies the actual Node HTTP surface while execution stays disabled', async t => {
  const server = createRehearsalServer({ buildSha: sha }); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve()))); const bound = server.address(); assert.ok(bound && typeof bound !== 'string');
  const report = await smokeExecutionHost('http://127.0.0.1:' + bound.port, sha, 'disabled'); assert.equal(report.status, 'PASS');
});
test('live evidence rejects fixture labels before contacting a provider', async () => {
  const f = executionFixture(); let calls = 0;
  await assert.rejects(checkLiveEvidence({ mode: 'TEST_FIXTURE' }, { ...preflightOptions(f), reader: { async get() { calls++; throw new Error(); } } }), /RECEIPT_MODE_INVALID/);
  assert.equal(calls, 0);
});
test('live evidence rechecks catalog and chain instead of trusting downloaded success', async t => {
  const s = await journal(t); s.f.flags.settled = true; s.f.flags.orderUid = s.order.auth.orderUid;
  await s.engine.recoverSettlement(s.f.wallet, s.order.id, txHash);
  const receipt = s.engine.receipt(s.f.wallet, s.order.id);
  // Fictional transport is deliberately injected only in tests. This exercises
  // rejection logic, not an assertion of mainnet execution.
  const r = await checkLiveEvidence({ ...receipt, mode: 'LIVE_EXECUTION' }, preflightOptions(s.f));
  assert.equal(r.technicalStatus, 'SETTLEMENT_RECHECKED'); assert.equal(r.submissionStatus, 'BLOCKED');
  for (const value of [s.f.wallet, stock, txHash, 'typedData', 'cashReceivedRaw']) assert.equal(JSON.stringify(r).includes(value), false);
  s.f.flags.shortfall = true; assert.equal((await checkLiveEvidence({ ...receipt, mode: 'LIVE_EXECUTION' }, preflightOptions(s.f))).technicalStatus, 'BLOCKED');
  s.f.flags.shortfall = false; s.f.flags.reorg = true; await assert.rejects(checkLiveEvidence({ ...receipt, mode: 'LIVE_EXECUTION' }, preflightOptions(s.f)));
});
test('live evidence rejects a forged stock identity, pin mismatch and stale catalog', async t => {
  const s = await journal(t), receipt = { ...s.engine.receipt(s.f.wallet, s.order.id), mode: 'LIVE_EXECUTION' };
  await assert.rejects(checkLiveEvidence(receipt, { ...preflightOptions(s.f), pins: [] }), /CONTRACT_UNVERIFIED/);
  await assert.rejects(checkLiveEvidence(receipt, { ...preflightOptions(s.f), now: () => time + 15001 }), /CATALOG_UNVERIFIED/);
  await assert.rejects(checkLiveEvidence(receipt, { ...preflightOptions(s.f), reader: { async get() { return { data: [], timestamp: time, responseHash: 'fixture', latencyMs: 0 }; } } }), /CATALOG_UNVERIFIED/);
});
function manifest() {
  return { kind: 'REMAIN_LIVE_SUBMISSION_V1', deploymentOrigin: 'https://remain.example', buildSha: sha,
    receiptPath: 'state/private-receipt.json', ownerReportPath: 'state/owner-report.txt',
    ownerAssertions: { registrationConfirmed: true, eligibilityConfirmed: true, ownerAuthorshipConfirmed: true, publicReleaseApproved: true, contractSourcesReviewed: true, independentRpcOperatorsConfirmed: true } };
}
test('owner declarations cannot bypass missing technical settlement evidence', async () => {
  let downstream = 0;
  const report = await assessLiveSubmission(manifest(), { settlement: async () => ({ technicalStatus: 'BLOCKED' }),
    host: async () => { downstream++; return { status: 'PASS' }; }, source: async () => { downstream++; return true; }, ownerReport: async () => { downstream++; return true; } });
  assert.equal(report.submissionStatus, 'BLOCKED'); assert.equal(downstream, 0); assert.equal(report.automaticApproval, false);
});
test('live submission checks source and owner report separately, and never submits or publishes', async () => {
  const checks = { settlement: async () => ({ technicalStatus: 'SETTLEMENT_RECHECKED' }), host: async () => ({ status: 'PASS' }), source: async () => true, ownerReport: async () => true };
  const reviewed = await assessLiveSubmission(manifest(), checks); assert.equal(reviewed.submissionStatus, 'READY_FOR_OWNER_REVIEW');
  assert.equal(reviewed.publicationPerformed, false); assert.equal(reviewed.submissionPerformed, false);
  assert.equal((await assessLiveSubmission(manifest(), { ...checks, source: async () => false })).submissionStatus, 'BLOCKED');
  assert.equal((await assessLiveSubmission(manifest(), { ...checks, ownerReport: async () => false })).submissionStatus, 'BLOCKED');
  const input = manifest(); input.ownerAssertions.ownerAuthorshipConfirmed = false;
  assert.equal((await assessLiveSubmission(input, checks)).submissionStatus, 'BLOCKED');
  assert.ok(reviewed.ownerAssertions.every(a => a.trust === 'OWNER_ASSERTION_NOT_INDEPENDENTLY_VERIFIED'));
});
test('malformed live manifests and mismatched public source commits fail closed', async () => {
  for (const patch of [{ kind: 'TEST_FIXTURE' }, { buildSha: 'unknown' }, { deploymentOrigin: 'http://remain.example' }, { extra: true }, { ownerReportPath: 'state/private-receipt.json' }]) assert.throws(() => liveSubmissionManifest({ ...manifest(), ...patch }));
  const calls: string[] = [];
  const source = (privateRepo: boolean, commit: string) => (async (url, init) => {
    assert.equal(init?.method, 'GET'); assert.equal(init?.credentials, 'omit'); calls.push(String(url));
    return new Response(JSON.stringify(String(url).endsWith('/' + sha) ? { sha: commit } : { full_name: 'Tajudeeen/remain', visibility: privateRepo ? 'private' : 'public', private: privateRepo, archived: false }));
  }) as typeof fetch;
  assert.equal(await publicSourceCheck(sha, source(false, sha)), true); assert.equal(calls.length, 2);
  assert.equal(await publicSourceCheck(sha, source(true, sha)), false);
  assert.equal(await publicSourceCheck(sha, source(false, 'b'.repeat(40))), false);
});
