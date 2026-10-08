import { readFile, stat } from 'node:fs/promises';
import { parseReceiptJSON } from '../src/receipts/canonical.ts';
import { verifyChainReceipt } from '../src/execution/receipt.ts';
import { HttpRpc } from '../src/execution/rpc.ts';

try {
  const path = process.argv[2];
  if (!path || !process.env.REMAIN_RPC_PRIMARY || !process.env.REMAIN_RPC_SECONDARY) throw new Error();
  const a = new URL(process.env.REMAIN_RPC_PRIMARY), b = new URL(process.env.REMAIN_RPC_SECONDARY);
  if (a.hostname === b.hostname || (await stat(path)).size > 262144) throw new Error();
  const value = parseReceiptJSON(await readFile(path, 'utf8'));
  const result = await verifyChainReceipt(value, [new HttpRpc(a.href), new HttpRpc(b.href)]);
  // Only fixed status and counts. Keep wallet, amounts and full receipt private.
  console.log(JSON.stringify({ status: result.status, mode: result.mode, confirmations: result.confirmations, reasons: result.reasons, trust: result.trust }, null, 2));
  if (result.status !== 'RECONCILED') process.exitCode = 1;
} catch { console.error('CHAIN_RECEIPT_UNVERIFIED: check the private receipt and two independent RPC providers. No receipt contents are printed.'); process.exitCode = 1; }
