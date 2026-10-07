import { randomUUID } from 'node:crypto';
import { ReadOnlyBinanceClient } from './client.ts';
import type { Reader } from './feasibility.ts';
import { RemainError, safeError, schemaError } from './errors.ts';
import { address, BSC_CHAIN, findStock, selectedMarket, type MarketStatus } from './validation.ts';
import type { Query } from './signing.ts';

export const marketCheckSteps = ['supported_bsc_stock_identity', 'fresh_selected_stock_market_read'] as const;
export type MarketCheckReport = {
  runId: string; startedAt: string; status: 'passed' | 'blocked';
  scope: 'SELECTED_STOCK_MARKET_READ_ONLY'; mode: 'LIVE_READ_ONLY' | 'TEST_FIXTURE';
  executionEnabled: false; liveFeasibility: 'NOT_ESTABLISHED';
  checks: string[]; token?: { chain: '56'; tokenAddress: string };
  market?: { marketStatus: MarketStatus; openState: boolean; observedAt: string };
  observations: { endpoint: string; status: 'passed' | 'blocked'; responseHash?: string; latencyMs?: number; error?: ReturnType<typeof safeError> }[];
  error?: ReturnType<typeof safeError>; notes: string[];
};

export async function runMarketCheck(env: Record<string, string | undefined>, tokenInput: unknown, reader?: Reader): Promise<MarketCheckReport> {
  const report: MarketCheckReport = {
    runId: randomUUID(), startedAt: new Date().toISOString(), status: 'blocked',
    scope: 'SELECTED_STOCK_MARKET_READ_ONLY', mode: reader ? 'TEST_FIXTURE' : 'LIVE_READ_ONLY',
    executionEnabled: false, liveFeasibility: 'NOT_ESTABLISHED', checks: [], observations: [],
    notes: ['This token-specific market read does not establish a wallet holding, executable quote, signature safety or settlement.',
      'No wallet, balance, quote, build, approval, signing, submission or broadcast request is performed.',
      'Market flags are API observations, not independent exchange-session evidence or permission to trade.']
  };
  try {
    const token = address(tokenInput);
    const apiKey = env.BINANCE_WEB3_API_KEY;
    const secretKey = env.BINANCE_WEB3_SECRET_KEY;
    if (!apiKey?.trim() || !secretKey?.trim()) throw new RemainError('CONFIG_MISSING');
    const client = reader ?? new ReadOnlyBinanceClient({ apiKey, secretKey });
    // Deliberately independent of wallet/amount configuration. Explicit public
    // token selection is never a claim that the operator owns this stock.
    async function call(endpoint: string, query: Query) {
      const observation: MarketCheckReport['observations'][number] = { endpoint, status: 'blocked' };
      report.observations.push(observation);
      try {
        const result = await client.get(endpoint, query);
        if (!Number.isSafeInteger(result.timestamp) || result.timestamp < 0) throw schemaError('ENVELOPE_TIMESTAMP');
        if (Math.abs(Date.now() - result.timestamp) > 60_000) throw new RemainError('AUTH_CLOCK_DRIFT');
        observation.status = 'passed'; observation.responseHash = result.responseHash; observation.latencyMs = result.latencyMs;
        return result;
      } catch (error) { observation.error = safeError(error); throw error; }
    }
    const catalog = await call('/api/v1/dex/market/rwa/tokens', [['binanceChainId', BSC_CHAIN]]);
    findStock(catalog.data, token);
    report.token = { chain: BSC_CHAIN, tokenAddress: token };
    report.checks.push(marketCheckSteps[0]);
    const fresh = await call('/api/v1/dex/market/rwa/underlying-market', [['binanceChainId', BSC_CHAIN], ['tokenContractAddress', token]]);
    report.market = { ...selectedMarket(fresh.data, token), observedAt: new Date(fresh.timestamp).toISOString() };
    report.checks.push(marketCheckSteps[1]);
    report.status = 'passed';
  } catch (error) { report.error = safeError(error); }
  return report;
}
