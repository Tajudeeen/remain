import { ReadOnlyBinanceClient } from '../client.ts';
import { ExecutionStore } from './store.ts';
import { BinanceExecutionVendor } from './vendor.ts';
import { HttpRpc } from './rpc.ts';
import { contractPins, rpcPair } from './configuration.ts';
import { uint } from '../validation.ts';
import { fail } from './cow.ts';
import { ExecutionEngine } from './engine-core.ts';
export type { ContractPin } from './engine-core.ts';
export { ExecutionEngine, projectOrder } from './engine-core.ts';
export function configuredEngine(env: Record<string, string | undefined>) {
  if (env.REMAIN_EXECUTION_ENABLED !== 'true') return undefined;
  if (env.REMAIN_COW_PROFILE_REVIEWED !== 'true') fail('VENDOR_REVIEW_REQUIRED');
  const required = ['BINANCE_WEB3_API_KEY', 'BINANCE_WEB3_SECRET_KEY', 'REMAIN_RPC_PRIMARY', 'REMAIN_RPC_SECONDARY', 'REMAIN_STORAGE_KEY', 'REMAIN_CONTRACT_PINS', 'REMAIN_MAXIMUM_STOCK_FEE_RAW'];
  if (required.some(key => !env[key]?.trim())) fail('EXECUTION_CONFIG_MISSING');
  uint(env.REMAIN_MAXIMUM_STOCK_FEE_RAW);
  const [first, second] = rpcPair(env), pins = contractPins(env.REMAIN_CONTRACT_PINS!);
  const credentials = { apiKey: env.BINANCE_WEB3_API_KEY!, secretKey: env.BINANCE_WEB3_SECRET_KEY! };
  const store = new ExecutionStore(env.REMAIN_EXECUTION_DB ?? 'state/execution.sqlite', env.REMAIN_STORAGE_KEY!);
  const engine = new ExecutionEngine({ reader: new ReadOnlyBinanceClient(credentials), vendor: new BinanceExecutionVendor(credentials),
    rpcs: [new HttpRpc(first.href), new HttpRpc(second.href)], store, pins, maximumStockFeeRaw: env.REMAIN_MAXIMUM_STOCK_FEE_RAW!, mode: 'LIVE_EXECUTION' });
  return { engine, store };
}
