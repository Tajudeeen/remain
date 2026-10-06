import type { PlanResult } from '../planning/solver.ts';
import type { FixtureOrderJournal, OrderSnapshot, JournalArchive } from '../orders/journal.ts';
import { canonicalChecksum, canonicalJSON, ReceiptError } from './canonical.ts';
import { verifyReceipt } from './verifier.ts';

export const PROVENANCE = Object.freeze({ planning: 'TEST_FIXTURE_GENERATOR', order: 'TEST_FIXTURE_JOURNAL', chain: 'TEST_FIXTURE_ASSERTIONS', authentication: 'UNAUTHENTICATED', signature: 'NOT_REQUESTED' } as const);
export type ReceiptSummary = {
  providerStatus: OrderSnapshot['providerStatus']; outcomeUnknown: boolean; cancelRequested: boolean;
  platformOrderId: string | null; txHash: string | null;
  settlementStatus: 'NOT_RECONCILED' | 'MATCHED_FIXTURE' | 'WAITING' | 'MISMATCH'; reasons: string[];
  stockRemainingRaw: string | null; netCashReceivedRaw: string | null;
};
export type FixtureReceipt = {
  kind: 'REMAIN_FIXTURE_RECEIPT'; version: 1; profile: 'REMAIN_JSON_V1'; mode: 'TEST_FIXTURE'; executionEnabled: false;
  exportedAtMs: number; provenance: typeof PROVENANCE; planJSON: string; journal: JournalArchive; summary: ReceiptSummary; receiptChecksum: string;
};
export function createFixtureReceipt(plan: PlanResult, journal: FixtureOrderJournal, requestId: string, exportedAtMs: number): FixtureReceipt {
  const archive = journal.exportArchive(requestId); const s = archive.snapshot;
  const latest = archive.journal.events.map(e => JSON.parse(e.eventJSON)).filter(e => e.type === 'RECONCILE').at(-1)?.evidence;
  const summary: ReceiptSummary = {
    providerStatus: s.providerStatus, outcomeUnknown: s.outcomeUnknown, cancelRequested: s.cancelRequested, platformOrderId: s.platformOrderId, txHash: s.txHash,
    settlementStatus: s.settlement?.status ?? 'NOT_RECONCILED', reasons: s.settlement?.reasons ?? [],
    stockRemainingRaw: latest ? latest.after.stockRaw : null,
    netCashReceivedRaw: latest ? (BigInt(latest.after.cashRaw) - BigInt(latest.before.cashRaw)).toString() : null
  };
  const body = { kind: 'REMAIN_FIXTURE_RECEIPT', version: 1, profile: 'REMAIN_JSON_V1', mode: 'TEST_FIXTURE', executionEnabled: false, exportedAtMs, provenance: PROVENANCE, planJSON: JSON.stringify(plan), journal: archive.journal, summary } as const;
  const receipt: FixtureReceipt = { ...body, receiptChecksum: canonicalChecksum(body) };
  const verification = verifyReceipt(receipt);
  if (verification.status !== 'CONSISTENT_FIXTURE') throw new ReceiptError('EXPORT_INCONSISTENT');
  return Object.freeze(receipt);
}
export function serializeReceipt(receipt: FixtureReceipt): string { return canonicalJSON(receipt) + '\n'; }
