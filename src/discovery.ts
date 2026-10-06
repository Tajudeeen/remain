import { ReadOnlyBinanceClient } from './client.ts';
import type { Reader } from './feasibility.ts';
import { RemainError, schemaError, type SchemaCheck } from './errors.ts';
import { address, BSC_CHAIN, isMarketStatus } from './validation.ts';

type ReceivedType = 'missing' | 'null' | 'array' | 'string' | 'number' | 'boolean' | 'object' | 'other';
function receivedType(value: unknown): ReceivedType {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string': case 'number': case 'boolean': case 'object': return typeof value as ReceivedType;
    default: return 'other';
  }
}

function catalogMarket(data: unknown) {
  const issues: { check: SchemaCheck; receivedType: ReceivedType }[] = [];
  const status = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
  if (!status) issues.push({ check: 'DISCOVERY_STATUS', receivedType: receivedType(data) });
  else {
    if (!isMarketStatus(status.marketStatus)) issues.push({ check: 'DISCOVERY_MARKET_STATUS', receivedType: receivedType(status.marketStatus) });
    if (typeof status.openState !== 'boolean') issues.push({ check: 'DISCOVERY_OPEN_STATE', receivedType: receivedType(status.openState) });
  }
  // No coercion or guessed market state. Both fields are unknown when either
  // fails validation, even if the other raw field claims the market is open.
  const readable = issues.length === 0 && status !== undefined;
  return { marketMetadataStatus: readable ? 'readable' as const : 'unavailable' as const,
    marketStatus: readable && isMarketStatus(status.marketStatus) ? status.marketStatus : null,
    openState: readable && typeof status.openState === 'boolean' ? status.openState : null,
    marketIssues: issues };
}

export async function discoverStocks(env: Record<string, string | undefined>, reader?: Reader) {
  const apiKey = env.BINANCE_WEB3_API_KEY;
  const secretKey = env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey?.trim() || !secretKey?.trim()) throw new RemainError('CONFIG_MISSING');
  const client = reader ?? new ReadOnlyBinanceClient({ apiKey, secretKey });
  const result = await client.get('/api/v1/dex/market/rwa/tokens', [['binanceChainId', BSC_CHAIN]]);
  if (!Array.isArray(result.data)) throw schemaError('DISCOVERY_LIST');
  const stocks = result.data.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw schemaError('DISCOVERY_ROW');
    return row as Record<string, unknown>;
  }).filter((stock) => stock.binanceChainId === BSC_CHAIN && stock.assetType === 1).map((stock) => {
    if (typeof stock.tokenSymbol !== 'string') throw schemaError('DISCOVERY_SYMBOL');
    if (typeof stock.underlyingTicker !== 'string') throw schemaError('DISCOVERY_TICKER');
    if (typeof stock.platformId !== 'string') throw schemaError('DISCOVERY_ISSUER');
    if (!['string', 'number'].includes(typeof stock.decimals) || !/^(0|[1-9][0-9]?)$/.test(String(stock.decimals)) || Number(stock.decimals) > 36) throw schemaError('DISCOVERY_DECIMALS');
    let tokenAddress: string;
    try { tokenAddress = address(stock.tokenContractAddress); }
    catch (error) { if (error instanceof RemainError) throw schemaError('DISCOVERY_ADDRESS'); throw error; }
    return { chain: BSC_CHAIN, tokenAddress, tokenSymbol: stock.tokenSymbol, underlyingTicker: stock.underlyingTicker, issuer: stock.platformId, decimals: Number(stock.decimals), ...catalogMarket(stock.statusInfo) };
  });
  const unavailableMarketCount = stocks.filter((stock) => stock.marketMetadataStatus === 'unavailable').length;
  return { status: unavailableMarketCount ? 'partial' as const : 'passed' as const,
    scope: 'STOCK_IDENTITY_DISCOVERY_ONLY' as const,
    mode: reader ? 'TEST_FIXTURE' as const : 'LIVE_READ_ONLY' as const, executionEnabled: false as const,
    observedAt: new Date(result.timestamp).toISOString(), responseHash: result.responseHash,
    unavailableMarketCount, stocks,
    notes: ['Discovery does not establish tradability or close the live feasibility gate.',
      'Unreadable market metadata is unknown. A fresh selected-stock market check is required before requesting a quote.'] };
}
