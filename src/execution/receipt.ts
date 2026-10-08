import { cashOrderInput } from '../integration/preview.ts';
import { cashTargetRaw } from '../../web/preview.js';
import { canonicalJSON } from '../receipts/canonical.ts';
import { authorizeCow, exactData, fail } from './cow.ts';
import { reconcileChain } from './settlement.ts';
import type { Rpc } from './rpc.ts';

// Reconstructs the economics from the signed schema before querying the chain.
// A downloaded receipt remains an assertion until fresh RPC observations agree.
export async function verifyChainReceipt(value: unknown, rpcs: readonly [Rpc, Rpc], fixture = false) {
  const r = exactData(value, ['kind', 'mode', 'id', 'state', 'auth', 'intent', 'stockDecimals', 'stockSymbol', 'createdAtMs', 'observedAtMs', 'txHash', 'result', 'provenance']);
  if (r.kind !== 'REMAIN_CHAIN_RECEIPT_V1' || r.provenance !== 'RPC_OBSERVATIONS_RECHECK_BEFORE_RELYING' || r.mode !== (fixture ? 'TEST_FIXTURE' : 'LIVE_EXECUTION')) fail('RECEIPT_MODE_INVALID');
  const input = cashOrderInput(r.intent), a = exactData(r.auth, ['profile', 'wallet', 'stock', 'spender', 'totalDebitRaw', 'stockFeeRaw', 'minimumCashRaw', 'cashTargetRaw', 'floorRaw', 'balanceRaw', 'validTo', 'quoteExpiresAtMs', 'orderDigest', 'orderUid', 'typedData', 'checksum']);
  if (input.vendor !== 'CowSwap' || input.cashDecimals !== 18 || typeof a.balanceRaw !== 'string' || typeof a.floorRaw !== 'string' || typeof a.stockFeeRaw !== 'string' || typeof a.quoteExpiresAtMs !== 'number' || typeof r.createdAtMs !== 'number') fail('INVALID_EXECUTION_INPUT');
  const floor = ((BigInt(a.balanceRaw) * BigInt(input.intent.retainBps) + 9999n) / 10000n).toString();
  if (floor !== a.floorRaw) fail('ECONOMIC_BINDING_FAILED');
  const reconstructed = authorizeCow({ typedData: a.typedData, wallet: input.intent.wallet, stock: input.intent.token, expectedDebitRaw: input.amountRaw,
    balanceRaw: a.balanceRaw, floorRaw: floor, targetRaw: cashTargetRaw(input.intent.cashTarget, 18), maximumFeeRaw: a.stockFeeRaw,
    quoteAtMs: a.quoteExpiresAtMs - 30000, nowMs: r.createdAtMs });
  if (canonicalJSON(reconstructed) !== canonicalJSON(a) || typeof r.txHash !== 'string') fail('RECEIPT_BINDING_FAILED');
  return reconcileChain(rpcs, reconstructed, r.txHash, fixture);
}
