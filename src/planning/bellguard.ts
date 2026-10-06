import { checkMarket } from '../validation.ts';
import { exposureFloor, GUARD_LIMITS, normalizeIntent, normalizeQuote, timestamp } from './model.ts';

export type GuardReason = 'INVALID_INTENT' | 'INVALID_QUOTE' | 'BALANCE_STALE' | 'MARKET_STALE' | 'MARKET_BLOCKED' | 'MARKET_INCONSISTENT' | 'CLOSED_MARKET_PERMISSION_REQUIRED' | 'IDENTITY_MISMATCH' | 'AMOUNT_MISMATCH' | 'FLOOR_BREACH' | 'QUOTE_STALE' | 'QUOTE_EXPIRING' | 'INVALID_OUTPUT_BOUNDS' | 'MINIMUM_OUTPUT_UNVERIFIED' | 'CASH_TARGET_SHORTFALL' | 'SLIPPAGE_LIMIT' | 'IMPACT_LIMIT' | 'SURPLUS_LIMIT';
export type GuardVerdict = {
  status: 'PASS_FOR_PLANNING' | 'BLOCKED'; reasons: GuardReason[];
  warnings: string[]; executionEnabled: false;
  amounts?: { retainedFloorRaw: string; remainingStockRaw: string; totalStockDebitRaw: string; expectedNetCashRaw: string; maximumExpectedNetCashRaw: string; minimumNetCashRaw: string; expectedSurplusRaw: string };
};
export function intentReasons(input: unknown, nowMs: number): GuardReason[] {
  try {
    const intent = normalizeIntent(input); timestamp(nowMs);
    const reasons: GuardReason[] = [];
    if (intent.balanceObservedAtMs > nowMs || nowMs - intent.balanceObservedAtMs > GUARD_LIMITS.maxBalanceAgeMs) reasons.push('BALANCE_STALE');
    if (intent.market.observedAtMs > nowMs || nowMs - intent.market.observedAtMs > GUARD_LIMITS.maxMarketAgeMs) reasons.push('MARKET_STALE');
    try { checkMarket(intent.market); } catch { reasons.push('MARKET_BLOCKED'); }
    const { openState, marketStatus } = intent.market;
    if (marketStatus === 'closed' && openState || ['regular', 'premarket', 'postmarket', 'overnight'].includes(marketStatus) && !openState || intent.market.reasonCode === 'MARKET_CLOSED' && openState || intent.market.reasonCode === 'TRADING' && !openState) reasons.push('MARKET_INCONSISTENT');
    if (!openState && !intent.allowClosedMarket) reasons.push('CLOSED_MARKET_PERMISSION_REQUIRED');
    if (exposureFloor(intent) === BigInt(intent.stockBalanceRaw)) reasons.push('FLOOR_BREACH');
    return reasons;
  } catch { return ['INVALID_INTENT']; }
}

export function bellGuard(input: unknown, candidate: unknown, requestedInputRaw: string, nowMs: number): GuardVerdict {
  const reasons = intentReasons(input, nowMs);
  const warnings = ['Planning checks do not authorize execution. Order semantics and live integration still need verification.'];
  let intent; let quote;
  try { intent = normalizeIntent(input); } catch { return { status: 'BLOCKED', reasons: ['INVALID_INTENT'], warnings, executionEnabled: false }; }
  try { quote = normalizeQuote(candidate); } catch { return { status: 'BLOCKED', reasons: [...reasons, 'INVALID_QUOTE'], warnings, executionEnabled: false }; }
  if (quote.wallet !== intent.wallet || quote.stockToken !== intent.stockToken || quote.cashToken !== intent.cashToken || quote.chain !== intent.chain) reasons.push('IDENTITY_MISMATCH');
  if (quote.inputRaw !== requestedInputRaw) reasons.push('AMOUNT_MISMATCH');
  if (quote.issuedAtMs > nowMs || nowMs - quote.issuedAtMs > GUARD_LIMITS.maxQuoteAgeMs) reasons.push('QUOTE_STALE');
  if (quote.expiresAtMs <= quote.issuedAtMs || quote.expiresAtMs - nowMs < GUARD_LIMITS.minExpiryWindowMs) reasons.push('QUOTE_EXPIRING');
  if (quote.minimumOutputBinding !== 'VERIFIED_ORDER') reasons.push('MINIMUM_OUTPUT_UNVERIFIED');
  if (quote.impactBps > intent.maxImpactBps) reasons.push('IMPACT_LIMIT');
  const gross = BigInt(quote.expectedGrossOutputRaw); const minimum = BigInt(quote.minimumGrossOutputRaw); const fee = BigInt(quote.outputFeeUpperBoundRaw);
  const debit = BigInt(quote.inputRaw) + BigInt(quote.inputFeeRaw); const balance = BigInt(intent.stockBalanceRaw); const floor = exposureFloor(intent);
  if (debit > balance || balance - debit < floor) reasons.push('FLOOR_BREACH');
  if (minimum > gross || fee >= minimum || gross > ((1n << 256n) - 1n)) reasons.push('INVALID_OUTPUT_BOUNDS');
  if (reasons.includes('INVALID_OUTPUT_BOUNDS')) return { status: 'BLOCKED', reasons: [...new Set(reasons)], warnings, executionEnabled: false };
  const expectedNet = gross - fee; const minimumNet = minimum - fee; const target = BigInt(intent.cashTargetRaw);
  // Compare exact products, so fractional basis-point breaches never round down.
  if ((gross - minimum) * 10000n > gross * BigInt(intent.maxSlippageBps)) reasons.push('SLIPPAGE_LIMIT');
  if (minimumNet < target) reasons.push('CASH_TARGET_SHORTFALL');
  // A fee upper bound protects the cash minimum, but cannot be subtracted
  // from the maximum expected surplus. The actual fee could be zero.
  const surplus = gross > target ? gross - target : 0n;
  if (surplus > BigInt(intent.maxExpectedSurplusRaw)) reasons.push('SURPLUS_LIMIT');
  if (!intent.market.openState) warnings.push('Underlying market is closed. Explicit planning permission was supplied.');
  const amounts = { retainedFloorRaw: floor.toString(), remainingStockRaw: (balance - debit).toString(), totalStockDebitRaw: debit.toString(), expectedNetCashRaw: expectedNet.toString(), maximumExpectedNetCashRaw: gross.toString(), minimumNetCashRaw: minimumNet.toString(), expectedSurplusRaw: surplus.toString() };
  return { status: reasons.length ? 'BLOCKED' : 'PASS_FOR_PLANNING', reasons: [...new Set(reasons)], warnings, executionEnabled: false, amounts };
}
