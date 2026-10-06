import { address, BSC_USDT, digest, record, uint } from '../validation.ts';
import { timestamp } from '../planning/model.ts';
import { recheckPlan, type PlanResult } from '../planning/solver.ts';

export class OrderError extends Error {
  readonly code: 'INVALID_ORDER' | 'INVALID_EVENT' | 'REQUEST_CONFLICT' | 'REVISION_CONFLICT' | 'INVALID_TRANSITION' | 'JOURNAL_CORRUPT' | 'ORDER_MISSING' | 'STORAGE_FAILURE';
  constructor(code: OrderError['code']) {
    super(code); this.name = 'OrderError'; this.code = code;
  }
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new OrderError('INVALID_ORDER');
  return value;
}
export function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) throw new OrderError('INVALID_EVENT');
  return value;
}
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(value)) throw new OrderError('INVALID_EVENT');
  return value;
}
export function exact(value: unknown, keys: string[]): Record<string, unknown> {
  const v = record(value);
  if (Object.keys(v).length !== keys.length || keys.some((key) => !Object.hasOwn(v, key))) throw new OrderError('INVALID_EVENT');
  return v;
}
export type OrderBinding = Readonly<{
  version: 1; mode: 'TEST_FIXTURE'; executionEnabled: false; planHash: string;
  wallet: string; chain: '56'; stockToken: string; cashToken: string; vendor: string;
  planningQuoteId: string; createdAtMs: number; expiresAtMs: number;
  stockBalanceRaw: string; stockDebitRaw: string; floorRaw: string;
  cashTargetRaw: string; minimumNetCashRaw: string;
}>;
const bindingKeys = ['version', 'mode', 'executionEnabled', 'planHash', 'wallet', 'chain', 'stockToken', 'cashToken', 'vendor', 'planningQuoteId', 'createdAtMs', 'expiresAtMs', 'stockBalanceRaw', 'stockDebitRaw', 'floorRaw', 'cashTargetRaw', 'minimumNetCashRaw'];
export function normalizeBinding(value: unknown): OrderBinding {
  try {
    const v = exact(value, bindingKeys);
    if (v.version !== 1 || v.mode !== 'TEST_FIXTURE' || v.executionEnabled !== false || v.chain !== '56' || typeof v.planHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.planHash) || typeof v.vendor !== 'string' || !['PcsXRfq', 'CowSwap', 'InchFusion'].includes(v.vendor)) throw new Error();
    const b: OrderBinding = {
      version: 1, mode: 'TEST_FIXTURE', executionEnabled: false, planHash: v.planHash,
      wallet: address(v.wallet), chain: '56', stockToken: address(v.stockToken), cashToken: address(v.cashToken), vendor: String(v.vendor),
      planningQuoteId: identifier(v.planningQuoteId), createdAtMs: timestamp(v.createdAtMs), expiresAtMs: timestamp(v.expiresAtMs),
      stockBalanceRaw: uint(v.stockBalanceRaw, true), stockDebitRaw: uint(v.stockDebitRaw, true), floorRaw: uint(v.floorRaw), cashTargetRaw: uint(v.cashTargetRaw, true), minimumNetCashRaw: uint(v.minimumNetCashRaw, true)
    };
    if (b.cashToken !== BSC_USDT.toLowerCase() || b.stockToken === b.cashToken || b.expiresAtMs <= b.createdAtMs || BigInt(b.stockBalanceRaw) - BigInt(b.stockDebitRaw) < BigInt(b.floorRaw) || BigInt(b.minimumNetCashRaw) < BigInt(b.cashTargetRaw)) throw new Error();
    return Object.freeze(b);
  } catch { throw new OrderError('INVALID_ORDER'); }
}
export function bindFixturePlan(plan: PlanResult, nowMs: number): OrderBinding {
  const guard = recheckPlan(plan, nowMs);
  if (plan.mode !== 'TEST_FIXTURE' || guard.status !== 'PASS_FOR_PLANNING' || !guard.amounts || !plan.candidate) throw new OrderError('INVALID_ORDER');
  const q = plan.candidate.quote; const i = plan.intent;
  return normalizeBinding({ version: 1, mode: 'TEST_FIXTURE', executionEnabled: false, planHash: plan.planHash,
    wallet: i.wallet, chain: i.chain, stockToken: i.stockToken, cashToken: i.cashToken, vendor: q.vendor, planningQuoteId: q.id,
    createdAtMs: timestamp(nowMs), expiresAtMs: q.expiresAtMs, stockBalanceRaw: i.stockBalanceRaw,
    stockDebitRaw: guard.amounts.totalStockDebitRaw, floorRaw: guard.amounts.retainedFloorRaw, cashTargetRaw: i.cashTargetRaw, minimumNetCashRaw: guard.amounts.minimumNetCashRaw });
}
export function bindingChecksum(binding: OrderBinding): string { return digest(binding); }
