import { parseUnits, type CashIntent, type QuoteProvider } from '../planning/model.ts';
import { solveCash } from '../planning/solver.ts';
import { BSC_USDT, record } from '../validation.ts';

export class RehearsalError extends Error {
  readonly code: 'INVALID_REQUEST' | 'BODY_TOO_LARGE';
  constructor(code: RehearsalError['code']) { super(code); this.code = code; }
}
export type RehearsalInput = {
  cashTarget: string; retainPercent: number; maxImpactPercent: string;
  market: 'regular' | 'closed' | 'pause'; allowClosedMarket: boolean;
};
const fields = ['cashTarget', 'retainPercent', 'maxImpactPercent', 'market', 'allowClosedMarket'];
export function validateRehearsalInput(input: unknown): RehearsalInput {
  try {
    const v = record(input);
    if (Object.keys(v).length !== fields.length || fields.some((key) => !Object.hasOwn(v, key))) throw new Error();
    if (typeof v.cashTarget !== 'string' || v.cashTarget.length > 8 || !/^(0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(v.cashTarget)) throw new Error();
    const cash = BigInt(parseUnits(v.cashTarget, 18));
    if (cash <= 0n || cash > BigInt(parseUnits('10000', 18))) throw new Error();
    if (typeof v.retainPercent !== 'number' || !Number.isInteger(v.retainPercent) || v.retainPercent < 0 || v.retainPercent > 100) throw new Error();
    if (typeof v.maxImpactPercent !== 'string' || !/^(0|[1-5])(?:\.[0-9]{1,2})?$/.test(v.maxImpactPercent) || BigInt(parseUnits(v.maxImpactPercent, 2)) > 500n) throw new Error();
    if (!['regular', 'closed', 'pause'].includes(String(v.market)) || typeof v.allowClosedMarket !== 'boolean') throw new Error();
    return Object.freeze({ cashTarget: v.cashTarget, retainPercent: v.retainPercent, maxImpactPercent: v.maxImpactPercent, market: v.market as RehearsalInput['market'], allowClosedMarket: v.allowClosedMarket });
  } catch { throw new RehearsalError('INVALID_REQUEST'); }
}

// Fictional position, addresses, rate and quote. No Binance/client imports,
// environment credentials, RPC, wallet capability or outbound requests.
export async function rehearsePlan(input: unknown, signal?: AbortSignal) {
  const request = validateRehearsalInput(input); const observed = Date.now();
  const intent: CashIntent = {
    wallet: '0x1111111111111111111111111111111111111111', chain: '56',
    stockToken: '0x2222222222222222222222222222222222222222', cashToken: BSC_USDT.toLowerCase(),
    stockBalanceRaw: '100', balanceObservedAtMs: observed, cashTargetRaw: parseUnits(request.cashTarget, 18),
    retainBps: request.retainPercent * 100, absoluteFloorRaw: '0', maxImpactBps: Number(parseUnits(request.maxImpactPercent, 2)),
    maxSlippageBps: 50, maxExpectedSurplusRaw: parseUnits('1', 18), allowClosedMarket: request.allowClosedMarket,
    market: { observedAtMs: observed, openState: request.market === 'regular', marketStatus: request.market,
      reasonCode: request.market === 'closed' ? 'MARKET_CLOSED' : request.market === 'pause' ? 'MARKET_PAUSED' : null }
  };
  const provider: QuoteProvider = { mode: 'TEST_FIXTURE', async quote(query) {
    const issued = Date.now(); const output = (BigInt(query.inputRaw) * 10n ** 18n).toString();
    return [{ id: `fixture-${query.inputRaw}`, vendor: 'PcsXRfq', ...query, inputFeeRaw: '0',
      expectedGrossOutputRaw: output, minimumGrossOutputRaw: output, outputFeeUpperBoundRaw: '0',
      impactBps: 20, issuedAtMs: issued, expiresAtMs: issued + 30000, minimumOutputBinding: 'VERIFIED_ORDER' }];
  } };
  const plan = await solveCash(intent, provider, { maxRequests: 64, maxDurationMs: 1500, minSpacingMs: 0, ...(signal ? { signal } : {}) });
  // The earliest freshness boundary is the balance snapshot, regardless of
  // the quote's longer nominal expiry. This is an inspection limit only.
  return {
    kind: 'SYNTHETIC_PLANNING_RECORD', mode: 'TEST_FIXTURE', executionEnabled: false,
    notice: 'Fictional data. No Binance access, wallet signature, order or settlement is proven.',
    fixture: { name: 'Demo Stock', symbol: 'R-DEMO', balance: '100', stockDecimals: 0, cashDecimals: 18, unitPriceUSDT: '1', impactPercent: '0.20', fees: '0' },
    reviewUntilMs: observed + 15000, plan
  } as const;
}
