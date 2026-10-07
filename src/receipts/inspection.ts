import { parseReceiptJSON, ReceiptError } from './canonical.ts';
import { verifyReceipt } from './verifier.ts';
import type { FixtureReceipt } from './receipt.ts';

/** Stateless fixture inspection. Never returns uploaded bodies, IDs or addresses. */
export function inspectFixtureReceipt(text: string) {
  let value: unknown;
  try { value = parseReceiptJSON(text); }
  catch (error) {
    // All parser errors are fixed internal codes, not input fragments.
    return { mode: 'TEST_FIXTURE' as const, executionEnabled: false as const,
      source: 'UNAUTHENTICATED' as const, signature: 'NOT_REQUESTED' as const,
      status: 'INVALID_RECEIPT' as const, reasons: [error instanceof ReceiptError ? error.code : 'INVALID_JSON'],
      receiptChecksum: null, canonicalBytes: 0, facts: null };
  }
  const verified = verifyReceipt(value);
  const r = value as FixtureReceipt;
  const facts = verified.status === 'CONSISTENT_FIXTURE' ? {
    eventCount: r.journal.events.length, providerStatus: r.summary.providerStatus,
    settlementStatus: r.summary.settlementStatus, stockRemainingRaw: r.summary.stockRemainingRaw,
    netCashReceivedRaw: r.summary.netCashReceivedRaw
  } : null;
  return { ...verified, source: 'UNAUTHENTICATED' as const, signature: 'NOT_REQUESTED' as const, facts };
}
