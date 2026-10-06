/**
 * Compatibility surface for the original proof-receipt API.
 *
 * The implementation intentionally lives in the canonical receipt factory
 * and offline verifier. Keeping this module as a thin adapter prevents older
 * integrations from silently using the former snapshot-only proof format.
 */
export {
  createFixtureReceipt as buildFixtureProofReceipt,
  serializeReceipt,
  PROVENANCE
} from './receipt.ts';
export { verifyReceipt as verifyFixtureProofReceipt } from './verifier.ts';
export type { FixtureReceipt as FixtureProofReceipt, ReceiptSummary } from './receipt.ts';
