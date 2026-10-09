import { privateJSON } from '../src/release/private-file.ts';
import { checkLiveEvidence } from '../src/release/live-evidence.ts';
import { rpcPair, contractPins } from '../src/execution/configuration.ts';
import { HttpRpc } from '../src/execution/rpc.ts';
import { ReadOnlyBinanceClient } from '../src/client.ts';
try {
  if (process.argv.length !== 3 || !process.env.BINANCE_WEB3_API_KEY?.trim() || !process.env.BINANCE_WEB3_SECRET_KEY?.trim()) throw new Error();
  const [a, b] = rpcPair(process.env);
  const report = await checkLiveEvidence(await privateJSON(process.argv[2]!), {
    reader: new ReadOnlyBinanceClient({ apiKey: process.env.BINANCE_WEB3_API_KEY, secretKey: process.env.BINANCE_WEB3_SECRET_KEY }),
    rpcs: [new HttpRpc(a.href), new HttpRpc(b.href)], pins: contractPins(process.env.REMAIN_CONTRACT_PINS ?? '')
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.technicalStatus !== 'SETTLEMENT_RECHECKED') process.exitCode = 1;
} catch { console.error('LIVE_EVIDENCE_BLOCKED: a private LIVE_EXECUTION receipt, current stock identity, reviewed contract pins and fresh independent settlement checks are required. Input contents and upstream errors are not printed.'); process.exitCode = 1; }
