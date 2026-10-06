import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindFixturePlan } from '../src/orders/model.ts';
import { FixtureOrderJournal, type OrderEvent } from '../src/orders/journal.ts';
import { rehearsePlan } from '../src/rehearsal/plan.ts';
import { canonicalChecksum, canonicalJSON, parseReceiptJSON, ReceiptError } from '../src/receipts/canonical.ts';
import { createFixtureReceipt, serializeReceipt, type FixtureReceipt } from '../src/receipts/receipt.ts';
import { verifyReceipt } from '../src/receipts/verifier.ts';

const wallet = '0x1111111111111111111111111111111111111111'; const stock = '0x2222222222222222222222222222222222222222'; const venue = '0x3333333333333333333333333333333333333333'; const cash = '0x55d398326f99059ff775485246999027b3197955';
const h = (n: string) => `0x${n.repeat(64)}`;
function evidence() { const cashRaw = '25000000000000000000'; return { mode: 'TEST_FIXTURE' as const, chain: '56' as const, wallet, stockToken: stock, cashToken: cash, orderId: 'fixture-order', txHash: h('1'), receiptStatus: 'SUCCESS' as const, blockNumber: '100', blockHash: h('2'), parentHash: h('3'), canonicalHash: h('2'), headNumber: '111', confirmationsRequired: 12 as const, before: { blockNumber: '99', blockHash: h('3'), stockRaw: '100', cashRaw: '0' }, after: { blockNumber: '100', blockHash: h('2'), stockRaw: '75', cashRaw }, completeBlockTransfers: true, transfers: [{ token: stock, from: wallet, to: venue, amountRaw: '25', txHash: h('1'), logIndex: 0, removed: false }, { token: cash, from: venue, to: wallet, amountRaw: cashRaw, txHash: h('1'), logIndex: 1, removed: false }] }; }
async function makeReceipt(t: test.TestContext): Promise<FixtureReceipt> {
  const folder = mkdtempSync(join(tmpdir(), 'remain-receipt-')); t.after(() => rmSync(folder, { recursive: true, force: true }));
  const { plan } = await rehearsePlan({ cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false });
  const b = bindFixturePlan(plan, plan.evaluatedAtMs); const j = new FixtureOrderJournal(join(folder, 'journal.sqlite')); const id = randomUUID(); j.reserve(id, b);
  const event = (type: 'ATTEMPT_REHEARSAL' | 'OBSERVE' | 'RECONCILE', atMs: number): OrderEvent => type === 'ATTEMPT_REHEARSAL' ? { type, eventId: randomUUID(), atMs } : type === 'OBSERVE' ? { type, eventId: randomUUID(), atMs, status: 'FILLED', platformOrderId: 'fixture-order', txHash: h('1') } : { type, eventId: randomUUID(), atMs, evidence: evidence() };
  j.append(id, 0, event('ATTEMPT_REHEARSAL', b.createdAtMs)); j.append(id, 1, event('OBSERVE', b.createdAtMs + 1)); j.append(id, 2, event('RECONCILE', b.createdAtMs + 2));
  const receipt = createFixtureReceipt(plan, j, id, b.createdAtMs + 3); j.close(); return receipt;
}
test('canonical profile sorts object keys and rejects ambiguous values', () => {
  assert.equal(canonicalJSON({ z: 1, a: ['x', true] }), '{"a":["x",true],"z":1}');
  assert.equal(canonicalChecksum({ a: 1, z: 2 }), canonicalChecksum({ z: 2, a: 1 }));
  for (const input of ['{"a":1,"a":2}', '{"a":-1}', '{"a":1.2}', '{"a":01}', '{"a":1}x', '{"a":"\\ud800"}']) assert.throws(() => parseReceiptJSON(input), ReceiptError);
  assert.throws(() => canonicalJSON({ a: -0 }), /INVALID_NUMBER/);
  assert.throws(() => canonicalJSON({ a: BigInt(1) }), /INVALID_JSON_VALUE/);
});
test('valid receipt is independently verifiable and serialization is canonical', async (t) => {
  const receipt = await makeReceipt(t); const result = verifyReceipt(receipt);
  assert.equal(result.status, 'CONSISTENT_FIXTURE'); assert.equal(result.executionEnabled, false); assert.ok(result.canonicalBytes > 0);
  const text = serializeReceipt(receipt); assert.equal(text.endsWith('\n'), true); assert.equal(verifyReceipt(parseReceiptJSON(text)).status, 'CONSISTENT_FIXTURE');
  assert.equal(receipt.summary.settlementStatus, 'MATCHED_FIXTURE'); assert.equal(receipt.summary.stockRemainingRaw, '75'); assert.equal(receipt.summary.netCashReceivedRaw, '25000000000000000000');
});
function mutable(receipt: FixtureReceipt): FixtureReceipt { return parseReceiptJSON(serializeReceipt(receipt)) as FixtureReceipt; }
const mutations: [string, (r: FixtureReceipt) => void, string][] = [
  ['receipt checksum', r => { r.receiptChecksum = 'b'.repeat(64); }, 'RECEIPT_CHECKSUM'],
  ['plan checksum', r => { const p = JSON.parse(r.planJSON); p.planHash = 'b'.repeat(64); r.planJSON = JSON.stringify(p); }, 'PLAN_CHECKSUM'],
  ['binding checksum', r => { r.journal.bindingChecksum = 'b'.repeat(64); }, 'BINDING_CHECKSUM'],
  ['event payload', r => { const e = JSON.parse(r.journal.events[0]!.eventJSON); e.type = 'OUTCOME_UNKNOWN'; r.journal.events[0]!.eventJSON = JSON.stringify(e); }, 'EVENT_HASH'],
  ['event history truncation', r => { r.journal.events.pop(); r.journal.revision--; }, 'JOURNAL_TAIL'],
  ['event sequence', r => { r.journal.events[1]!.sequence = 9; }, 'EVENT_SCHEMA'],
  ['summary stock', r => { r.summary.stockRemainingRaw = '74'; }, 'SUMMARY_MISMATCH'],
  ['status claim', r => { r.summary.settlementStatus = 'MATCHED_FIXTURE'; const event = JSON.parse(r.journal.events[2]!.eventJSON); event.evidence.canonicalHash = h('4'); r.journal.events[2]!.eventJSON = JSON.stringify(event); }, 'EVENT_HASH'],
  ['provenance', r => { (r.provenance as { authentication: string }).authentication = 'SIGNED'; }, 'PROVENANCE_MISMATCH'],
  ['execution flag', r => { (r as { executionEnabled: boolean }).executionEnabled = true; }, 'RECEIPT_SCHEMA']
];
for (const [name, mutate, reason] of mutations) test(`verifier rejects ${name}`, async (t) => {
  const receipt = mutable(await makeReceipt(t)); mutate(receipt); const result = verifyReceipt(receipt); assert.equal(result.status, 'INVALID_RECEIPT'); assert.ok(result.reasons.includes(reason), `${name}: ${result.reasons.join(',')}`);
});
test('parser rejects duplicate receipt fields before verification', () => {
  assert.throws(() => parseReceiptJSON('{"mode":"TEST_FIXTURE","mode":"LIVE_READ_ONLY"}'), /DUPLICATE_KEY/);
});
