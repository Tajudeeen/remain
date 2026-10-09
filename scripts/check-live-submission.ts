import { privateJSON, privateText } from '../src/release/private-file.ts';
import { assessLiveSubmission, publicSourceCheck } from '../src/release/live-submission.ts';
import { checkLiveEvidence } from '../src/release/live-evidence.ts';
import { smokeExecutionHost } from '../src/release/execution-smoke.ts';
import { rpcPair, contractPins } from '../src/execution/configuration.ts';
import { HttpRpc } from '../src/execution/rpc.ts';
import { ReadOnlyBinanceClient } from '../src/client.ts';

export async function checkLiveSubmission(file: string) {
  const report = await assessLiveSubmission(await privateJSON(file), {
    settlement: async path => {
      const [a, b] = rpcPair(process.env);
      if (!process.env.BINANCE_WEB3_API_KEY?.trim() || !process.env.BINANCE_WEB3_SECRET_KEY?.trim()) throw new Error();
      return checkLiveEvidence(await privateJSON(path), {
        reader: new ReadOnlyBinanceClient({ apiKey: process.env.BINANCE_WEB3_API_KEY, secretKey: process.env.BINANCE_WEB3_SECRET_KEY }),
        rpcs: [new HttpRpc(a.href), new HttpRpc(b.href)], pins: contractPins(process.env.REMAIN_CONTRACT_PINS ?? '')
      });
    },
    host: (origin, sha) => smokeExecutionHost(origin, sha, 'enabled'), source: sha => publicSourceCheck(sha),
    ownerReport: async path => {
      const text = await privateText(path);
      // Existence/nonempty only. Authorship and factual claims are owner review.
      return text.trim().length > 0;
    }
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.submissionStatus !== 'READY_FOR_OWNER_REVIEW') process.exitCode = 1;
}
