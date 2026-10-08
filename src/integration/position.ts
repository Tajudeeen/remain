import { ReadOnlyBinanceClient, type CallResult } from '../client.ts';
import type { Reader } from '../feasibility.ts';
import type { Query } from '../signing.ts';
import { dataRecord } from '../input/data.ts';
import { snapshotRfq } from '../rfq/json.ts';
import { address, findStock, uint } from '../validation.ts';
import { RemainError } from '../errors.ts';
import { validatePosition, type PositionInput, type PositionRead } from '../../web/position.js';

export type { PositionInput, PositionRead } from '../../web/position.js';
export type LocalPositionReader = (input: PositionInput, signal: AbortSignal) => Promise<PositionRead>;
export function positionInput(input: unknown): PositionInput {
  try {
    const r = dataRecord(input);
    if (Object.keys(r).length !== 2 || !Object.hasOwn(r, 'wallet') || !Object.hasOwn(r, 'token')) throw new Error();
    return Object.freeze({ wallet: address(r.wallet), token: address(r.token) });
  } catch { throw new RemainError('INVALID_INPUT'); }
}
export function projectPosition(value: unknown, input: PositionInput, now = Date.now()): PositionRead {
  try { return validatePosition(value, input, now); }
  catch { throw new RemainError('UPSTREAM_SCHEMA_INVALID'); }
}

// Only an opt-in loopback server imports this factory. No evidence files,
// balances, keys or provider payloads are written by this path.
export function localPositionReader(env: Record<string, string | undefined>, reader?: Reader): LocalPositionReader | undefined {
  if (env.REMAIN_LOCAL_READ_ONLY !== 'true') return undefined;
  const apiKey = env.BINANCE_WEB3_API_KEY, secretKey = env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey?.trim() || !secretKey?.trim()) throw new RemainError('CONFIG_MISSING');
  const client = reader ?? new ReadOnlyBinanceClient({ apiKey, secretKey });
  return (input, signal) => readSelectedPosition(input, client, signal, reader ? 'TEST_FIXTURE' : 'LIVE_READ_ONLY');
}

export async function readSelectedPosition(rawInput: PositionInput, reader: Reader, signal: AbortSignal,
  mode: PositionRead['mode'] = 'TEST_FIXTURE', now: () => number = Date.now): Promise<PositionRead> {
  const input = positionInput(rawInput); let previous = now();
  if (!Number.isSafeInteger(previous) || previous < 0) throw new RemainError('AUTH_CLOCK_DRIFT');
  const clock = () => {
    const current = now();
    if (!Number.isSafeInteger(current) || current < 0 || current < previous) throw new RemainError('AUTH_CLOCK_DRIFT');
    previous = current; return current;
  };
  async function read(endpoint: string, query: Query): Promise<CallResult> {
    if (signal.aborted) throw new RemainError('REQUEST_CANCELLED'); clock();
    const result = await reader.get(endpoint, query, signal);
    if (signal.aborted) throw new RemainError('REQUEST_CANCELLED');
    dataRecord(result);
    const current = clock();
    if (!Number.isSafeInteger(result.timestamp) || result.timestamp < 0 || result.timestamp > current || current - result.timestamp > 15000) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
    try { return { ...result, data: snapshotRfq(result.data) }; }
    catch { throw new RemainError('UPSTREAM_SCHEMA_INVALID'); }
  }
  try {
    const catalog = (await read('/api/v1/dex/market/rwa/tokens', [['binanceChainId', '56']])).data;
    if (!Array.isArray(catalog) || catalog.length > 2048) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
    const matches = catalog.filter(row => {
      const r = dataRecord(row);
      return r.binanceChainId === '56' && typeof r.tokenContractAddress === 'string' && r.tokenContractAddress.toLowerCase() === input.token;
    });
    if (matches.length > 1) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
    const selected = findStock(matches, input.token);
    const stock = { chain: '56' as const, token: input.token, symbol: selected.tokenSymbol as string,
      ticker: selected.underlyingTicker as string, issuer: selected.platformId as PositionRead['stock']['issuer'], decimals: Number(selected.decimals) };
    const seen = new Set<string>();
    const result = (status: PositionRead['status'], balanceRaw: string | null, pagesRead: number, observedAtMs: number) =>
      projectPosition({ kind: 'REMAIN_POSITION_READ', mode, wallet: input.wallet, stock, status, balanceRaw,
        observedAtMs, pagesRead, executionEnabled: false, liveGate: 'UNVERIFIED', ownership: 'NOT_AUTHENTICATED' }, input, clock());
    for (let page = 1; page <= 10; page++) {
      const response = await read('/api/v1/dex/balance/all-token-balances-by-address', [
        ['address', input.wallet], ['chains', '56'], ['excludeRiskToken', 'true'], ['page', String(page)], ['pageSize', '100']
      ]);
      if (!Array.isArray(response.data) || response.data.length !== 1) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
      const group = dataRecord(response.data[0]);
      if (group.page !== page || group.pageSize !== 100 || !Array.isArray(group.tokenAssets) || group.tokenAssets.length > 100) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
      let balance: string | undefined;
      for (const value of group.tokenAssets) {
        const asset = dataRecord(value);
        if (asset.binanceChainId !== '56' || address(asset.address) !== input.wallet || asset.isRiskToken !== false) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        const token = asset.tokenContractAddress === '' ? '' : address(asset.tokenContractAddress);
        if (seen.has(token)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        seen.add(token);
        if (token === input.token) balance = asset.rawBalance === '' ? '' : uint(asset.rawBalance);
      }
      if (balance !== undefined) return result(balance === '' ? 'RAW_UNAVAILABLE' : balance === '0' ? 'ZERO_OBSERVED' : 'HELD_OBSERVED', balance === '' ? null : balance, page, response.timestamp);
      if (group.tokenAssets.length < 100) return result('NOT_REPORTED', null, page, response.timestamp);
      if (page === 10) return result('INCOMPLETE', null, page, response.timestamp);
    }
    throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  } catch (error) {
    if (signal.aborted) throw new RemainError('REQUEST_CANCELLED');
    if (error instanceof RemainError && error.code !== 'INVALID_INPUT') throw error;
    throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  }
}
