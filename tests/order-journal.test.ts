import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, statSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { bindFixturePlan, normalizeBinding, type OrderBinding } from '../src/orders/model.ts';
import { FixtureOrderJournal, recoveryAdvice, type OrderEvent } from '../src/orders/journal.ts';
import { reconcileFixture, type SettlementEvidence } from '../src/orders/settlement.ts';
import { rehearsePlan } from '../src/rehearsal/plan.ts';

const wallet = '0x1111111111111111111111111111111111111111'; const stock = '0x2222222222222222222222222222222222222222';
const venue = '0x3333333333333333333333333333333333333333'; const cash = '0x55d398326f99059ff775485246999027b3197955';
const h = (digit: string) => `0x${digit.repeat(64)}`;
function binding(): OrderBinding {
  return normalizeBinding({ version: 1, mode: 'TEST_FIXTURE', executionEnabled: false, planHash: 'a'.repeat(64), wallet, stockToken: stock, cashToken: cash, chain: '56', vendor: 'PcsXRfq', planningQuoteId: 'synthetic-25', createdAtMs: 1000, expiresAtMs: 31000, stockBalanceRaw: '100', stockDebitRaw: '25', floorRaw: '70', cashTargetRaw: '25', minimumNetCashRaw: '25' });
}
function evidence(): SettlementEvidence {
  return { mode: 'TEST_FIXTURE', chain: '56', wallet, stockToken: stock, cashToken: cash, orderId: 'fixture-order', txHash: h('1'), receiptStatus: 'SUCCESS', blockNumber: '100', blockHash: h('2'), parentHash: h('3'), canonicalHash: h('2'), headNumber: '111', confirmationsRequired: 12, before: { blockNumber: '99', blockHash: h('3'), stockRaw: '100', cashRaw: '10' }, after: { blockNumber: '100', blockHash: h('2'), stockRaw: '75', cashRaw: '35' }, completeBlockTransfers: true,
    transfers: [{ token: stock, from: wallet, to: venue, amountRaw: '25', txHash: h('1'), logIndex: 0, removed: false }, { token: cash, from: venue, to: wallet, amountRaw: '25', txHash: h('1'), logIndex: 1, removed: false }] };
}
const ev = (type: 'ATTEMPT_REHEARSAL' | 'OUTCOME_UNKNOWN' | 'CANCEL_REQUESTED', atMs = 1001): OrderEvent => ({ type, eventId: randomUUID(), atMs });
const observed = (status: 'PENDING_VENDOR' | 'PENDING_ONCHAIN' | 'FILLED' | 'FAILED' | 'EXPIRED' | 'CANCELLED', atMs = 1002): Extract<OrderEvent, { type: 'OBSERVE' }> => ({ type: 'OBSERVE', eventId: randomUUID(), atMs, status, platformOrderId: 'fixture-order', txHash: status === 'FILLED' ? h('1') : null });
function sandbox(t: test.TestContext) {
  const folder = mkdtempSync(join(tmpdir(), 'remain-orders-')); const file = join(folder, 'private', 'journal.sqlite');
  t.after(() => rmSync(folder, { recursive: true, force: true })); return { folder, file };
}
function setup(t: test.TestContext) {
  const paths = sandbox(t); const journal = new FixtureOrderJournal(paths.file); const id = randomUUID();
  journal.reserve(id, binding()); t.after(() => journal.close()); return { ...paths, journal, id };
}
function worker(mode: string, file: string, inputFile: string): Promise<{ output: string; signal: string | null }> {
  return new Promise((resolve, reject) => execFile(process.execPath, [fileURLToPath(new URL('./helpers/order-worker.ts', import.meta.url)), mode, file, inputFile], { timeout: 15000 }, (error, stdout) => {
    if (error && error.code !== 2 && error.signal !== 'SIGKILL') reject(error);
    else resolve({ output: stdout, signal: error?.signal ?? null });
  }));
}
test('only a fresh passing fixture plan binds, with current recomputed amounts', async () => {
  const { plan } = await rehearsePlan({ cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false });
  const b = bindFixturePlan(plan, plan.evaluatedAtMs); assert.equal(b.stockDebitRaw, '25'); assert.equal(b.floorRaw, '70');
  assert.throws(() => bindFixturePlan(plan, plan.evaluatedAtMs + 16000), /INVALID_ORDER/);
  assert.throws(() => bindFixturePlan({ ...plan, mode: 'LIVE_READ_ONLY' }, plan.evaluatedAtMs), /INVALID_ORDER/);
  assert.throws(() => bindFixturePlan({ ...plan, planHash: 'b'.repeat(64) }, plan.evaluatedAtMs), /INVALID_ORDER/);
});
for (const [name, patch] of Object.entries({ live: { mode: 'LIVE_READ_ONLY' }, execution: { executionEnabled: true }, zeroWallet: { wallet: `0x${'0'.repeat(40)}` }, chain: { chain: '1' }, stockIsCash: { stockToken: cash }, floor: { floorRaw: '76' }, shortfall: { minimumNetCashRaw: '24' }, negative: { stockDebitRaw: '-1' }, overflow: { stockBalanceRaw: (1n << 256n).toString() }, expiry: { expiresAtMs: 1000 }, extra: { signature: 'forbidden' } })) {
  test(`binding rejects ${name}`, () => assert.throws(() => normalizeBinding({ ...binding(), ...patch }), /INVALID_ORDER/));
}
test('durable request ID and binding survive restart; identical reserves are idempotent', (t) => {
  const { file } = sandbox(t); const id = randomUUID(); let j = new FixtureOrderJournal(file);
  const first = j.reserve(id, binding()); const attempt = ev('ATTEMPT_REHEARSAL'); j.append(id, 0, attempt); j.close();
  j = new FixtureOrderJournal(file); t.after(() => j.close());
  assert.equal(j.reserve(id, binding()).revision, 1); assert.deepEqual(j.get(id).binding, first.binding);
  assert.equal(j.append(id, 0, attempt).revision, 1);
  assert.equal(recoveryAdvice(j.get(id), 1002).requestId, id);
  assert.throws(() => j.reserve(id, { ...binding(), floorRaw: '71' }), /REQUEST_CONFLICT/);
  assert.throws(() => j.reserve(randomUUID(), binding()), /REQUEST_CONFLICT/);
  assert.throws(() => j.append(id, 1, { ...attempt, atMs: 1002 }), /REQUEST_CONFLICT/);
});
test('revision conflict rolls back and copied snapshots cannot mutate storage', (t) => {
  const { journal: j, id } = setup(t); j.append(id, 0, ev('ATTEMPT_REHEARSAL'));
  assert.throws(() => j.append(id, 0, observed('PENDING_VENDOR')), /REVISION_CONFLICT/);
  const snapshot = j.get(id); snapshot.revision = 500; assert.equal(j.get(id).revision, 1);
  assert.throws(() => j.append(id, 1, ev('OUTCOME_UNKNOWN', 1000)), /INVALID_TRANSITION/);
  assert.equal(j.get(id).revision, 1);
});
test('timeouts, elapsed quote and cancellation intent never assert a terminal outcome', (t) => {
  const { journal: j, id } = setup(t); j.append(id, 0, ev('ATTEMPT_REHEARSAL'));
  j.append(id, 1, ev('OUTCOME_UNKNOWN', 1002)); j.append(id, 2, ev('CANCEL_REQUESTED', 1003));
  let s = j.get(id); assert.equal(s.providerStatus, null); assert.equal(s.cancelRequested, true);
  assert.equal(recoveryAdvice(s, 1001 + 1800000).action, 'INVESTIGATE_DEDUPLICATION_WINDOW_ELAPSED');
  assert.equal(recoveryAdvice(s, 31001).action, 'RECOVER_STATUS_WITH_EXISTING_ID');
  j.append(id, 3, observed('FILLED', 40000)); s = j.get(id);
  assert.equal(s.providerStatus, 'FILLED'); assert.equal(s.settlement, null);
  assert.equal(recoveryAdvice(s, 40000).action, 'RECONCILE_OR_INVESTIGATE');
});
for (const status of ['FAILED', 'EXPIRED', 'CANCELLED'] as const) test(`${status} requires observation and prevents terminal regression`, (t) => {
  const { journal: j, id } = setup(t); j.append(id, 0, ev('ATTEMPT_REHEARSAL')); j.append(id, 1, observed(status));
  assert.throws(() => j.append(id, 2, observed('FILLED', 1003)), /INVALID_TRANSITION/);
  assert.throws(() => j.append(id, 2, ev('OUTCOME_UNKNOWN', 1003)), /INVALID_TRANSITION/);
  assert.equal(recoveryAdvice(j.get(id), 1003).action, 'RETAIN_TERMINAL_RECORD');
});
test('status binds order identity, transaction and state direction', (t) => {
  const { journal: j, id } = setup(t);
  assert.throws(() => j.append(id, 0, observed('FILLED')), /INVALID_TRANSITION/);
  j.append(id, 0, ev('ATTEMPT_REHEARSAL')); j.append(id, 1, observed('PENDING_ONCHAIN'));
  assert.throws(() => j.append(id, 2, observed('PENDING_VENDOR', 1003)), /INVALID_TRANSITION/);
  assert.throws(() => j.append(id, 2, { ...observed('FILLED', 1003), platformOrderId: 'other' }), /INVALID_TRANSITION/);
  j.append(id, 2, observed('FILLED', 1003));
  assert.throws(() => j.append(id, 3, { ...observed('FILLED', 1004), txHash: h('4') }), /INVALID_TRANSITION/);
  assert.throws(() => j.append(id, 3, ev('CANCEL_REQUESTED', 1004)), /INVALID_TRANSITION/);
});
test('reconciliation waits for confirmations and a later reorg revokes the fixture match', (t) => {
  const { journal: j, id } = setup(t); j.append(id, 0, ev('ATTEMPT_REHEARSAL')); j.append(id, 1, observed('FILLED'));
  const reconcile = (e: SettlementEvidence, atMs: number): OrderEvent => ({ type: 'RECONCILE', eventId: randomUUID(), atMs, evidence: e });
  assert.equal(j.append(id, 2, reconcile({ ...evidence(), headNumber: '110' }, 1003)).settlement!.status, 'WAITING');
  assert.equal(j.append(id, 3, reconcile(evidence(), 1004)).settlement!.status, 'MATCHED_FIXTURE');
  assert.equal(recoveryAdvice(j.get(id), 1004).action, 'RECHECK_CANONICAL_SETTLEMENT');
  assert.equal(j.append(id, 4, reconcile({ ...evidence(), canonicalHash: h('5') }, 1005)).settlement!.status, 'MISMATCH');
  assert.equal(j.get(id).executionEnabled, false);
});
test('fresh attempt cannot be repeated or initiated after quote expiry', (t) => {
  const { journal: j, id } = setup(t);
  assert.throws(() => j.append(id, 0, ev('ATTEMPT_REHEARSAL', 31000)), /INVALID_TRANSITION/);
  j.append(id, 0, ev('ATTEMPT_REHEARSAL'));
  assert.throws(() => j.append(id, 1, ev('ATTEMPT_REHEARSAL', 1002)), /INVALID_TRANSITION/);
});
test('a reconciliation event requires a reported fill; pending states remain unresolved', (t) => {
  const { journal: j, id } = setup(t);
  const e: OrderEvent = { type: 'RECONCILE', eventId: randomUUID(), atMs: 1003, evidence: evidence() };
  assert.throws(() => j.append(id, 0, e), /INVALID_TRANSITION/);
  assert.equal(recoveryAdvice(j.get(id), 1000).action, 'NO_SUBMISSION_ENABLED');
  j.append(id, 0, ev('ATTEMPT_REHEARSAL')); j.append(id, 1, observed('PENDING_VENDOR'));
  assert.throws(() => j.append(id, 2, e), /INVALID_TRANSITION/);
  j.append(id, 2, ev('OUTCOME_UNKNOWN', 1003)); assert.equal(j.get(id).providerStatus, 'PENDING_VENDOR');
  assert.equal(j.get(id).outcomeUnknown, true);
});
test('invalid events, missing orders and unexpected fields fail closed', (t) => {
  const { journal: j, id } = setup(t);
  assert.throws(() => j.get(randomUUID()), /ORDER_MISSING/);
  assert.throws(() => j.get('not-a-uuid'), /INVALID_ORDER/);
  for (const value of [null, { ...ev('ATTEMPT_REHEARSAL'), signature: 'no' }, { ...observed('FILLED'), txHash: null }, { ...observed('PENDING_VENDOR'), txHash: h('1') }, { ...observed('FILLED'), status: 'PARTIALLY_FILLED' }, { ...ev('ATTEMPT_REHEARSAL'), atMs: NaN }]) {
    assert.throws(() => j.append(id, 0, value as OrderEvent), /INVALID_EVENT/);
  }
  assert.throws(() => j.append(id, -1, ev('ATTEMPT_REHEARSAL')), /INVALID_EVENT/);
  assert.throws(() => recoveryAdvice(j.get(id), 999), /INVALID_ORDER/);
});
for (const [name, sql] of Object.entries({ binding: "UPDATE orders SET binding_json='{}'", changedHash: "UPDATE orders SET binding_hash='changed'", event: "UPDATE events SET payload='{}'", eventHash: "UPDATE events SET event_hash='changed'", deletion: 'DELETE FROM events', ordering: 'UPDATE events SET sequence=4', head: 'UPDATE orders SET revision=0' })) {
  test(`persisted ${name} tampering is detected`, (t) => {
    const { journal: j, id, file } = setup(t); j.append(id, 0, ev('ATTEMPT_REHEARSAL'));
    const db = new DatabaseSync(file); db.exec(sql); db.close();
    assert.throws(() => j.get(id), /JOURNAL_CORRUPT/);
  });
}
test('two processes appending the same revision produce one durable winner', async (t) => {
  const { file, folder, journal: j, id } = setup(t);
  const inputs = [0, 1].map((i) => { const f = join(folder, `input-${i}.json`); writeFileSync(f, JSON.stringify({ requestId: id, event: ev('ATTEMPT_REHEARSAL') })); return f; });
  const results = await Promise.all(inputs.map((f) => worker('append', file, f)));
  assert.deepEqual(results.map((r) => r.output).sort(), ['OK', 'REVISION_CONFLICT']); assert.equal(j.get(id).revision, 1);
});
test('two processes cannot reserve the same plan under different IDs', async (t) => {
  const { file, folder } = sandbox(t); const bootstrap = new FixtureOrderJournal(file); bootstrap.close();
  const inputs = [0, 1].map((i) => { const f = join(folder, `input-${i}.json`); writeFileSync(f, JSON.stringify({ requestId: randomUUID(), binding: binding() })); return f; });
  const results = await Promise.all(inputs.map((f) => worker('reserve', file, f)));
  assert.deepEqual(results.map((r) => r.output).sort(), ['OK', 'REQUEST_CONFLICT']);
});
test('identical event retries from two processes append only once', async (t) => {
  const { file, folder, journal: j, id } = setup(t);
  const input = join(folder, 'input.json'); writeFileSync(input, JSON.stringify({ requestId: id, event: ev('ATTEMPT_REHEARSAL') }));
  const results = await Promise.all([worker('append', file, input), worker('append', file, input)]);
  assert.deepEqual(results.map(r => r.output), ['OK', 'OK']); assert.equal(j.get(id).revision, 1);
});
for (const mode of ['commit-crash', 'rollback-crash']) test(`process death ${mode} leaves the journal consistent`, async (t) => {
  const { file, folder } = sandbox(t); const id = randomUUID(); let j = new FixtureOrderJournal(file); j.reserve(id, binding()); j.close();
  const input = join(folder, 'input.json'); writeFileSync(input, JSON.stringify({ requestId: id, event: ev('ATTEMPT_REHEARSAL') }));
  const result = await worker(mode, file, input); assert.equal(result.signal, 'SIGKILL');
  j = new FixtureOrderJournal(file); t.after(() => j.close()); assert.equal(j.get(id).revision, mode === 'commit-crash' ? 1 : 0);
});
test('storage rejects symlinks, hard links, unsupported schema and corrupt database', (t) => {
  const { folder } = sandbox(t); const real = join(folder, 'real'); writeFileSync(real, 'not-a-db');
  const link = join(folder, 'link'); symlinkSync(real, link); assert.throws(() => new FixtureOrderJournal(link), /STORAGE_FAILURE/);
  assert.throws(() => new FixtureOrderJournal(real), /STORAGE_FAILURE/);
  const hard = join(folder, 'hard'); linkSync(real, hard); assert.throws(() => new FixtureOrderJournal(hard), /STORAGE_FAILURE/);
  const parent = join(folder, 'alias'); symlinkSync(folder, parent); assert.throws(() => new FixtureOrderJournal(join(parent, 'db')), /STORAGE_FAILURE/);
  const future = join(folder, 'future'); const db = new DatabaseSync(future); db.exec('PRAGMA user_version=99'); db.close();
  assert.throws(() => new FixtureOrderJournal(future), /STORAGE_FAILURE/);
});
test('state directory and database use owner-only permissions on POSIX', (t) => {
  const { file } = setup(t); if (process.platform === 'win32') { t.skip('Windows ACLs require operator configuration'); return; }
  assert.equal(statSync(file).mode & 0o777, 0o600); assert.equal(statSync(join(file, '..')).mode & 0o777, 0o700);
});

test('exact net accounting includes fees, ignores self-transfer amounts and supports huge integers', () => {
  const e = evidence(); e.transfers.push({ token: cash, from: wallet, to: wallet, amountRaw: '99', txHash: h('1'), logIndex: 2, removed: false });
  assert.equal(reconcileFixture(binding(), 'fixture-order', h('1'), e).status, 'MATCHED_FIXTURE');
  e.transfers[1]!.amountRaw = '30'; e.transfers.push({ token: cash, from: wallet, to: venue, amountRaw: '5', txHash: h('1'), logIndex: 3, removed: false });
  assert.equal(reconcileFixture(binding(), 'fixture-order', h('1'), e).status, 'MATCHED_FIXTURE');
  const large = (1n << 200n).toString(); const b = normalizeBinding({ ...binding(), cashTargetRaw: large, minimumNetCashRaw: large });
  const huge = evidence(); huge.transfers[1]!.amountRaw = large; huge.after.cashRaw = (BigInt(large) + 10n).toString();
  assert.equal(reconcileFixture(b, 'fixture-order', h('1'), huge).status, 'MATCHED_FIXTURE');
});
test('a receipt beyond the asserted head waits without claiming finality', () => {
  const result = reconcileFixture(binding(), 'fixture-order', h('1'), { ...evidence(), headNumber: '99' });
  assert.equal(result.status, 'WAITING'); assert.deepEqual(result.reasons, ['INSUFFICIENT_CONFIRMATIONS']);
});
const mutations: [string, (e: SettlementEvidence) => void, string][] = [
  ['wallet', e => { e.wallet = venue; }, 'IDENTITY_MISMATCH'], ['token', e => { e.stockToken = venue; }, 'IDENTITY_MISMATCH'],
  ['order', e => { e.orderId = 'another'; }, 'IDENTITY_MISMATCH'], ['transaction', e => { e.txHash = h('4'); }, 'IDENTITY_MISMATCH'],
  ['revert', e => { e.receiptStatus = 'REVERTED'; }, 'TRANSACTION_REVERTED'], ['reorg', e => { e.canonicalHash = h('4'); }, 'REORG_DETECTED'],
  ['parent', e => { e.parentHash = h('4'); }, 'SNAPSHOT_BLOCK_MISMATCH'], ['snapshot height', e => { e.before.blockNumber = '98'; }, 'SNAPSHOT_BLOCK_MISMATCH'],
  ['after hash', e => { e.after.blockHash = h('4'); }, 'SNAPSHOT_BLOCK_MISMATCH'], ['prebalance', e => { e.before.stockRaw = '99'; }, 'PRE_BALANCE_CHANGED'],
  ['incomplete', e => { e.completeBlockTransfers = false; }, 'INCOMPLETE_TRANSFER_EVIDENCE'], ['duplicate', e => { e.transfers.push({ ...e.transfers[0]! }); }, 'DUPLICATE_LOG'],
  ['removed', e => { e.transfers[0]!.removed = true; }, 'REMOVED_LOG'], ['other transaction', e => { e.transfers[1]!.txHash = h('4'); }, 'CONCURRENT_WALLET_ACTIVITY'],
  ['other token', e => { e.transfers[1]!.token = venue; }, 'UNRELATED_LOG'], ['missing logs', e => { e.transfers = []; }, 'BALANCE_LOG_MISMATCH'],
  ['stock fee', e => { e.after.stockRaw = '69'; e.transfers[0]!.amountRaw = '31'; }, 'FLOOR_BREACH'],
  ['partial debit', e => { e.after.stockRaw = '80'; e.transfers[0]!.amountRaw = '20'; }, 'STOCK_DEBIT_MISMATCH'],
  ['cash fee shortfall', e => { e.after.cashRaw = '34'; e.transfers[1]!.amountRaw = '24'; }, 'CASH_SHORTFALL'],
  ['mismatched cash balance', e => { e.after.cashRaw = '36'; }, 'BALANCE_LOG_MISMATCH']
];
for (const [name, mutate, reason] of mutations) test(`settlement rejects ${name}`, () => {
  const e = evidence(); mutate(e); const result = reconcileFixture(binding(), 'fixture-order', h('1'), e);
  assert.equal(result.status, 'MISMATCH'); assert.ok(result.reasons.includes(reason)); assert.equal(result.executionEnabled, false);
});
for (const [name, mutate] of [
  ['live evidence', (e: SettlementEvidence) => { (e as { mode: string }).mode = 'LIVE_READ_ONLY'; }],
  ['bad integer', (e: SettlementEvidence) => { e.before.cashRaw = '1e20'; }],
  ['lower finality', (e: SettlementEvidence) => { (e as { confirmationsRequired: number }).confirmationsRequired = 1; }],
  ['unbounded logs', (e: SettlementEvidence) => { e.transfers = Array(257).fill(e.transfers[0]); }],
  ['unsafe log index', (e: SettlementEvidence) => { e.transfers[0]!.logIndex = NaN; }],
  ['extra payload', (e: SettlementEvidence) => { Object.assign(e, { signature: 'forbidden' }); }]
] as const) test(`evidence schema rejects ${name}`, () => {
  const e = evidence(); mutate(e); assert.throws(() => reconcileFixture(binding(), 'fixture-order', h('1'), e), /INVALID_EVENT/);
});
