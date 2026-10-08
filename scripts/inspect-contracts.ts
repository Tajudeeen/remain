import { HttpRpc } from '../src/execution/rpc.ts';
import { observeContractPins } from '../src/execution/pins.ts';
try {
  const first = new URL(process.env.REMAIN_RPC_PRIMARY ?? ''), second = new URL(process.env.REMAIN_RPC_SECONDARY ?? '');
  if (first.hostname === second.hostname || process.argv.length !== 3) throw new Error('CONFIG_INVALID');
  const result = await observeContractPins([new HttpRpc(first.href), new HttpRpc(second.href)], process.argv[2]!);
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.error('CONTRACT_INSPECTION_BLOCKED: configure two independent HTTPS BSC RPCs and provide one supported stock contract. No RPC URLs or credentials are printed.');
  process.exitCode = 1;
}
