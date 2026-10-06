import { createHash } from 'node:crypto';
import { RemainError } from './errors.ts';

export const BSC_CHAIN = '56';
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
  if (!found || found.assetType !== 1 || !['ondo', 'bstock', 'xstocks'].includes(String(found.platformId))) throw new RemainError('UNSUPPORTED_ASSET');
  const decimals = String(found.decimals);
  if (!/^(0|[1-9][0-9]?)$/.test(decimals) || Number(decimals) > 36 || typeof found.tokenSymbol !== 'string' || typeof found.underlyingTicker !== 'string') throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  checkMarket(found.statusInfo);
  return found;
}

export function checkMarket(data: unknown): void {
  const status = record(data);
  if (typeof status.openState !== 'boolean' || !['regular', 'premarket', 'postmarket', 'overnight', 'closed', 'pause'].includes(String(status.marketStatus))) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  if (status.marketStatus === 'pause' || ['MARKET_PAUSED', 'MARKET_MAINTENANCE', 'ASSET_PAUSED', 'ASSET_LIMITED', 'UNSUPPORTED'].includes(String(status.reasonCode))) throw new RemainError('MARKET_BLOCKED');
  if (status.reasonCode != null && !['TRADING', 'MARKET_CLOSED'].includes(String(status.reasonCode))) throw new RemainError('MARKET_BLOCKED');
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

export function inspectRfq(data: unknown): { vendor: string; typedDataHash: string; verifyingContract: string } {
  const built = record(data);
  if (built.executionMode !== 'RFQ') throw new RemainError('RFQ_UNAVAILABLE');
  const rfq = record(built.rfq);
  if (!['PcsXRfq', 'InchFusion', 'CowSwap'].includes(String(rfq.vendor))) throw new RemainError('RFQ_OPAQUE');
  let typed: unknown = rfq.typedDataToSign;
  if (typeof typed === 'string') {
    try { typed = JSON.parse(typed); } catch { throw new RemainError('RFQ_OPAQUE'); }
  }
  try {
    const object = record(typed);
    const domain = record(object.domain);
    const types = record(object.types);
    const message = record(object.message);
    if (!(domain.chainId === 56 || domain.chainId === '56' || domain.chainId === '0x38') || typeof object.primaryType !== 'string' || !Array.isArray(types[object.primaryType]) || Object.keys(message).length === 0) throw new RemainError('RFQ_OPAQUE');
    const fields = array(types[object.primaryType]);
    if (fields.length === 0) throw new RemainError('RFQ_OPAQUE');
    const names = new Set<string>();
    for (const entry of fields.map(record)) {
      if (typeof entry.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name) || typeof entry.type !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*(?:\[[0-9]*\])*$/.test(entry.type) || names.has(entry.name) || !Object.hasOwn(message, entry.name)) throw new RemainError('RFQ_OPAQUE');
      names.add(entry.name);
    }
    return { vendor: String(rfq.vendor), typedDataHash: digest(object), verifyingContract: address(domain.verifyingContract) };
  } catch { throw new RemainError('RFQ_OPAQUE'); }
}
