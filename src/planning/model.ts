import { address, BSC_USDT, uint } from '../validation.ts';
import { dataRecord } from '../input/data.ts';

export type PlanningMode = 'TEST_FIXTURE' | 'LIVE_READ_ONLY';
export type MarketSnapshot = { observedAtMs: number; openState: boolean; marketStatus: string; reasonCode: string | null };
export type CashIntent = {
  wallet: string; chain: '56'; stockToken: string; cashToken: string;
  stockBalanceRaw: string; balanceObservedAtMs: number; cashTargetRaw: string;
  retainBps: number; absoluteFloorRaw: string; maxImpactBps: number;
  maxSlippageBps: number; maxExpectedSurplusRaw: string;
  allowClosedMarket: boolean; market: MarketSnapshot;
};
export type QuoteRequest = Readonly<{ wallet: string; chain: '56'; stockToken: string; cashToken: string; inputRaw: string }>;
export type PlanningQuote = {
  id: string; vendor: string; wallet: string; chain: '56'; stockToken: string; cashToken: string;
  inputRaw: string; inputFeeRaw: string; expectedGrossOutputRaw: string;
  minimumGrossOutputRaw: string; outputFeeUpperBoundRaw: string; impactBps: number;
  issuedAtMs: number; expiresAtMs: number;
  minimumOutputBinding: 'UNVERIFIED' | 'VERIFIED_ORDER';
};
export type QuoteProvider = {
  mode: PlanningMode;
  // Must be read-only. Binance adapter and vendor-specific order verification
  // are later work. Merely asserting VERIFIED_ORDER never enables execution.
  quote(request: QuoteRequest, signal: AbortSignal): Promise<unknown[]>;
};
export const GUARD_LIMITS = Object.freeze({ maxBalanceAgeMs: 15000, maxMarketAgeMs: 60000, maxQuoteAgeMs: 15000, minExpiryWindowMs: 5000 });

export class PlanningError extends Error {
  readonly code: 'INVALID_INTENT' | 'INVALID_OPTIONS' | 'INVALID_QUOTE' | 'PROVIDER_FAILURE' | 'PROVIDER_TIMEOUT' | 'CANCELLED';
  constructor(code: PlanningError['code']) { super(code); this.name = 'PlanningError'; this.code = code; }
}
export function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new PlanningError('INVALID_INTENT');
  return value;
}
export function bps(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10000) throw new PlanningError('INVALID_INTENT');
  return value;
}
export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new PlanningError('INVALID_INTENT');
  return (numerator + denominator - 1n) / denominator;
}
export function exposureFloor(intent: CashIntent): bigint {
  const percentFloor = ceilDiv(BigInt(intent.stockBalanceRaw) * BigInt(intent.retainBps), 10000n);
  const absolute = BigInt(intent.absoluteFloorRaw);
  return percentFloor > absolute ? percentFloor : absolute;
}
export function normalizeIntent(value: unknown): CashIntent {
  try {
    const v = dataRecord(value); const m = dataRecord(v.market);
    if (v.chain !== '56' || typeof v.allowClosedMarket !== 'boolean' || typeof m.openState !== 'boolean' || typeof m.marketStatus !== 'string' || m.marketStatus.length > 64 || !(m.reasonCode === null || typeof m.reasonCode === 'string' && m.reasonCode.length <= 64)) throw new PlanningError('INVALID_INTENT');
    const stockToken = address(v.stockToken); const cashToken = address(v.cashToken);
    if (cashToken !== BSC_USDT.toLowerCase() || stockToken === cashToken) throw new PlanningError('INVALID_INTENT');
    const intent: CashIntent = {
      wallet: address(v.wallet), chain: '56', stockToken, cashToken,
      stockBalanceRaw: uint(v.stockBalanceRaw, true), balanceObservedAtMs: timestamp(v.balanceObservedAtMs), cashTargetRaw: uint(v.cashTargetRaw, true),
      retainBps: bps(v.retainBps), absoluteFloorRaw: uint(v.absoluteFloorRaw), maxImpactBps: bps(v.maxImpactBps), maxSlippageBps: bps(v.maxSlippageBps), maxExpectedSurplusRaw: uint(v.maxExpectedSurplusRaw),
      allowClosedMarket: v.allowClosedMarket,
      market: Object.freeze({ observedAtMs: timestamp(m.observedAtMs), openState: m.openState, marketStatus: m.marketStatus, reasonCode: m.reasonCode })
    };
    if (exposureFloor(intent) > BigInt(intent.stockBalanceRaw)) throw new PlanningError('INVALID_INTENT');
    return Object.freeze(intent);
  } catch { throw new PlanningError('INVALID_INTENT'); }
}
export function normalizeQuote(value: unknown): PlanningQuote {
  try {
    const v = dataRecord(value);
    if (v.chain !== '56' || typeof v.id !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(v.id) || typeof v.vendor !== 'string' || !['PcsXRfq', 'InchFusion', 'CowSwap'].includes(v.vendor) || typeof v.minimumOutputBinding !== 'string' || !['UNVERIFIED', 'VERIFIED_ORDER'].includes(v.minimumOutputBinding)) throw new PlanningError('INVALID_QUOTE');
    return Object.freeze({ id: v.id, vendor: v.vendor, wallet: address(v.wallet), chain: '56', stockToken: address(v.stockToken), cashToken: address(v.cashToken),
      inputRaw: uint(v.inputRaw, true), inputFeeRaw: uint(v.inputFeeRaw), expectedGrossOutputRaw: uint(v.expectedGrossOutputRaw, true), minimumGrossOutputRaw: uint(v.minimumGrossOutputRaw, true), outputFeeUpperBoundRaw: uint(v.outputFeeUpperBoundRaw), impactBps: bps(v.impactBps),
      issuedAtMs: timestamp(v.issuedAtMs), expiresAtMs: timestamp(v.expiresAtMs), minimumOutputBinding: v.minimumOutputBinding as PlanningQuote['minimumOutputBinding'] });
  } catch { throw new PlanningError('INVALID_QUOTE'); }
}
export function parseUnits(text: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || typeof text !== 'string' || text.length > 116 || !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(text)) throw new PlanningError('INVALID_INTENT');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new PlanningError('INVALID_INTENT');
  try { return uint((BigInt(whole!) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0')).toString()); }
  catch { throw new PlanningError('INVALID_INTENT'); }
}
export function formatUnits(raw: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new PlanningError('INVALID_INTENT');
  const value = BigInt(uint(raw)); const scale = 10n ** BigInt(decimals);
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (value / scale).toString() + (fraction ? `.${fraction}` : '');
}
