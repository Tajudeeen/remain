import { RemainError } from '../errors.ts';
import { digest } from '../validation.ts';
import { bellGuard, intentReasons, type GuardVerdict } from './bellguard.ts';
import { exposureFloor, normalizeIntent, PlanningError, timestamp, type CashIntent, type PlanningMode, type PlanningQuote, type QuoteProvider, type QuoteRequest } from './model.ts';
import { admitQuoteSet, SearchBoundary, SearchStopped } from './search-boundary.ts';

type Attempt = { inputRaw: string; status: 'COMPLETED' | 'BLOCKED'; quoteCount: number | null; outcomes: { quoteId: string; verdict: GuardVerdict }[]; errorCode?: string };
type Candidate = { quote: PlanningQuote; verdict: GuardVerdict };
export type PlanResult = {
  version: 1; mode: PlanningMode; status: 'PLANNED_FOR_REVIEW' | 'BLOCKED'; executionEnabled: false;
  intent: CashIntent; createdAtMs: number; evaluatedAtMs: number;
  reasons: string[]; searchStopReasons: string[]; attempts: Attempt[]; candidate?: Candidate; planHash: string;
  searchedAllIntegerInputs: boolean; optimality: 'SMALLEST_SAFE_OBSERVED_DEBIT';
  limitations: string[];
};
type Options = { maxRequests?: number; maxDurationMs?: number; requestTimeoutMs?: number; minSpacingMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal };

function chooseNext(seen: Set<bigint>, maxInput: bigint, best: bigint | undefined, seeds: bigint[]): bigint | undefined {
  for (const seed of seeds) if (!seen.has(seed)) return seed;
  const upper = best === undefined || best > maxInput + 1n ? maxInput + 1n : best;
  const points = [0n, ...[...seen].filter((n) => n < upper), upper].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  let width = 1n; let midpoint: bigint | undefined;
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1]!; const right = points[index]!;
    if (right - left > width) { width = right - left; midpoint = (left + right) / 2n; }
  }
  return midpoint;
}
async function boundedQuote(provider: QuoteProvider, query: QuoteRequest, timeoutMs: number, signal: AbortSignal, onStart: () => void): Promise<unknown[]> {
  if (signal?.aborted) throw new PlanningError('CANCELLED');
  const controller = new AbortController();
  let onAbort: (() => void) | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
  const blocked = new Promise<never>((_resolve, reject) => {
    onAbort = () => { controller.abort(); reject(new PlanningError('CANCELLED')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new PlanningError('PROVIDER_TIMEOUT')); }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new PlanningError('CANCELLED');
      onStart();
      return provider.quote(query, controller.signal);
    }), blocked]);
  } finally { if (timer) clearTimeout(timer); if (onAbort) signal?.removeEventListener('abort', onAbort); }
}
async function spacingDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new PlanningError('CANCELLED');
  let timer: ReturnType<typeof setTimeout> | undefined; let onAbort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(resolve, ms);
      onAbort = () => reject(new PlanningError('CANCELLED'));
      signal.addEventListener('abort', onAbort, { once: true });
    });
  } finally { if (timer) clearTimeout(timer); if (onAbort) signal.removeEventListener('abort', onAbort); }
}

export async function solveCash(input: unknown, provider: QuoteProvider, options: Options = {}): Promise<PlanResult> {
  const maxRequests = options.maxRequests ?? 24; const maxDurationMs = options.maxDurationMs ?? 12000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 3000; const minSpacingMs = options.minSpacingMs ?? 250;
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 64 || !Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 15000 || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 8000 || !Number.isInteger(minSpacingMs) || minSpacingMs < 0 || minSpacingMs > 1000 || !['TEST_FIXTURE', 'LIVE_READ_ONLY'].includes(provider.mode)) throw new PlanningError('INVALID_OPTIONS');
  if (provider.mode === 'LIVE_READ_ONLY' && minSpacingMs < 200) throw new PlanningError('INVALID_OPTIONS');
  const now = options.now ?? Date.now;
  const started = timestamp(now()); const intent = normalizeIntent(input); const mode = provider.mode;
  // Detach intent from caller mutation before the first asynchronous boundary.
  const maxInput = BigInt(intent.stockBalanceRaw) - exposureFloor(intent);
  const attempts: Attempt[] = []; const seen = new Set<bigint>(); const candidates: Candidate[] = [];
  const reasons: string[] = intentReasons(intent, started);
  const searchStopReasons: string[] = [];
  const seeds: bigint[] = [];
  if (maxInput <= BigInt(maxRequests)) { for (let n = 1n; n <= maxInput; n++) seeds.push(n); }
  else {
    seeds.push(maxInput, 1n);
    const count = Math.min(8, maxRequests);
    for (let index = 1; index < count - 1; index++) seeds.push(1n + (maxInput - 1n) * BigInt(index) / BigInt(count - 1));
  }
  let lastRequest: { elapsed: number; wall: number } | undefined;
  let fatal = reasons.length > 0;
  const boundary = new SearchBoundary(now, started, maxDurationMs, options.signal);
  const sleep = options.sleep ?? ((ms: number) => spacingDelay(ms, boundary.controller.signal));
  const recordStop = (error: unknown): string => {
    const code = boundary.reason ?? (error instanceof RemainError || error instanceof PlanningError || error instanceof SearchStopped ? error.code : 'PROVIDER_FAILURE');
    if (code === 'SEARCH_TIME_BUDGET') searchStopReasons.push(code);
    else { reasons.push(code); fatal = true; }
    return code;
  };
  let completed: number;
  try {
    for (let iteration = 0; !fatal && iteration < maxRequests; iteration++) {
      const atStart = boundary.checkpoint();
      if (lastRequest !== undefined) {
        const wait = Math.ceil(Math.max(0, minSpacingMs - (performance.now() - lastRequest.elapsed), minSpacingMs - (atStart - lastRequest.wall)));
        if (wait > 0) await boundary.run(() => sleep(wait));
      }
      const atRequest = boundary.checkpoint();
      const current = candidates.filter((c) => bellGuard(intent, c.quote, c.quote.inputRaw, atRequest).status === 'PASS_FOR_PLANNING');
      const best = current.reduce<bigint | undefined>((n, c) => {
        const debit = BigInt(c.verdict.amounts!.totalStockDebitRaw);
        return n === undefined || debit < n ? debit : n;
      }, undefined);
      const next = chooseNext(seen, maxInput, best, seeds); if (next === undefined) break;
      seen.add(next);
      const query = Object.freeze({ wallet: intent.wallet, chain: intent.chain, stockToken: intent.stockToken, cashToken: intent.cashToken, inputRaw: next.toString() });
      const attempt: Attempt = { inputRaw: next.toString(), status: 'BLOCKED', quoteCount: null, outcomes: [] };
      attempts.push(attempt);
      try {
        const raw = await boundary.run(() => boundedQuote(provider, query, requestTimeoutMs, boundary.controller.signal, () => { lastRequest = { elapsed: performance.now(), wall: atRequest }; }));
        const after = boundary.checkpoint();
        const quotes = admitQuoteSet(raw);
        const reviewed = quotes.map((quote) => ({ quote, verdict: bellGuard(intent, quote, next.toString(), after) }));
        if (reviewed.some(({ verdict }) => verdict.reasons.some((r) => ['IDENTITY_MISMATCH', 'AMOUNT_MISMATCH'].includes(r)))) throw new PlanningError('INVALID_QUOTE');
        attempt.quoteCount = quotes.length;
        for (const { quote, verdict } of reviewed) {
          attempt.outcomes.push({ quoteId: quote.id, verdict });
          if (verdict.status === 'PASS_FOR_PLANNING') candidates.push({ quote, verdict });
        }
        attempt.status = 'COMPLETED';
      } catch (error) {
        attempt.errorCode = recordStop(error); break;
      }
    }
  } catch (error) { recordStop(error); }
  finally {
    try { completed = boundary.finish(); if (boundary.reason) recordStop(new SearchStopped(boundary.reason)); }
    finally { boundary.close(); }
  }
  const eligible = fatal ? [] : candidates.map((c) => ({ quote: c.quote, verdict: bellGuard(intent, c.quote, c.quote.inputRaw, completed) })).filter((c) => c.verdict.status === 'PASS_FOR_PLANNING');
  eligible.sort((a, b) => {
    const debitA = BigInt(a.verdict.amounts!.totalStockDebitRaw); const debitB = BigInt(b.verdict.amounts!.totalStockDebitRaw);
    // Smallest total stock debit, including any input fee. Then input quantity,
    // surplus, venue and quote ID for a deterministic tie-break.
    for (const [left, right] of [[debitA, debitB], [BigInt(a.quote.inputRaw), BigInt(b.quote.inputRaw)], [BigInt(a.verdict.amounts!.expectedSurplusRaw), BigInt(b.verdict.amounts!.expectedSurplusRaw)]] as const) if (left !== right) return left < right ? -1 : 1;
    const keyA = `${a.quote.vendor}:${a.quote.id}`; const keyB = `${b.quote.vendor}:${b.quote.id}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
  const candidate = eligible[0];
  if (attempts.length === maxRequests) searchStopReasons.push('SEARCH_REQUEST_BUDGET');
  if (!candidate && !reasons.length) reasons.push('NO_SAFE_QUOTE_IN_SEARCH');
  const result = {
    version: 1 as const, mode, status: candidate ? 'PLANNED_FOR_REVIEW' as const : 'BLOCKED' as const, executionEnabled: false as const,
    intent, createdAtMs: started, evaluatedAtMs: completed,
    reasons: [...new Set(reasons)], searchStopReasons: [...new Set(searchStopReasons)], attempts, ...(candidate ? { candidate } : {}),
    searchedAllIntegerInputs: BigInt(seen.size) === maxInput && attempts.every((a) => a.status === 'COMPLETED'),
    optimality: 'SMALLEST_SAFE_OBSERVED_DEBIT' as const,
    limitations: ['No signature, approval or submission capability exists.', 'Provider mode and minimum-output metadata are adapter assertions, not independent live evidence.', 'Quotes change and may be nonmonotonic. Unsampled input amounts can be better.', 'The exposure floor bounds planned token quantity, not dollar value or concurrent wallet activity.', 'Gas funding and vendor-specific fee/order enforcement still require a live adapter.']
  };
  const hash = digest(result);
  return deepFreeze({ ...result, planHash: hash });
}
export function recheckPlan(plan: PlanResult, nowMs: number): GuardVerdict {
  try {
    const { planHash, ...body } = plan;
    if (plan.executionEnabled !== false || digest(body) !== planHash || plan.status !== 'PLANNED_FOR_REVIEW' || !plan.candidate) throw new Error('invalid plan');
    return bellGuard(plan.intent, plan.candidate.quote, plan.candidate.quote.inputRaw, nowMs);
  } catch { return { status: 'BLOCKED', reasons: ['INVALID_QUOTE'], warnings: ['Plan checksum or structure failed. This checksum does not authenticate provider data.'], executionEnabled: false }; }
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}
