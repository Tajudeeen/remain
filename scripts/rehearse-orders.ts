import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { rehearsePlan } from '../src/rehearsal/plan.ts';
import { bindFixturePlan } from '../src/orders/model.ts';
import { FixtureOrderJournal, recoveryAdvice } from '../src/orders/journal.ts';
import type { SettlementEvidence } from '../src/orders/settlement.ts';

// Isolated synthetic rehearsal. No credentials, wallet or network calls.
const folder = mkdtempSync(join(tmpdir(), 'remain-order-rehearsal-'));
let journal: FixtureOrderJournal | undefined;
try {
  const { plan } = await rehearsePlan({ cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false });
  const binding = bindFixturePlan(plan, plan.evaluatedAtMs); const requestId = randomUUID(); const file = join(folder, 'journal.sqlite'); const now = binding.createdAtMs;
  journal = new FixtureOrderJournal(file); journal.reserve(requestId, binding);
  journal.append(requestId, 0, { type: 'ATTEMPT_REHEARSAL', eventId: randomUUID(), atMs: now }); journal.close();
  journal = new FixtureOrderJournal(file); const recovered = journal.get(requestId);
  assert.equal(recovered.revision, 1); assert.equal(recovered.requestId, requestId);
  const txHash = `0x${'1'.repeat(64)}`; const blockHash = `0x${'2'.repeat(64)}`; const parentHash = `0x${'3'.repeat(64)}`; const venue = '0x3333333333333333333333333333333333333333';
  journal.append(requestId, 1, { type: 'OBSERVE', eventId: randomUUID(), atMs: now + 1, status: 'FILLED', platformOrderId: 'synthetic-order', txHash });
  assert.equal(journal.get(requestId).settlement, null);
  const evidence: SettlementEvidence = {
    mode: 'TEST_FIXTURE', chain: '56', wallet: binding.wallet, stockToken: binding.stockToken, cashToken: binding.cashToken, orderId: 'synthetic-order', txHash, receiptStatus: 'SUCCESS', blockNumber: '100', blockHash, parentHash, canonicalHash: blockHash, headNumber: '111', confirmationsRequired: 12,
    before: { blockNumber: '99', blockHash: parentHash, stockRaw: binding.stockBalanceRaw, cashRaw: '0' }, after: { blockNumber: '100', blockHash, stockRaw: (BigInt(binding.stockBalanceRaw) - BigInt(binding.stockDebitRaw)).toString(), cashRaw: binding.minimumNetCashRaw }, completeBlockTransfers: true,
    transfers: [{ token: binding.stockToken, from: binding.wallet, to: venue, amountRaw: binding.stockDebitRaw, txHash, logIndex: 0, removed: false }, { token: binding.cashToken, from: venue, to: binding.wallet, amountRaw: binding.minimumNetCashRaw, txHash, logIndex: 1, removed: false }]
  };
  const matched = journal.append(requestId, 2, { type: 'RECONCILE', eventId: randomUUID(), atMs: now + 2, evidence });
  assert.equal(matched.settlement!.status, 'MATCHED_FIXTURE');
  const reorg = journal.append(requestId, 3, { type: 'RECONCILE', eventId: randomUUID(), atMs: now + 3, evidence: { ...evidence, canonicalHash: `0x${'4'.repeat(64)}` } });
  assert.equal(reorg.settlement!.status, 'MISMATCH');
  console.log(JSON.stringify({ mode: 'TEST_FIXTURE', executionEnabled: false, recoveredRevision: recovered.revision, reportedFillNeedsReconciliation: true, syntheticMatch: matched.settlement!.status, laterReorg: reorg.settlement!.reasons, recovery: recoveryAdvice(reorg, now + 3).action, notice: 'Synthetic assertions only. No external submission, RPC, signature or settled trade. Temporary database removed.' }, null, 2));
} finally { journal?.close(); rmSync(folder, { recursive: true, force: true }); }
