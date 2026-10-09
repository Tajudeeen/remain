import { ReadOnlyBinanceClient } from '../src/client.ts';
import { privateJSON } from '../src/release/private-file.ts';
import { contractPins, rpcPair } from '../src/execution/configuration.ts';
import { HttpRpc } from '../src/execution/rpc.ts';
import { executionPreflight } from '../src/execution/preflight.ts';
try {
  if (process.argv.length !== 3 || !process.env.BINANCE_WEB3_API_KEY?.trim() || !process.env.BINANCE_WEB3_SECRET_KEY?.trim()) throw new Error();
  const [a, b] = rpcPair(process.env);
  const report = await executionPreflight(await privateJSON(process.argv[2]!), {
    reader: new ReadOnlyBinanceClient({ apiKey: process.env.BINANCE_WEB3_API_KEY, secretKey: process.env.BINANCE_WEB3_SECRET_KEY }),
    rpcs: [new HttpRpc(a.href), new HttpRpc(b.href)], pins: contractPins(process.env.REMAIN_CONTRACT_PINS ?? ''),
    maximumStockFeeRaw: process.env.REMAIN_MAXIMUM_STOCK_FEE_RAW ?? '', mode: 'LIVE_READ_ONLY'
  });
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error('EXECUTION_PREFLIGHT_BLOCKED: check private intent, held stock, real RFQ profile, reviewed pins and two RPCs. No private input or provider error is printed.');
  process.exitCode = 1;
}
