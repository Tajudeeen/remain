import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { rehearsePlan } from '../src/rehearsal/plan.ts';
import { bindFixturePlan } from '../src/orders/model.ts';
import { FixtureOrderJournal } from '../src/orders/journal.ts';
import { createFixtureReceipt, serializeReceipt } from '../src/receipts/receipt.ts';
import { parseReceiptJSON } from '../src/receipts/canonical.ts';
import { verifyReceipt } from '../src/receipts/verifier.ts';

const folder = mkdtempSync(join(tmpdir(), 'remain-receipt-rehearsal-')); let journal: FixtureOrderJournal | undefined;
try {
  const { plan } = await rehearsePlan({ cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false });
  const binding = bindFixturePlan(plan, plan.evaluatedAtMs); const id = randomUUID(); journal = new FixtureOrderJournal(join(folder, 'journal.sqlite')); journal.reserve(id, binding);
  journal.append(id, 0, { type: 'ATTEMPT_REHEARSAL', eventId: randomUUID(), atMs: binding.createdAtMs }); journal.append(id, 1, { type: 'OBSERVE', eventId: randomUUID(), atMs: binding.createdAtMs + 1, status: 'PENDING_ONCHAIN', platformOrderId: 'synthetic-order', txHash: null });
  const receipt = createFixtureReceipt(plan, journal, id, binding.createdAtMs + 2); const text = serializeReceipt(receipt); const parsed = parseReceiptJSON(text); const result = verifyReceipt(parsed);
  assert.equal(result.status, 'CONSISTENT_FIXTURE'); assert.equal(receipt.summary.settlementStatus, 'NOT_RECONCILED');
  console.log(JSON.stringify({ mode: receipt.mode, executionEnabled: receipt.executionEnabled, receiptChecksum: receipt.receiptChecksum, providerStatus: receipt.summary.providerStatus, settlementStatus: receipt.summary.settlementStatus, verifier: result.status, canonicalBytes: result.canonicalBytes, notice: 'Synthetic receipt only. No authenticated chain provenance, signature, submission or settlement.' }, null, 2));
} finally { journal?.close(); rmSync(folder, { recursive: true, force: true }); }
