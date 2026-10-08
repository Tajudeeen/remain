import { ReadOnlyBinanceClient, type CallResult } from '../client.ts';
import type { Reader } from '../feasibility.ts';
import type { Query } from '../signing.ts';
import { snapshotRfq } from '../rfq/json.ts';
import { dataRecord } from '../input/data.ts';
import { BSC_USDT, address, selectedMarket, uint } from '../validation.ts';
import { RemainError } from '../errors.ts';
import { readSelectedPosition } from './position.ts';
import { SearchBoundary, SearchStopped } from '../planning/search-boundary.ts';
import { reviewRfqBuild, type RfqReview } from '../rfq/review.ts';
import { orderReviewInput, validateOrderReview, type OrderReviewInput, type CashOrderReview } from '../../web/order-review.js';
import { previewInput, cashTargetRaw, impactWithin, qualifiesPreview, validatePreview, type CashPreview, type PreviewInput, type PreviewRoute } from '../../web/preview.js';

export type LocalCashPreviewer = (input: PreviewInput, signal: AbortSignal) => Promise<CashPreview>;
export type LocalCashReviewer = (input: OrderReviewInput, signal: AbortSignal) => Promise<CashOrderReview>;
export function cashOrderInput(value: unknown): OrderReviewInput {
  try { return orderReviewInput(value); } catch { throw new RemainError('INVALID_INPUT'); }
}
export function projectCashOrder(value: unknown, input: OrderReviewInput, now = Date.now()): CashOrderReview {
  try { return validateOrderReview(value, input, now); } catch { throw new RemainError('UPSTREAM_SCHEMA_INVALID'); }
}
export function localCashReviewer(env: Record<string, string | undefined>, reader?: Reader): LocalCashReviewer | undefined {
  if (env.REMAIN_LOCAL_READ_ONLY !== 'true') return undefined;
  const apiKey = env.BINANCE_WEB3_API_KEY, secretKey = env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey?.trim() || !secretKey?.trim()) throw new RemainError('CONFIG_MISSING');
  const client = reader ?? new ReadOnlyBinanceClient({ apiKey, secretKey });
  return (input, signal) => reviewCashCandidate(input, client, signal, reader ? 'TEST_FIXTURE' : 'LIVE_READ_ONLY');
}
export function cashPreviewInput(value: unknown): PreviewInput {
  try { return previewInput(value); } catch { throw new RemainError('INVALID_INPUT'); }
}
export function projectCashPreview(value: unknown, input: PreviewInput, now = Date.now()): CashPreview {
  try { return validatePreview(value, input, now); } catch { throw new RemainError('UPSTREAM_SCHEMA_INVALID'); }
}
export function localCashPreviewer(env: Record<string, string | undefined>, reader?: Reader): LocalCashPreviewer | undefined {
  if (env.REMAIN_LOCAL_READ_ONLY !== 'true') return undefined;
  const apiKey = env.BINANCE_WEB3_API_KEY, secretKey = env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey?.trim() || !secretKey?.trim()) throw new RemainError('CONFIG_MISSING');
  const client = reader ?? new ReadOnlyBinanceClient({ apiKey, secretKey });
  return (input, signal) => exploreCashTarget(input, client, signal, reader ? 'TEST_FIXTURE' : 'LIVE_READ_ONLY');
}

// This explores estimated output. It deliberately cannot implement QuoteProvider:
// quote estimates contain no verified minimum, debit-fee bound or signed deadline.
export async function exploreCashTarget(value: PreviewInput, reader: Reader, signal: AbortSignal,
  mode: CashPreview['mode'] = 'TEST_FIXTURE', now: () => number = Date.now): Promise<CashPreview> {
  return (await readCashTarget(value, reader, signal, mode, now)).preview;
}
export async function reviewCashCandidate(value: OrderReviewInput, reader: Reader, signal: AbortSignal,
  mode: CashPreview['mode'] = 'TEST_FIXTURE', now: () => number = Date.now): Promise<CashOrderReview> {
  const input = cashOrderInput(value);
  const result = await readCashTarget(input.intent, reader, signal, mode, now, input);
  return projectCashOrder({ kind: 'REMAIN_UNSIGNED_CASH_REVIEW', input, preview: result.preview, rfqReview: result.review,
    estimateChanged: result.preview.probes[0]!.routes[0]!.estimatedOutputRaw !== input.expectedOutputRaw, executionEnabled: false }, input, now());
}
async function readCashTarget(value: PreviewInput, reader: Reader, signal: AbortSignal,
  mode: CashPreview['mode'], now: () => number, selection?: OrderReviewInput): Promise<{ preview: CashPreview; review?: RfqReview; selected?: Record<string, unknown>; build?: Record<string, unknown>; quoteAtMs?: number }> {
  const input = cashPreviewInput(value), started = now();
  if (!Number.isSafeInteger(started) || started < 0) throw new RemainError('AUTH_CLOCK_DRIFT');
  const boundary = new SearchBoundary(now, started, 12000, signal);
  let position: CashPreview['position'] | undefined;
  const fresh = () => {
    const at = boundary.checkpoint();
    if (position && (at - position.observedAtMs > 15000 || performance.now() - boundary.elapsedStart + started - position.observedAtMs > 15000)) throw new RemainError('QUOTE_EXPIRED');
    return at;
  };
  const boundedReader: Reader = { async get(endpoint, query = []) {
    fresh();
    const result = await boundary.run(() => reader.get(endpoint, query, boundary.controller.signal));
    dataRecord(result); const at = fresh();
    if (!Number.isSafeInteger(result.timestamp) || result.timestamp < 0 || result.timestamp > at || at - result.timestamp > 15000) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
    return { ...result, data: snapshotRfq(result.data) };
  } };
  async function read(endpoint: string, query: Query): Promise<CallResult> { return boundedReader.get(endpoint, query, boundary.controller.signal); }
  try {
    position = await readSelectedPosition({ wallet: input.wallet, token: input.token }, boundedReader, boundary.controller.signal, mode, fresh);
    if (position.status !== 'HELD_OBSERVED') throw new RemainError('INSUFFICIENT_POSITION');
    const balance = BigInt(position.balanceRaw!), floor = (balance * BigInt(input.retainBps) + 9999n) / 10000n, max = balance - floor;
    if (max <= 0n) throw new RemainError('INSUFFICIENT_POSITION');
    if (selection && BigInt(selection.amountRaw) > max) throw new RemainError('INSUFFICIENT_POSITION');
    const marketRead = await read('/api/v1/dex/market/rwa/underlying-market', [['binanceChainId', '56'], ['tokenContractAddress', input.token]]);
    const marketData = dataRecord(marketRead.data), status = dataRecord(marketData.statusInfo);
    const market = { ...selectedMarket(marketData, input.token), reasonCode: status.reasonCode == null ? null : status.reasonCode as string, observedAtMs: marketRead.timestamp };
    if ((market.marketStatus === 'closed') === market.openState || market.reasonCode === 'TRADING' && !market.openState ||
        market.reasonCode === 'MARKET_CLOSED' && market.openState || !market.openState && !input.allowClosedMarket) throw new RemainError('MARKET_BLOCKED');
    let decimals: number | null = null, target: string | null = null;
    const probes: CashPreview['probes'][number][] = [], seen = new Set<string>(), ids = new Set<string>();
    let best: CashPreview['candidate'] = null, next = selection ? BigInt(selection.amountRaw) : max, stopReason: CashPreview['stopReason'] = 'SEARCH_LIMIT';
    let review: RfqReview | undefined;
    let order: { selected: Record<string, unknown>; build: Record<string, unknown>; quoteAtMs: number } | undefined;
    for (let attempt = 0; attempt < 8; attempt++) {
      fresh(); const amount = next.toString(); seen.add(amount);
      const result = await read('/api/v1/dex/aggregator/quote', [['binanceChainId', '56'], ['amount', amount],
        ['fromTokenAddress', input.token], ['toTokenAddress', BSC_USDT.toLowerCase()], ['userWalletAddress', input.wallet]]);
      const batch = result.data;
      if (!Array.isArray(batch) || batch.length > 16) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
      // snapshotRfq has already rejected sparse arrays, getters and executable data.
      const admit = (value: unknown, checkId = true): PreviewRoute => {
        const r = dataRecord(value), from = dataRecord(r.fromToken), to = dataRecord(r.toToken);
        if (r.binanceChainId !== '56' || (checkId ? r.executionMode !== 'RFQ' : r.executionMode !== undefined && r.executionMode !== 'RFQ') || r.fromTokenAmount !== amount ||
            address(from.tokenContractAddress) !== input.token || address(to.tokenContractAddress) !== BSC_USDT.toLowerCase() ||
            !['PcsXRfq', 'InchFusion', 'CowSwap'].includes(r.vendorName as string) || checkId && (typeof r.quoteId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(r.quoteId) || ids.has(r.quoteId)) ||
            from.decimal !== String(position!.stock.decimals) || typeof to.decimal !== 'string' || !/^(0|[1-9][0-9]?)$/.test(to.decimal) || Number(to.decimal) > 36 ||
            from.isHoneyPot !== false || to.isHoneyPot !== false || typeof from.taxRate !== 'string' || typeof to.taxRate !== 'string' || !/^0(?:\.0+)?$/.test(from.taxRate) || !/^0(?:\.0+)?$/.test(to.taxRate) ||
            r.feeAmount !== null || r.feeToken !== null || r.actualSwapAmount !== null) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        if (decimals !== null && decimals !== Number(to.decimal)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        decimals = Number(to.decimal); target = cashTargetRaw(input.cashTarget, decimals); if (checkId) ids.add(r.quoteId as string);
        const route = { vendor: r.vendorName as PreviewRoute['vendor'], estimatedOutputRaw: uint(r.toTokenAmount, true), impactPercent: r.priceImpactPercent as string | null };
        impactWithin(route.impactPercent, input.maxImpactBps); return Object.freeze(route);
      };
      let routes: PreviewRoute[] = batch.map(r => admit(r));
      let selected: Record<string, unknown> | undefined;
      if (selection) {
        if (result.timestamp < market.observedAtMs) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        const matching = routes.map((r, i) => ({ r, i })).filter(({ r }) => r.vendor === selection.vendor);
        if (matching.length !== 1) throw new RemainError('RFQ_UNAVAILABLE');
        if (decimals !== selection.cashDecimals) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        if (!qualifiesPreview(matching[0]!.r, input, target!)) throw new RemainError('RFQ_UNAVAILABLE');
        selected = dataRecord(batch[matching[0]!.i]); routes = [matching[0]!.r];
      }
      probes.push({ inputRaw: amount, observedAtMs: result.timestamp, routes });
      for (let j = 0; j < routes.length; j++) {
        const route = routes[j]!;
        if (qualifiesPreview(route, input, target!) && (!best || next < BigInt(probes[best.probeIndex]!.inputRaw) ||
            amount === probes[best.probeIndex]!.inputRaw && BigInt(route.estimatedOutputRaw) > BigInt(probes[best.probeIndex]!.routes[best.routeIndex]!.estimatedOutputRaw))) best = { probeIndex: attempt, routeIndex: j };
      }
      if (selection) {
        // One refreshed quote for the explicitly selected input and vendor.
        // No replacement input, fallback venue, signature or automatic retry.
        const built = await read('/api/v1/dex/aggregator/swap', [['binanceChainId', '56'], ['amount', amount],
          ['fromTokenAddress', input.token], ['toTokenAddress', BSC_USDT.toLowerCase()], ['userWalletAddress', input.wallet],
          ['quoteId', selected!.quoteId as string], ['slippagePercent', '0.5'], ['autoSlippage', 'false'], ['approveTransaction', 'false'],
          ['priceImpactProtectionPercent', (input.maxImpactBps / 100).toString()]]);
        if (built.timestamp < result.timestamp) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        const build = dataRecord(built.data), builtRoute = admit(build.routerResult, false);
        const builtRawRoute = dataRecord(build.routerResult);
        if (builtRawRoute.quoteId !== undefined && builtRawRoute.quoteId !== selected!.quoteId) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        if (builtRoute.impactPercent !== routes[0]!.impactPercent || !qualifiesPreview(builtRoute, input, target!)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        review = reviewRfqBuild(build, selected, { token: input.token, amount, wallet: input.wallet });
        order = { selected: selected!, build, quoteAtMs: result.timestamp };
        fresh(); stopReason = 'EXHAUSTED'; break;
      }
      // A proportional seed improves the first result. Remaining probes sample
      // unobserved gaps. No monotonic-price assumption or global optimum claim.
      const top = routes.reduce((largest, r) => BigInt(r.estimatedOutputRaw) > largest ? BigInt(r.estimatedOutputRaw) : largest, 0n);
      const seed = top && target ? (BigInt(target) * max + top - 1n) / top : 0n;
      const cap = best ? BigInt(probes[best.probeIndex]!.inputRaw) : max;
      if (attempt === 0 && seed > 0n && seed <= max && !seen.has(seed.toString())) next = seed;
      else if (!seen.has('1')) next = 1n;
      else {
        const points = [0n, ...[...seen].map(BigInt).filter(p => p <= cap), cap + 1n].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        let gap = 0n, chosen = 0n;
        for (let i = 1; i < points.length; i++) { const left = points[i - 1]!, right = points[i]!; if (right - left > gap && right - left > 1n) { gap = right - left; chosen = (left + right) / 2n; } }
        if (!chosen) { stopReason = 'EXHAUSTED'; break; } next = chosen;
      }
      if (attempt < 7) await boundary.run(() => new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); boundary.controller.signal.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, 200);
        boundary.controller.signal.addEventListener('abort', finish, { once: true });
        if (boundary.controller.signal.aborted) finish();
      }));
    }
    const at = fresh();
    const preview = projectCashPreview({ kind: 'REMAIN_CASH_PREVIEW', mode, input, position, market, cashDecimals: decimals, cashTargetRaw: target,
      floorRaw: floor.toString(), maxInputRaw: max.toString(), probes, candidate: best, stopReason, createdAtMs: at,
      executionEnabled: false, liveGate: 'UNVERIFIED', minimumOutputBinding: 'UNVERIFIED', fees: 'UNVERIFIED', ownership: 'NOT_AUTHENTICATED' }, input, at);
    return { preview, ...(review ? { review } : {}), ...order };
  } catch (error) {
    if (boundary.reason === 'CLOCK_REGRESSION') throw new RemainError('AUTH_CLOCK_DRIFT');
    if (boundary.reason === 'SEARCH_TIME_BUDGET' && !signal.aborted) throw new RemainError('UPSTREAM_TIMEOUT');
    if (signal.aborted || error instanceof SearchStopped && error.code !== 'CLOCK_REGRESSION') throw new RemainError('REQUEST_CANCELLED');
    if (error instanceof SearchStopped && error.code === 'CLOCK_REGRESSION') throw new RemainError('AUTH_CLOCK_DRIFT');
    if (error instanceof RemainError && error.code !== 'INVALID_INPUT') throw error;
    throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  } finally { boundary.close(); }
}

// Private server port. Raw payloads never enter the read-only browser response.
export async function prepareCashCandidate(value: OrderReviewInput, reader: Reader, signal: AbortSignal, now: () => number = Date.now) {
  const input = cashOrderInput(value);
  const result = await readCashTarget(input.intent, reader, signal, 'LIVE_READ_ONLY', now, input);
  if (!result.selected || !result.build || result.quoteAtMs === undefined) throw new RemainError('RFQ_OPAQUE');
  return { input, preview: result.preview, selected: result.selected, build: result.build, quoteAtMs: result.quoteAtMs };
}
