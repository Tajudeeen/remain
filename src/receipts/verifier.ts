import { digest, record } from '../validation.ts';
import { normalizeBinding, bindingChecksum, OrderError } from '../orders/model.ts';
import { normalizeEvidence, reconcileFixture } from '../orders/settlement.ts';
import { canonicalChecksum, canonicalJSON, ReceiptError, parseReceiptJSON } from './canonical.ts';
import type { ReceiptSummary } from './receipt.ts';

export type ReceiptVerification = {
  mode: 'TEST_FIXTURE'; executionEnabled: false;
  status: 'CONSISTENT_FIXTURE' | 'INVALID_RECEIPT'; reasons: string[];
  receiptChecksum: string | null; canonicalBytes: number;
};
const receiptKeys = ['kind', 'version', 'profile', 'mode', 'executionEnabled', 'exportedAtMs', 'provenance', 'planJSON', 'journal', 'summary', 'receiptChecksum'];
const journalKeys = ['requestId', 'bindingJSON', 'bindingChecksum', 'revision', 'tailChecksum', 'events'];
const summaryKeys = ['providerStatus', 'outcomeUnknown', 'cancelRequested', 'platformOrderId', 'txHash', 'settlementStatus', 'reasons', 'stockRemainingRaw', 'netCashReceivedRaw'];
const eventKeys = ['sequence', 'eventJSON', 'previousHash', 'eventHash'];
const statuses = new Set(['PENDING_VENDOR', 'PENDING_ONCHAIN', 'FILLED', 'FAILED', 'EXPIRED', 'CANCELLED']);
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  const v = record(value); if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new ReceiptError('RECEIPT_SCHEMA'); return v;
}
function safeHash(v: unknown): v is string { return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v); }
function safeHexHash(v: unknown): v is string { return typeof v === 'string' && /^0x[0-9a-f]{64}$/.test(v); }
function validateEventShape(value: unknown): Record<string, unknown> {
  const base = record(value); const type = base.type;
  const keys = type === 'OBSERVE' ? ['eventId', 'atMs', 'type', 'status', 'platformOrderId', 'txHash'] : type === 'RECONCILE' ? ['eventId', 'atMs', 'type', 'evidence'] : ['eventId', 'atMs', 'type'];
  const e = exact(base, keys);
  if (typeof e.eventId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(e.eventId) || typeof e.atMs !== 'number' || !Number.isSafeInteger(e.atMs) || e.atMs < 0) throw new ReceiptError('EVENT_SCHEMA');
  return e;
}
function parsePlan(text: unknown): Record<string, unknown> {
  if (typeof text !== 'string' || text.length > 200000) throw new ReceiptError('PLAN_INVALID');
  const p = parseReceiptJSON(text); const out = record(p); const hash = out.planHash;
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new ReceiptError('PLAN_INVALID');
  const { planHash, ...body } = out; if (digest(body) !== hash) throw new ReceiptError('PLAN_CHECKSUM');
  if (out.mode !== 'TEST_FIXTURE' || out.executionEnabled !== false || out.version !== 1 || out.status !== 'PLANNED_FOR_REVIEW') throw new ReceiptError('PLAN_INVALID');
  const candidate = record(out.candidate); const quote = record(candidate.quote); const verdict = record(candidate.verdict); const amounts = record(verdict.amounts);
  if (typeof quote.id !== 'string' || typeof amounts.totalStockDebitRaw !== 'string' || typeof amounts.minimumNetCashRaw !== 'string') throw new ReceiptError('PLAN_INVALID');
  return out;
}
function verifySummary(value: unknown, expected: ReceiptSummary): void {
  const s = exact(value, summaryKeys);
  if (s.providerStatus !== expected.providerStatus || s.outcomeUnknown !== expected.outcomeUnknown || s.cancelRequested !== expected.cancelRequested || s.platformOrderId !== expected.platformOrderId || s.txHash !== expected.txHash || s.settlementStatus !== expected.settlementStatus || s.stockRemainingRaw !== expected.stockRemainingRaw || s.netCashReceivedRaw !== expected.netCashReceivedRaw || JSON.stringify(s.reasons) !== JSON.stringify(expected.reasons)) throw new ReceiptError('SUMMARY_MISMATCH');
}
export function verifyReceipt(value: unknown): ReceiptVerification {
  const base: ReceiptVerification = { mode: 'TEST_FIXTURE', executionEnabled: false, status: 'INVALID_RECEIPT', reasons: [], receiptChecksum: null, canonicalBytes: 0 };
  try {
    const r = exact(value, receiptKeys); base.receiptChecksum = safeHash(r.receiptChecksum) ? r.receiptChecksum : null;
    if (r.kind !== 'REMAIN_FIXTURE_RECEIPT' || r.version !== 1 || r.profile !== 'REMAIN_JSON_V1' || r.mode !== 'TEST_FIXTURE' || r.executionEnabled !== false || typeof r.exportedAtMs !== 'number' || !Number.isSafeInteger(r.exportedAtMs) || r.exportedAtMs < 0) throw new ReceiptError('RECEIPT_SCHEMA');
    const p = exact(r.provenance, ['planning', 'order', 'chain', 'authentication', 'signature']);
    if (p.planning !== 'TEST_FIXTURE_GENERATOR' || p.order !== 'TEST_FIXTURE_JOURNAL' || p.chain !== 'TEST_FIXTURE_ASSERTIONS' || p.authentication !== 'UNAUTHENTICATED' || p.signature !== 'NOT_REQUESTED') throw new ReceiptError('PROVENANCE_MISMATCH');
    const j = exact(r.journal, journalKeys); const requestId = j.requestId;
    if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId) || typeof j.bindingJSON !== 'string' || !safeHash(j.bindingChecksum) || typeof j.revision !== 'number' || !Number.isSafeInteger(j.revision) || j.revision < 0 || !safeHash(j.tailChecksum) || !Array.isArray(j.events) || j.events.length > 64 || j.events.length !== j.revision) throw new ReceiptError('JOURNAL_SCHEMA');
    const binding = normalizeBinding(parseReceiptJSON(j.bindingJSON)); if (bindingChecksum(binding) !== j.bindingChecksum) throw new ReceiptError('BINDING_CHECKSUM');
    const plan = parsePlan(r.planJSON); if (binding.planHash !== plan.planHash) throw new ReceiptError('PLAN_BINDING_MISMATCH');
    let tail = digest({ requestId, binding }); let providerStatus: string | null = null; let platformOrderId: string | null = null; let txHash: string | null = null; let attempt = false; let unknown = false; let cancelled = false; let settlement: ReturnType<typeof reconcileFixture> | null = null; let lastAtMs = binding.createdAtMs;
    for (const raw of j.events) {
      const e = exact(raw, eventKeys); if (!Number.isSafeInteger(e.sequence) || e.sequence !== j.events.indexOf(raw) + 1 || typeof e.eventJSON !== 'string' || !safeHash(e.previousHash) || !safeHash(e.eventHash)) throw new ReceiptError('EVENT_SCHEMA');
      if (e.previousHash !== tail) throw new ReceiptError('EVENT_CHAIN');
      const parsed = parseReceiptJSON(e.eventJSON); const object = validateEventShape(parsed); const eventType = object.type;
      if (Number(object.atMs) < lastAtMs) throw new ReceiptError('EVENT_TRANSITION'); lastAtMs = Number(object.atMs);
      const expectedEventHash = digest({ requestId, sequence: e.sequence, previousHash: tail, event: object });
      if (e.eventHash !== expectedEventHash) throw new ReceiptError('EVENT_HASH');
      if (eventType === 'ATTEMPT_REHEARSAL') { if (attempt) throw new ReceiptError('EVENT_TRANSITION'); attempt = true; unknown = true; }
      else if (eventType === 'OUTCOME_UNKNOWN') { if (!attempt || providerStatus && ['FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(providerStatus)) throw new ReceiptError('EVENT_TRANSITION'); unknown = true; }
      else if (eventType === 'CANCEL_REQUESTED') { if (!attempt || providerStatus && ['FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(providerStatus)) throw new ReceiptError('EVENT_TRANSITION'); cancelled = true; }
      else if (eventType === 'OBSERVE') {
        if (typeof object.status !== 'string' || !statuses.has(object.status) || typeof object.platformOrderId !== 'string' || (object.status === 'FILLED' ? !safeHexHash(object.txHash) : object.txHash !== null) || providerStatus && ['FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(providerStatus) || providerStatus === 'PENDING_ONCHAIN' && object.status === 'PENDING_VENDOR') throw new ReceiptError('EVENT_TRANSITION');
        if (!attempt || platformOrderId && platformOrderId !== object.platformOrderId || txHash && txHash !== object.txHash) throw new ReceiptError('EVENT_TRANSITION');
        providerStatus = object.status; platformOrderId = object.platformOrderId; txHash = object.txHash as string | null; unknown = false;
      } else if (eventType === 'RECONCILE') {
        if (providerStatus !== 'FILLED' || !platformOrderId || !txHash) throw new ReceiptError('EVENT_TRANSITION');
        const evidence = normalizeEvidence((object as { evidence?: unknown }).evidence); settlement = reconcileFixture(binding, platformOrderId, txHash, evidence);
      } else throw new ReceiptError('EVENT_TYPE');
      tail = e.eventHash;
    }
    if (tail !== j.tailChecksum) throw new ReceiptError('JOURNAL_TAIL');
    const summaryExpected: ReceiptSummary = { providerStatus: providerStatus as ReceiptSummary['providerStatus'], outcomeUnknown: unknown, cancelRequested: cancelled, platformOrderId, txHash, settlementStatus: settlement?.status ?? 'NOT_RECONCILED', reasons: settlement?.reasons ?? [], stockRemainingRaw: null, netCashReceivedRaw: null };
    const lastEvidence = j.events.map(raw => { try { return record(parseReceiptJSON(String(exact(raw, eventKeys).eventJSON))); } catch { return null; } }).filter((e): e is Record<string, unknown> => !!e && e.type === 'RECONCILE').at(-1)?.evidence;
    if (lastEvidence) { const e = normalizeEvidence(lastEvidence); summaryExpected.stockRemainingRaw = e.after.stockRaw; summaryExpected.netCashReceivedRaw = (BigInt(e.after.cashRaw) - BigInt(e.before.cashRaw)).toString(); }
    verifySummary(r.summary, summaryExpected);
    const { receiptChecksum, ...body } = r; if (typeof receiptChecksum !== 'string' || !safeHash(receiptChecksum) || canonicalChecksum(body) !== receiptChecksum) throw new ReceiptError('RECEIPT_CHECKSUM');
    base.canonicalBytes = Buffer.byteLength(canonicalJSON(value)); base.status = 'CONSISTENT_FIXTURE'; return base;
  } catch (error) { base.reasons.push(error instanceof ReceiptError || error instanceof OrderError ? error.code : 'INVALID_RECEIPT'); return base; }
}
