import { solveCash } from '../src/planning/solver.ts';
import { formatUnits, parseUnits, type CashIntent, type QuoteProvider } from '../src/planning/model.ts';
import { BSC_USDT } from '../src/validation.ts';

// Entirely synthetic. No API credentials, HTTP request or wallet access.
const now = Date.now();
const intent: CashIntent = {
  wallet: '0x1111111111111111111111111111111111111111', chain: '56', stockToken: '0x2222222222222222222222222222222222222222', cashToken: BSC_USDT.toLowerCase(),
  stockBalanceRaw: '100', balanceObservedAtMs: now, cashTargetRaw: parseUnits('25', 18), retainBps: 7000, absoluteFloorRaw: '0', maxImpactBps: 50, maxSlippageBps: 50, maxExpectedSurplusRaw: parseUnits('1', 18),
  allowClosedMarket: false, market: { observedAtMs: now, openState: true, marketStatus: 'regular', reasonCode: null }
};
const fixtureProvider: QuoteProvider = { mode: 'TEST_FIXTURE', async quote(request) {
  const output = BigInt(request.inputRaw) * 10n ** 18n;
  return [{ id: `synthetic-${request.inputRaw}`, vendor: 'PcsXRfq', ...request, inputFeeRaw: '0', expectedGrossOutputRaw: output.toString(), minimumGrossOutputRaw: output.toString(), outputFeeUpperBoundRaw: '0', impactBps: 0,
    issuedAtMs: now, expiresAtMs: now + 30000, minimumOutputBinding: 'VERIFIED_ORDER' }];
} };
for (const scenario of [
  { name: 'Raise 25 USDT and retain at least 70%', input: intent },
  { name: 'Raise 40 USDT and retain at least 70%', input: { ...intent, cashTargetRaw: parseUnits('40', 18) } },
  { name: 'Closed underlying market without permission', input: { ...intent, market: { observedAtMs: now, openState: false, marketStatus: 'closed', reasonCode: 'MARKET_CLOSED' } } }
]) {
  const result = await solveCash(scenario.input, fixtureProvider, { now: () => now, minSpacingMs: 0, maxRequests: 32 });
  console.log(JSON.stringify({ scenario: scenario.name, mode: result.mode, status: result.status, executionEnabled: result.executionEnabled,
    reasons: result.reasons, quotedInputs: result.attempts.length, ...(result.candidate ? { sellSyntheticUnits: result.candidate.quote.inputRaw, retainSyntheticUnits: result.candidate.verdict.amounts!.remainingStockRaw, minimumSyntheticUSDT: formatUnits(result.candidate.verdict.amounts!.minimumNetCashRaw, 18) } : {}),
    planHash: result.planHash, notice: 'Synthetic arithmetic rehearsal only. No Binance integration, wallet signature or settlement is proven.' }, null, 2));
}
