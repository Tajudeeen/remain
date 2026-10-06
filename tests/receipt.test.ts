import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rehearsePlan } from '../src/rehearsal/plan.ts';
import { bindFixturePlan } from '../src/orders/model.ts';
import { FixtureOrderJournal, type OrderSnapshot } from '../src/orders/journal.ts';
import type { SettlementEvidence } from '../src/orders/settlement.ts';
import { buildFixtureProofReceipt, verifyFixtureProofReceipt, ReceiptError, type FixtureProofReceipt } from '../src/receipts/proof.ts';

async function matchedFixture(): Promise<{ snapshot: OrderSnapshot; evidence: SettlementEvidence; cleanup: () => void }> {
  const folder = mkdtempSync(join(tmpdir(), 'remain-receipt-test-'));
  const file = join(folder, 'journal.sqlite');
  const journal = new FixtureOrderJournal(file);
  try {
    const { plan } = await rehearsePlan({ cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false });
    const binding = bindFixturePlan(plan, plan.evaluatedAtMs);
    const requestId = randomUUID();
    const now = binding.createdAtMs;
    journal.reserve(requestId, binding);
    journal.append(requestId, 0, { type: 'ATTEMPT_REHEARSAL', eventId: randomUUID(), atMs: now });
    const txHash = `0x${'1'.repeat(64)}`;
    const blockHash = `0x${'2'.repeat(64)}`;
    const parentHash = `0x${'3'.repeat(64)}`;
    const venue = '0x3333333333333333333333333333333333333333';
    journal.append(requestId, 1, { type: 'OBSERVE', eventId: randomUUID(), atMs: now + 1, status: 'FILLED', platformOrderId: 'synthetic-order', txHash });
    const evidence: SettlementEvidence = {
      mode: 'TEST_FIXTURE',
      chain: '56',
      wallet: binding.wallet,
      stockToken: binding.stockToken,
      cashToken: binding.cashToken,
      orderId: 'synthetic-order',
      txHash,
      receiptStatus: 'SUCCESS',
      blockNumber: '100',
      blockHash,
      parentHash,
      canonicalHash: blockHash,
      headNumber: '111',
      confirmationsRequired: 12,
      before: { blockNumber: '99', blockHash: parentHash, stockRaw: binding.stockBalanceRaw, cashRaw: '0' },
      after: {
        blockNumber: '100',
        blockHash,
        stockRaw: (BigInt(binding.stockBalanceRaw) - BigInt(binding.stockDebitRaw)).toString(),
        cashRaw: binding.minimumNetCashRaw
      },
      completeBlockTransfers: true,
      transfers: [
        { token: binding.stockToken, from: binding.wallet, to: venue, amountRaw: binding.stockDebitRaw, txHash, logIndex: 0, removed: false },
        { token: binding.cashToken, from: venue, to: binding.wallet, amountRaw: binding.minimumNetCashRaw, txHash, logIndex: 1, removed: false }
      ]
    };
    const snapshot = journal.append(requestId, 2, { type: 'RECONCILE', eventId: randomUUID(), atMs: now + 2, evidence });
    journal.close();
    return { snapshot, evidence, cleanup: () => rmSync(folder, { recursive: true, force: true }) };
  } catch (error) {
    journal.close();
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test('builds and independently verifies a matched fixture receipt', async () => {
  const fixture = await matchedFixture();
  try {
    const receipt = buildFixtureProofReceipt(fixture.snapshot, fixture.evidence, fixture.snapshot.lastAtMs + 1, randomUUID());
    const result = verifyFixtureProofReceipt(receipt, fixture.evidence);
    assert.equal(receipt.body.mode, 'TEST_FIXTURE');
    assert.equal(receipt.body.executionEnabled, false);
    assert.equal(receipt.body.settlement.status, 'MATCHED_FIXTURE');
    assert.equal(result.status, 'VALID_FIXTURE');
    assert.deepEqual(result.reasons, []);
  } finally {
    fixture.cleanup();
  }
});

test('detects receipt body tampering even when settlement evidence is unchanged', async () => {
  const fixture = await matchedFixture();
  try {
    const receipt = buildFixtureProofReceipt(fixture.snapshot, fixture.evidence, fixture.snapshot.lastAtMs + 1, randomUUID());
    const tampered = clone(receipt) as { body: { settlement: { actualCashCreditRaw: string } }; checksum: string };
    tampered.body.settlement.actualCashCreditRaw = (BigInt(tampered.body.settlement.actualCashCreditRaw) + 1n).toString();
    const result = verifyFixtureProofReceipt(tampered, fixture.evidence);
    assert.equal(result.status, 'INVALID');
    assert.ok(result.reasons.includes('RECEIPT_CHECKSUM_MISMATCH'));
    assert.ok(result.reasons.includes('CASH_CREDIT_MISMATCH'));
  } finally {
    fixture.cleanup();
  }
});

test('detects evidence substitution even if a receipt checksum is untouched', async () => {
  const fixture = await matchedFixture();
  try {
    const receipt = buildFixtureProofReceipt(fixture.snapshot, fixture.evidence, fixture.snapshot.lastAtMs + 1, randomUUID());
    const evidence = clone(fixture.evidence);
    evidence.canonicalHash = `0x${'4'.repeat(64)}`;
    const result = verifyFixtureProofReceipt(receipt, evidence);
    assert.equal(result.status, 'INVALID');
    assert.ok(result.reasons.includes('SETTLEMENT_REORG_DETECTED'));
    assert.ok(result.reasons.includes('EVIDENCE_CHECKSUM_MISMATCH'));
  } finally {
    fixture.cleanup();
  }
});

test('rejects proof creation before settlement is independently matched', async () => {
  const fixture = await matchedFixture();
  try {
    const unmatched = { ...fixture.snapshot, settlement: null } satisfies OrderSnapshot;
    assert.throws(
      () => buildFixtureProofReceipt(unmatched, fixture.evidence, fixture.snapshot.lastAtMs + 1, randomUUID()),
      (error: unknown) => error instanceof ReceiptError && error.code === 'UNVERIFIED_SETTLEMENT'
    );
  } finally {
    fixture.cleanup();
  }
});

test('rejects added fields instead of silently accepting ambiguous receipt shapes', async () => {
  const fixture = await matchedFixture();
  try {
    const receipt = buildFixtureProofReceipt(fixture.snapshot, fixture.evidence, fixture.snapshot.lastAtMs + 1, randomUUID());
    const polluted = clone(receipt) as FixtureProofReceipt & { liveSettlement?: boolean };
    polluted.liveSettlement = true;
    const result = verifyFixtureProofReceipt(polluted, fixture.evidence);
    assert.equal(result.status, 'INVALID');
    assert.deepEqual(result.reasons, ['INVALID_SCHEMA']);
  } finally {
    fixture.cleanup();
  }
});
