import { digest, uint } from '../validation.ts';
import { timestamp } from '../planning/model.ts';
import { bindingChecksum, hash, identifier, normalizeBinding, uuid, type OrderBinding } from '../orders/model.ts';
import { normalizeEvidence, reconcileFixture, type SettlementEvidence } from '../orders/settlement.ts';
import type { OrderSnapshot } from '../orders/journal.ts';

export class ReceiptError extends Error {
  readonly code: 'INVALID_RECEIPT' | 'UNVERIFIED_SETTLEMENT';
  constructor(code: ReceiptError['code']) {
    super(code);
    this.name = 'ReceiptError';
    this.code = code;
  }
}

export type FixtureProofReceiptBody = Readonly<{
  version: 1;
  mode: 'TEST_FIXTURE';
  executionEnabled: false;
  receiptId: string;
  generatedAtMs: number;
  binding: OrderBinding;
  order: Readonly<{
    requestId: string;
    revision: number;
    providerStatus: 'FILLED';
    platformOrderId: string;
    txHash: string;
  }>;
  settlement: Readonly<{
    status: 'MATCHED_FIXTURE';
    evidenceChecksum: string;
    actualStockDebitRaw: string;
    actualCashCreditRaw: string;
    finalStockRaw: string;
    cashTargetMet: true;
    retainedFloorPreserved: true;
    blockNumber: string;
    blockHash: string;
    confirmationsRequired: 12;
  }>;
  provenance: Readonly<{
    bindingChecksum: string;
    planHash: string;
    planningQuoteId: string;
    vendor: string;
    journalRevision: number;
  }>;
  notice: 'Synthetic evidence only. This receipt does not prove a live trade or authenticate its data source.';
}>;

export type FixtureProofReceipt = Readonly<{
  body: FixtureProofReceiptBody;
  checksum: string;
}>;

export type ReceiptVerification = Readonly<{
  mode: 'TEST_FIXTURE';
  executionEnabled: false;
  status: 'VALID_FIXTURE' | 'INVALID';
  reasons: string[];
  computedChecksum: string | null;
}>;

function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReceiptError('INVALID_RECEIPT');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key))) throw new ReceiptError('INVALID_RECEIPT');
  return object;
}

function safeRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new ReceiptError('INVALID_RECEIPT');
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new ReceiptError('INVALID_RECEIPT');
  return value;
}

function deriveAmounts(evidence: SettlementEvidence): { actualStockDebitRaw: string; actualCashCreditRaw: string } {
  const stockDelta = BigInt(evidence.before.stockRaw) - BigInt(evidence.after.stockRaw);
  const cashDelta = BigInt(evidence.after.cashRaw) - BigInt(evidence.before.cashRaw);
  if (stockDelta < 0n || cashDelta < 0n) throw new ReceiptError('UNVERIFIED_SETTLEMENT');
  return { actualStockDebitRaw: stockDelta.toString(), actualCashCreditRaw: cashDelta.toString() };
}

export function buildFixtureProofReceipt(snapshot: OrderSnapshot, evidenceValue: unknown, generatedAtMs: number, receiptId: string): FixtureProofReceipt {
  timestamp(generatedAtMs);
  uuid(receiptId);
  if (
    snapshot.mode !== 'TEST_FIXTURE' ||
    snapshot.executionEnabled !== false ||
    snapshot.providerStatus !== 'FILLED' ||
    snapshot.platformOrderId === null ||
    snapshot.txHash === null ||
    snapshot.settlement?.status !== 'MATCHED_FIXTURE'
  ) throw new ReceiptError('UNVERIFIED_SETTLEMENT');

  const binding = normalizeBinding(snapshot.binding);
  const evidence = normalizeEvidence(evidenceValue);
  const recomputed = reconcileFixture(binding, snapshot.platformOrderId, snapshot.txHash, evidence);
  if (
    recomputed.status !== 'MATCHED_FIXTURE' ||
    recomputed.evidenceChecksum !== snapshot.settlement.evidenceChecksum ||
    evidence.blockHash !== evidence.canonicalHash
  ) throw new ReceiptError('UNVERIFIED_SETTLEMENT');

  const amounts = deriveAmounts(evidence);
  if (
    amounts.actualStockDebitRaw !== binding.stockDebitRaw ||
    BigInt(amounts.actualCashCreditRaw) < BigInt(binding.cashTargetRaw) ||
    BigInt(amounts.actualCashCreditRaw) < BigInt(binding.minimumNetCashRaw) ||
    BigInt(evidence.after.stockRaw) < BigInt(binding.floorRaw)
  ) throw new ReceiptError('UNVERIFIED_SETTLEMENT');

  const body: FixtureProofReceiptBody = {
    version: 1,
    mode: 'TEST_FIXTURE',
    executionEnabled: false,
    receiptId,
    generatedAtMs,
    binding,
    order: {
      requestId: snapshot.requestId,
      revision: snapshot.revision,
      providerStatus: 'FILLED',
      platformOrderId: snapshot.platformOrderId,
      txHash: snapshot.txHash
    },
    settlement: {
      status: 'MATCHED_FIXTURE',
      evidenceChecksum: recomputed.evidenceChecksum,
      actualStockDebitRaw: amounts.actualStockDebitRaw,
      actualCashCreditRaw: amounts.actualCashCreditRaw,
      finalStockRaw: evidence.after.stockRaw,
      cashTargetMet: true,
      retainedFloorPreserved: true,
      blockNumber: evidence.blockNumber,
      blockHash: evidence.blockHash,
      confirmationsRequired: 12
    },
    provenance: {
      bindingChecksum: bindingChecksum(binding),
      planHash: binding.planHash,
      planningQuoteId: binding.planningQuoteId,
      vendor: binding.vendor,
      journalRevision: snapshot.revision
    },
    notice: 'Synthetic evidence only. This receipt does not prove a live trade or authenticate its data source.'
  };
  return Object.freeze({ body: Object.freeze(body), checksum: digest(body) });
}

function normalizeReceipt(value: unknown): FixtureProofReceipt {
  try {
    const outer = exactObject(value, ['body', 'checksum']);
    const body = exactObject(outer.body, ['version', 'mode', 'executionEnabled', 'receiptId', 'generatedAtMs', 'binding', 'order', 'settlement', 'provenance', 'notice']);
    if (
      body.version !== 1 ||
      body.mode !== 'TEST_FIXTURE' ||
      body.executionEnabled !== false ||
      body.notice !== 'Synthetic evidence only. This receipt does not prove a live trade or authenticate its data source.'
    ) throw new Error();

    const binding = normalizeBinding(body.binding);
    const order = exactObject(body.order, ['requestId', 'revision', 'providerStatus', 'platformOrderId', 'txHash']);
    if (order.providerStatus !== 'FILLED') throw new Error();

    const settlement = exactObject(body.settlement, ['status', 'evidenceChecksum', 'actualStockDebitRaw', 'actualCashCreditRaw', 'finalStockRaw', 'cashTargetMet', 'retainedFloorPreserved', 'blockNumber', 'blockHash', 'confirmationsRequired']);
    if (
      settlement.status !== 'MATCHED_FIXTURE' ||
      settlement.cashTargetMet !== true ||
      settlement.retainedFloorPreserved !== true ||
      settlement.confirmationsRequired !== 12
    ) throw new Error();

    const provenance = exactObject(body.provenance, ['bindingChecksum', 'planHash', 'planningQuoteId', 'vendor', 'journalRevision']);
    const normalizedBody: FixtureProofReceiptBody = {
      version: 1,
      mode: 'TEST_FIXTURE',
      executionEnabled: false,
      receiptId: uuid(body.receiptId),
      generatedAtMs: timestamp(body.generatedAtMs),
      binding,
      order: {
        requestId: uuid(order.requestId),
        revision: safeRevision(order.revision),
        providerStatus: 'FILLED',
        platformOrderId: identifier(order.platformOrderId),
        txHash: hash(order.txHash)
      },
      settlement: {
        status: 'MATCHED_FIXTURE',
        evidenceChecksum: sha256(settlement.evidenceChecksum),
        actualStockDebitRaw: uint(settlement.actualStockDebitRaw, true),
        actualCashCreditRaw: uint(settlement.actualCashCreditRaw, true),
        finalStockRaw: uint(settlement.finalStockRaw),
        cashTargetMet: true,
        retainedFloorPreserved: true,
        blockNumber: uint(settlement.blockNumber, true),
        blockHash: hash(settlement.blockHash),
        confirmationsRequired: 12
      },
      provenance: {
        bindingChecksum: sha256(provenance.bindingChecksum),
        planHash: sha256(provenance.planHash),
        planningQuoteId: identifier(provenance.planningQuoteId),
        vendor: identifier(provenance.vendor),
        journalRevision: safeRevision(provenance.journalRevision)
      },
      notice: 'Synthetic evidence only. This receipt does not prove a live trade or authenticate its data source.'
    };
    return { body: normalizedBody, checksum: sha256(outer.checksum) };
  } catch {
    throw new ReceiptError('INVALID_RECEIPT');
  }
}

export function verifyFixtureProofReceipt(receiptValue: unknown, evidenceValue: unknown): ReceiptVerification {
  const reasons: string[] = [];
  let receipt: FixtureProofReceipt;
  let evidence: SettlementEvidence;
  try {
    receipt = normalizeReceipt(receiptValue);
    evidence = normalizeEvidence(evidenceValue);
  } catch {
    return { mode: 'TEST_FIXTURE', executionEnabled: false, status: 'INVALID', reasons: ['INVALID_SCHEMA'], computedChecksum: null };
  }

  const computedChecksum = digest(receipt.body);
  if (computedChecksum !== receipt.checksum) reasons.push('RECEIPT_CHECKSUM_MISMATCH');
  if (bindingChecksum(receipt.body.binding) !== receipt.body.provenance.bindingChecksum) reasons.push('BINDING_CHECKSUM_MISMATCH');
  if (receipt.body.binding.planHash !== receipt.body.provenance.planHash) reasons.push('PLAN_HASH_MISMATCH');
  if (receipt.body.binding.planningQuoteId !== receipt.body.provenance.planningQuoteId) reasons.push('QUOTE_ID_MISMATCH');
  if (receipt.body.binding.vendor !== receipt.body.provenance.vendor) reasons.push('VENDOR_MISMATCH');
  if (receipt.body.order.revision !== receipt.body.provenance.journalRevision) reasons.push('REVISION_MISMATCH');

  const recomputed = reconcileFixture(receipt.body.binding, receipt.body.order.platformOrderId, receipt.body.order.txHash, evidence);
  if (recomputed.status !== 'MATCHED_FIXTURE') reasons.push(...recomputed.reasons.map((reason) => `SETTLEMENT_${reason}`));
  if (recomputed.evidenceChecksum !== receipt.body.settlement.evidenceChecksum) reasons.push('EVIDENCE_CHECKSUM_MISMATCH');

  const amounts = deriveAmounts(evidence);
  if (amounts.actualStockDebitRaw !== receipt.body.settlement.actualStockDebitRaw) reasons.push('STOCK_DEBIT_MISMATCH');
  if (amounts.actualCashCreditRaw !== receipt.body.settlement.actualCashCreditRaw) reasons.push('CASH_CREDIT_MISMATCH');
  if (evidence.after.stockRaw !== receipt.body.settlement.finalStockRaw) reasons.push('FINAL_STOCK_MISMATCH');
  if (evidence.blockNumber !== receipt.body.settlement.blockNumber || evidence.blockHash !== receipt.body.settlement.blockHash) reasons.push('BLOCK_IDENTITY_MISMATCH');
  if (BigInt(receipt.body.settlement.actualCashCreditRaw) < BigInt(receipt.body.binding.cashTargetRaw)) reasons.push('TARGET_NOT_MET');
  if (BigInt(receipt.body.settlement.finalStockRaw) < BigInt(receipt.body.binding.floorRaw)) reasons.push('FLOOR_NOT_PRESERVED');

  return {
    mode: 'TEST_FIXTURE',
    executionEnabled: false,
    status: reasons.length === 0 ? 'VALID_FIXTURE' : 'INVALID',
    reasons: [...new Set(reasons)],
    computedChecksum
  };
}
