import { ReadOnlyBinanceClient } from './client.ts';
import type { Reader } from './feasibility.ts';
import { RemainError, schemaError } from './errors.ts';
import { address, BSC_CHAIN } from './validation.ts';

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
    if (!/^(0|[1-9][0-9]?)$/.test(String(stock.decimals)) || Number(stock.decimals) > 36) throw schemaError('DISCOVERY_DECIMALS');
    let tokenAddress: string;
    try { tokenAddress = address(stock.tokenContractAddress); }
    catch (error) { if (error instanceof RemainError) throw schemaError('DISCOVERY_ADDRESS'); throw error; }
    if (!stock.statusInfo || typeof stock.statusInfo !== 'object' || Array.isArray(stock.statusInfo)) throw schemaError('DISCOVERY_STATUS');
    const status = stock.statusInfo as Record<string, unknown>;
    if (typeof status.marketStatus !== 'string') throw schemaError('DISCOVERY_MARKET_STATUS');
    if (typeof status.openState !== 'boolean') throw schemaError('DISCOVERY_OPEN_STATE');
    return { chain: BSC_CHAIN, tokenAddress, tokenSymbol: stock.tokenSymbol, underlyingTicker: stock.underlyingTicker, issuer: stock.platformId, decimals: Number(stock.decimals), marketStatus: status.marketStatus, openState: status.openState };
  });
  return { mode: reader ? 'TEST_FIXTURE' as const : 'LIVE_READ_ONLY' as const, executionEnabled: false as const, observedAt: new Date(result.timestamp).toISOString(), responseHash: result.responseHash, stocks };
}
