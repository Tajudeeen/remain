import { createHash } from 'node:crypto';
import { RemainError, schemaError } from './errors.ts';
import { reviewTypedData } from './rfq/typed-data.ts';
import { snapshotRfq } from './rfq/json.ts';

export const BSC_CHAIN = '56';
const marketStatuses = ['regular', 'premarket', 'postmarket', 'overnight', 'closed', 'pause'] as const;
export type MarketStatus = typeof marketStatuses[number];
export function isMarketStatus(value: unknown): value is MarketStatus {
  return typeof value === 'string' && (marketStatuses as readonly string[]).includes(value);
}
// Binance Trading API BSC USDT example. Contract identity must be independently
// checked before any future signing flow. Decimals are never assumed here.
export const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  return value;
}
export function address(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) throw new RemainError('INVALID_INPUT');
  return value.toLowerCase();
}
export function uint(value: unknown, positive = false): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= (1n << 256n) || (positive && value === '0')) throw new RemainError('INVALID_INPUT');
  return value;
}
export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export type SmokeConfig = { apiKey: string; secretKey: string; wallet: string; token: string; amount: string };
export function readConfig(env: Record<string, string | undefined>): SmokeConfig {
  const apiKey = env.BINANCE_WEB3_API_KEY;
  const secretKey = env.BINANCE_WEB3_SECRET_KEY;
  const wallet = env.REMAIN_WALLET_ADDRESS;
  const token = env.REMAIN_RWA_TOKEN_ADDRESS;
  const amount = env.REMAIN_SELL_AMOUNT_RAW;
  if (![apiKey, secretKey, wallet, token, amount].every((v) => typeof v === 'string' && v.trim().length > 0)) throw new RemainError('CONFIG_MISSING');
  return { apiKey: apiKey!, secretKey: secretKey!, wallet: address(wallet), token: address(token), amount: uint(amount, true) };
}

export function findStock(data: unknown, token: string): Record<string, unknown> {
  const found = array(data).map(record).find((v) => v.binanceChainId === BSC_CHAIN && typeof v.tokenContractAddress === 'string' && v.tokenContractAddress.toLowerCase() === token);
  if (!found || found.assetType !== 1 || typeof found.platformId !== 'string' || !['ondo', 'bstock', 'xstocks'].includes(found.platformId)) throw new RemainError('UNSUPPORTED_ASSET');
  if (!['string', 'number'].includes(typeof found.decimals)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  const decimals = String(found.decimals);
  if (!/^(0|[1-9][0-9]?)$/.test(decimals) || Number(decimals) > 36 || typeof found.tokenSymbol !== 'string' || typeof found.underlyingTicker !== 'string') throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  // A catalog record identifies the stock; it does not establish tradability.
  // Feasibility must check the selected stock's fresh underlying-market result
  // before wallet/quote/build requests. Catalog status is advisory only.
  return found;
}

export function checkMarket(data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw schemaError('MARKET_RECORD');
  const status = data as Record<string, unknown>;
  if (typeof status.openState !== 'boolean') throw schemaError('MARKET_OPEN_STATE');
  if (!isMarketStatus(status.marketStatus)) throw schemaError('MARKET_STATUS');
  if (status.marketStatus === 'pause') throw new RemainError('MARKET_BLOCKED');
  if (status.reasonCode != null && (typeof status.reasonCode !== 'string' || !['TRADING', 'MARKET_CLOSED'].includes(status.reasonCode))) throw new RemainError('MARKET_BLOCKED');
}

// Shared by the holding-free diagnostic and held-position feasibility path.
// Matching chain and token are mandatory before interpreting market metadata.
export function selectedMarket(data: unknown, token: string): { marketStatus: MarketStatus; openState: boolean } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw schemaError('MARKET_RESPONSE');
  const market = data as Record<string, unknown>;
  let contract: string;
  try { contract = address(market.tokenContractAddress); }
  catch { throw schemaError('MARKET_IDENTITY'); }
  if (market.binanceChainId !== BSC_CHAIN || contract !== token) throw schemaError('MARKET_IDENTITY');
  checkMarket(market.statusInfo);
  const status = record(market.statusInfo);
  // checkMarket has validated these fields without coercion.
  return { marketStatus: status.marketStatus as MarketStatus, openState: status.openState as boolean };
}

export function walletBalance(data: unknown, wallet: string, token: string): string | undefined {
  for (const group of array(data).map(record)) {
    for (const item of array(group.tokenAssets).map(record)) {
      if (item.binanceChainId !== BSC_CHAIN || typeof item.tokenContractAddress !== 'string' || item.tokenContractAddress.toLowerCase() !== token) continue;
      if (address(item.address) !== wallet || item.isRiskToken !== false) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
      return uint(item.rawBalance);
    }
  }
  return undefined;
}

export function pickRfq(data: unknown, config: Pick<SmokeConfig, 'token' | 'amount'>): Record<string, unknown> {
  const valid = array(data).map(record).filter((route) => {
    if (route.binanceChainId !== BSC_CHAIN || route.executionMode !== 'RFQ' || route.fromTokenAmount !== config.amount) return false;
    return address(record(route.fromToken).tokenContractAddress) === config.token && address(record(route.toToken).tokenContractAddress) === BSC_USDT.toLowerCase();
  });
  if (!valid.length) throw new RemainError('RFQ_UNAVAILABLE');
  const sorted = valid.map((route) => {
    uint(route.toTokenAmount, true);
    if (typeof route.quoteId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(route.quoteId) || typeof route.vendorName !== 'string') throw new RemainError('UPSTREAM_SCHEMA_INVALID');
    return route;
  }).sort((a, b) => BigInt(a.toTokenAmount as string) > BigInt(b.toTokenAmount as string) ? -1 : 1);
  return sorted[0]!;
}

export function inspectRfq(data: unknown): ReturnType<typeof reviewTypedData> & { vendor: string } {
  let built: Record<string, unknown>;
  try { built = record(snapshotRfq(data)); } catch { throw new RemainError('RFQ_OPAQUE'); }
  if (built.executionMode !== 'RFQ') throw new RemainError('RFQ_UNAVAILABLE');
  const rfq = record(built.rfq);
  if (typeof rfq.vendor !== 'string' || !['PcsXRfq', 'InchFusion', 'CowSwap'].includes(rfq.vendor)) throw new RemainError('RFQ_OPAQUE');
  if ((rfq.signingScheme !== undefined && rfq.signingScheme !== 'EIP712') || (rfq.txType !== undefined && rfq.txType !== 'EIP712')) throw new RemainError('RFQ_OPAQUE');
  return { vendor: rfq.vendor, ...reviewTypedData(rfq.typedDataToSign) };
}
