import { ReadOnlyBinanceClient } from '../client.ts';
import { runFeasibility } from '../feasibility.ts';
import { readSelectedPosition } from './position.ts';
import { exploreCashTarget, reviewCashCandidate } from './preview.ts';
import { dataRecord } from '../input/data.ts';
import { address, findStock } from '../validation.ts';
import { RemainError } from '../errors.ts';
import type { LocalInspector } from './readiness.ts';
import type { LocalPositionReader } from './position.ts';
import type { LocalCashPreviewer, LocalCashReviewer } from './preview.ts';

export type HostedLiveReaders = Readonly<{
  inspector: LocalInspector;
  positionReader: LocalPositionReader;
  cashPreviewer: LocalCashPreviewer;
  cashReviewer: LocalCashReviewer;
  catalogReader: (signal: AbortSignal) => Promise<{
    kind: 'REMAIN_LIVE_CATALOG';
    mode: 'LIVE_READ_ONLY';
    observedAtMs: number;
    stocks: { token: string; symbol: string; ticker: string; issuer: string; decimals: number }[];
  }>;
}>;

// Hosting a financial read API is opt-in. Credentials never go to the browser.
// Calling code passes secrets from server-only deployment environment variables.
export function configuredHostedReaders(env: Record<string,string|undefined>): HostedLiveReaders | undefined {
  if (env.REMAIN_HOSTED_READ_ONLY !== 'true') return undefined;
  const key = env.BINANCE_WEB3_API_KEY, secret = env.BINANCE_WEB3_SECRET_KEY;
  if (!key?.trim() || !secret?.trim()) return undefined;
  const client = new ReadOnlyBinanceClient({apiKey:key,secretKey:secret,timeoutMs:6500});
  return Object.freeze({
    inspector: (input, signal) => runFeasibility({
      BINANCE_WEB3_API_KEY:key, BINANCE_WEB3_SECRET_KEY:secret,
      REMAIN_WALLET_ADDRESS:input.wallet, REMAIN_RWA_TOKEN_ADDRESS:input.token,
      REMAIN_SELL_AMOUNT_RAW:input.amountRaw
    }, client, signal),
    positionReader: (input,signal) => readSelectedPosition(input,client,signal,'LIVE_READ_ONLY'),
    cashPreviewer: (input,signal) => exploreCashTarget(input,client,signal,'LIVE_READ_ONLY'),
    cashReviewer: (input,signal) => reviewCashCandidate(input,client,signal,'LIVE_READ_ONLY'),
    catalogReader: async signal => {
      const result = await client.get('/api/v1/dex/market/rwa/tokens',[['binanceChainId','56']],signal);
      if (!Array.isArray(result.data) || result.data.length > 2048) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
      const stocks: {token:string;symbol:string;ticker:string;issuer:string;decimals:number}[] = [];
      const seen = new Set<string>();
      for (const value of result.data) {
        const row = dataRecord(value);
        if (row.binanceChainId !== '56' || row.assetType !== 1 || !['ondo','bstock','xstocks'].includes(String(row.platformId))) continue;
        let token: string;
        try { token = address(row.tokenContractAddress); }
        catch { throw new RemainError('UPSTREAM_SCHEMA_INVALID'); }
        if (seen.has(token)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        seen.add(token);
        const stock = findStock([row],token);
        const symbol = stock.tokenSymbol as string, ticker = stock.underlyingTicker as string;
        if (!/^[a-zA-Z0-9._-]{1,24}$/.test(symbol) || !/^[a-zA-Z0-9._-]{1,24}$/.test(ticker)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        stocks.push({token,symbol,ticker,issuer:stock.platformId as string,decimals:Number(stock.decimals)});
      }
      stocks.sort((a,b)=>a.ticker.localeCompare(b.ticker)||a.token.localeCompare(b.token));
      return {kind:'REMAIN_LIVE_CATALOG',mode:'LIVE_READ_ONLY',observedAtMs:result.timestamp,stocks};
    }
  });
}
