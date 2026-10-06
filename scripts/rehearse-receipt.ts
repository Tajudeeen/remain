import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rehearsePlan } from '../src/rehearsal/plan.ts';
import { bindFixturePlan } from '../src/orders/model.ts';
import { FixtureOrderJournal } from '../src/orders/journal.ts';
import type { SettlementEvidence } from '../src/orders/settlement.ts';
import { buildFixtureProofReceipt, verifyFixtureProofReceipt } from '../src/receipts/proof.ts';

const folder = mkdtempSync(join(tmpdir(), 'remain-receipt-rehearsal-'));
let journal: FixtureOrderJournal | undefined;
try {
  const { plan } = await rehearsePlan({ cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false });
  const binding = bindFixturePlan(plan, plan.evaluatedAtMs);
  const requestId = randomUUID();
  const now = binding.createdAtMs;
  const file = join(folder, 'journal.sqlite');
  journal = new FixtureOrderJournal(file);
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

  const settled = journal.append(requestId, 2, { type: 'RECONCILE', eventId: randomUUID(), atMs: now + 2, evidence });
  const receipt = buildFixtureProofReceipt(settled, evidence, now + 3, randomUUID());
  const verified = verifyFixtureProofReceipt(receipt, evidence);
  assert.equal(verified.status, 'VALID_FIXTURE');

  const tampered = JSON.parse(JSON.stringify(receipt)) as { body: { settlement: { actualCashCreditRaw: string } }; checksum: string };
  tampered.body.settlement.actualCashCreditRaw = (BigInt(tampered.body.settlement.actualCashCreditRaw) + 1n).toString();
  const rejected = verifyFixtureProofReceipt(tampered, evidence);
  assert.equal(rejected.status, 'INVALID');

  console.log(JSON.stringify({
    mode: 'TEST_FIXTURE',
    executionEnabled: false,
    receiptStatus: receipt.body.settlement.status,
    receiptChecksum: receipt.checksum,
    independentVerification: verified.status,
    tamperCheck: rejected.reasons,
    notice: receipt.body.notice
  }, null, 2));
} finally {
  journal?.close();
  rmSync(folder, { recursive: true, force: true });
}
