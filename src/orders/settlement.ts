import { digest, uint } from '../validation.ts';
import { exact, hash, identifier, normalizeBinding, OrderError, type OrderBinding } from './model.ts';

// A narrow evidence contract for ordinary ERC-20 Transfer accounting only.
// Its inputs are assertions from fixtures, never authenticated chain observations.
export type SettlementEvidence = {
  mode: 'TEST_FIXTURE'; chain: '56'; wallet: string; stockToken: string; cashToken: string;
  orderId: string; txHash: string; receiptStatus: 'SUCCESS' | 'REVERTED';
  blockNumber: string; blockHash: string; parentHash: string; canonicalHash: string;
  headNumber: string; confirmationsRequired: 12;
  before: { blockNumber: string; blockHash: string; stockRaw: string; cashRaw: string };
  after: { blockNumber: string; blockHash: string; stockRaw: string; cashRaw: string };
  // Every relevant wallet transfer in the entire receipt block, not just the RFQ receipt.
  completeBlockTransfers: boolean;
  transfers: { token: string; from: string; to: string; amountRaw: string; txHash: string; logIndex: number; removed: boolean }[];
};
export type SettlementResult = {
  mode: 'TEST_FIXTURE'; executionEnabled: false; status: 'MATCHED_FIXTURE' | 'WAITING' | 'MISMATCH';
  reasons: string[]; evidenceChecksum: string;
};
export function normalizeEvidence(value: unknown): SettlementEvidence {
  try {
    const e = exact(value, ['mode', 'chain', 'wallet', 'stockToken', 'cashToken', 'orderId', 'txHash', 'receiptStatus', 'blockNumber', 'blockHash', 'parentHash', 'canonicalHash', 'headNumber', 'confirmationsRequired', 'before', 'after', 'completeBlockTransfers', 'transfers']);
    if (e.mode !== 'TEST_FIXTURE' || e.chain !== '56' || typeof e.receiptStatus !== 'string' || !['SUCCESS', 'REVERTED'].includes(e.receiptStatus) || e.confirmationsRequired !== 12 || typeof e.completeBlockTransfers !== 'boolean' || !Array.isArray(e.transfers) || e.transfers.length > 256) throw new Error();
    // Zero address is allowed in Transfer events (mint/burn); identities are nonzero in binding.
    const addr = (v: unknown): string => { if (typeof v !== 'string' || !/^0x[0-9a-f]{40}$/.test(v)) throw new Error(); return v; };
    const balance = (v: unknown) => { const b = exact(v, ['blockNumber', 'blockHash', 'stockRaw', 'cashRaw']); return { blockNumber: uint(b.blockNumber), blockHash: hash(b.blockHash), stockRaw: uint(b.stockRaw), cashRaw: uint(b.cashRaw) }; };
    return { mode: 'TEST_FIXTURE', chain: '56', wallet: addr(e.wallet), stockToken: addr(e.stockToken), cashToken: addr(e.cashToken), orderId: identifier(e.orderId), txHash: hash(e.txHash), receiptStatus: e.receiptStatus as SettlementEvidence['receiptStatus'], blockNumber: uint(e.blockNumber, true), blockHash: hash(e.blockHash), parentHash: hash(e.parentHash), canonicalHash: hash(e.canonicalHash), headNumber: uint(e.headNumber), confirmationsRequired: 12, before: balance(e.before), after: balance(e.after), completeBlockTransfers: e.completeBlockTransfers,
      transfers: e.transfers.map((v) => {
        const t = exact(v, ['token', 'from', 'to', 'amountRaw', 'txHash', 'logIndex', 'removed']);
        if (typeof t.logIndex !== 'number' || !Number.isSafeInteger(t.logIndex) || t.logIndex < 0 || typeof t.removed !== 'boolean') throw new Error();
        return { token: addr(t.token), from: addr(t.from), to: addr(t.to), amountRaw: uint(t.amountRaw), txHash: hash(t.txHash), logIndex: t.logIndex, removed: t.removed };
      }) };
  } catch { throw new OrderError('INVALID_EVENT'); }
}
export function reconcileFixture(binding: OrderBinding, orderId: string, txHash: string, value: unknown): SettlementResult {
  const b = normalizeBinding(binding); const e = normalizeEvidence(value); const reasons: string[] = [];
  identifier(orderId); hash(txHash);
  if (e.chain !== b.chain || e.wallet !== b.wallet || e.stockToken !== b.stockToken || e.cashToken !== b.cashToken || e.orderId !== orderId || e.txHash !== txHash) reasons.push('IDENTITY_MISMATCH');
  if (e.receiptStatus !== 'SUCCESS') reasons.push('TRANSACTION_REVERTED');
  if (e.blockHash !== e.canonicalHash) reasons.push('REORG_DETECTED');
  if (BigInt(e.before.blockNumber) + 1n !== BigInt(e.blockNumber) || e.before.blockHash !== e.parentHash || e.after.blockNumber !== e.blockNumber || e.after.blockHash !== e.blockHash) reasons.push('SNAPSHOT_BLOCK_MISMATCH');
  if (e.before.stockRaw !== b.stockBalanceRaw) reasons.push('PRE_BALANCE_CHANGED');
  if (!e.completeBlockTransfers) reasons.push('INCOMPLETE_TRANSFER_EVIDENCE');
  let stock = 0n; let cash = 0n; const seen = new Set<number>();
  for (const t of e.transfers) {
    if (seen.has(t.logIndex)) reasons.push('DUPLICATE_LOG'); seen.add(t.logIndex);
    if (t.removed) reasons.push('REMOVED_LOG');
    if (![b.stockToken, b.cashToken].includes(t.token) || (t.from !== b.wallet && t.to !== b.wallet)) { reasons.push('UNRELATED_LOG'); continue; }
    if (t.txHash !== txHash) reasons.push('CONCURRENT_WALLET_ACTIVITY');
    const delta = (t.to === b.wallet ? BigInt(t.amountRaw) : 0n) - (t.from === b.wallet ? BigInt(t.amountRaw) : 0n);
    if (t.token === b.stockToken) stock += delta; else cash += delta;
  }
  const stockDelta = BigInt(e.after.stockRaw) - BigInt(e.before.stockRaw);
  const cashDelta = BigInt(e.after.cashRaw) - BigInt(e.before.cashRaw);
  if (stock !== stockDelta || cash !== cashDelta) reasons.push('BALANCE_LOG_MISMATCH');
  if (stock !== -BigInt(b.stockDebitRaw)) reasons.push('STOCK_DEBIT_MISMATCH');
  if (BigInt(e.after.stockRaw) < BigInt(b.floorRaw)) reasons.push('FLOOR_BREACH');
  if (cash < BigInt(b.minimumNetCashRaw) || cash < BigInt(b.cashTargetRaw)) reasons.push('CASH_SHORTFALL');
  const pending = BigInt(e.headNumber) < BigInt(e.blockNumber) || BigInt(e.headNumber) - BigInt(e.blockNumber) + 1n < 12n;
  return { mode: 'TEST_FIXTURE', executionEnabled: false, status: reasons.length ? 'MISMATCH' : pending ? 'WAITING' : 'MATCHED_FIXTURE', reasons: [...new Set([...reasons, ...(pending ? ['INSUFFICIENT_CONFIRMATIONS'] : [])])], evidenceChecksum: digest(e) };
}
