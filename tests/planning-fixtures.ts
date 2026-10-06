import { BSC_USDT } from '../src/validation.ts';
import type { CashIntent, PlanningQuote, QuoteRequest } from '../src/planning/model.ts';
export const clock = 1800000000000;
export const wallet = '0x1111111111111111111111111111111111111111';
export const stock = '0x2222222222222222222222222222222222222222';
export function intent(overrides: Partial<CashIntent> = {}): CashIntent {
  return { wallet, chain: '56', stockToken: stock, cashToken: BSC_USDT.toLowerCase(), stockBalanceRaw: '100', balanceObservedAtMs: clock,
    cashTargetRaw: '20', retainBps: 7000, absoluteFloorRaw: '0', maxImpactBps: 50, maxSlippageBps: 50, maxExpectedSurplusRaw: '100', allowClosedMarket: false,
    market: { observedAtMs: clock, openState: true, marketStatus: 'regular', reasonCode: null }, ...overrides };
}
export function quote(request: QuoteRequest, overrides: Partial<PlanningQuote> = {}): PlanningQuote {
  return { id: `fixture-${request.inputRaw}`, vendor: 'PcsXRfq', ...request, inputFeeRaw: '0', expectedGrossOutputRaw: request.inputRaw,
    minimumGrossOutputRaw: request.inputRaw, outputFeeUpperBoundRaw: '0', impactBps: 0, issuedAtMs: clock, expiresAtMs: clock + 30000, minimumOutputBinding: 'VERIFIED_ORDER', ...overrides };
}
export const fast = { now: () => clock, minSpacingMs: 0 };
