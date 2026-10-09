import { privateJSON } from '../src/release/private-file.ts';
import { rpcPair } from '../src/execution/configuration.ts';
import { verifyChainReceipt } from '../src/execution/receipt.ts';
import { HttpRpc } from '../src/execution/rpc.ts';

try {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw new Error();
  const [a, b] = rpcPair(process.env);
  const value = await privateJSON(path);
  const result = await verifyChainReceipt(value, [new HttpRpc(a.href), new HttpRpc(b.href)]);
  // Only fixed status and counts. Keep wallet, amounts and full receipt private.
  console.log(JSON.stringify({ status: result.status, mode: result.mode, confirmations: result.confirmations, reasons: result.reasons, trust: result.trust }, null, 2));
  if (result.status !== 'RECONCILED') process.exitCode = 1;
} catch { console.error('CHAIN_RECEIPT_UNVERIFIED: check the private receipt and two independent RPC providers. No receipt contents are printed.'); process.exitCode = 1; }
