import { RemainError } from '../errors.ts';
import { runFeasibility } from '../feasibility.ts';
import type { LocalInspector } from './readiness.ts';

// Imported only by the loopback CLI, never the hosted adapter.
export function localInspector(env: Record<string, string | undefined>): LocalInspector | undefined {
  if (env.REMAIN_LOCAL_READ_ONLY !== 'true') return undefined;
  const apiKey = env.BINANCE_WEB3_API_KEY; const secretKey = env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey?.trim() || !secretKey?.trim()) throw new RemainError('CONFIG_MISSING');
  return (input, signal) => runFeasibility({ BINANCE_WEB3_API_KEY: apiKey, BINANCE_WEB3_SECRET_KEY: secretKey,
    REMAIN_WALLET_ADDRESS: input.wallet, REMAIN_RWA_TOKEN_ADDRESS: input.token, REMAIN_SELL_AMOUNT_RAW: input.amountRaw }, undefined, signal);
}
