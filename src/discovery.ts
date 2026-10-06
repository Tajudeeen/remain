import { ReadOnlyBinanceClient } from './client.ts';
import type { Reader } from './feasibility.ts';
import { RemainError } from './errors.ts';
import { address, array, BSC_CHAIN, record } from './validation.ts';

export async function discoverStocks(env: Record<string, string | undefined>, reader?: Reader) {
  const apiKey = env.BINANCE_WEB3_API_KEY;
  const secretKey = env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey?.trim() || !secretKey?.trim()) throw new RemainError('CONFIG_MISSING');
  const client = reader ?? new ReadOnlyBinanceClient({ apiKey, secretKey });
  const result = await client.get('/api/v1/dex/market/rwa/tokens', [['binanceChainId', BSC_CHAIN]]);
  const stocks = array(result.data).map(record).filter((stock) => stock.binanceChainId === BSC_CHAIN && stock.assetType === 1).map((stock) => {
    if (typeof stock.tokenSymbol !== 'string' || typeof stock.underlyingTicker !== 'string' || typeof stock.platformId !== 'string' || !/^(0|[1-9][0-9]?)$/.test(String(stock.decimals)) || Number(stock.decimals) > 36) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
    const status = record(stock.statusInfo);
    if (typeof status.marketStatus !== 'string' || typeof status.openState !== 'boolean') throw new RemainError('UPSTREAM_SCHEMA_INVALID');
    return { chain: BSC_CHAIN, tokenAddress: address(stock.tokenContractAddress), tokenSymbol: stock.tokenSymbol, underlyingTicker: stock.underlyingTicker, issuer: stock.platformId, decimals: Number(stock.decimals), marketStatus: status.marketStatus, openState: status.openState };
  });
  return { mode: reader ? 'TEST_FIXTURE' as const : 'LIVE_READ_ONLY' as const, executionEnabled: false as const, observedAt: new Date(result.timestamp).toISOString(), responseHash: result.responseHash, stocks };
}
