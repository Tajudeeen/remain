import { randomUUID } from 'node:crypto';
import type { Reader } from '../feasibility.ts';
import { cashOrderInput, prepareCashCandidate } from '../integration/preview.ts';
import { dataRecord } from '../input/data.ts';
import { canonicalJSON } from '../receipts/canonical.ts';
import { authorizeCow, fail } from './cow.ts';
import { observeContractPins } from './pins.ts';
import { tokenValue, type Rpc } from './rpc.ts';
import type { ContractPin } from './engine.ts';

// Read-only transport only. No execution engine, store, approval or submitter.
// Pin observations are compared to supplied reviewed pins but don't review source.
export async function executionPreflight(value: unknown, options: {
  reader: Reader; rpcs: readonly [Rpc, Rpc]; pins: readonly ContractPin[];
  maximumStockFeeRaw: string; mode: 'LIVE_READ_ONLY' | 'TEST_FIXTURE'; now?: () => number;
}) {
  const now = options.now ?? Date.now, input = cashOrderInput(value), at = now();
  if (input.vendor !== 'CowSwap' || input.cashDecimals !== 18) fail('VENDOR_PROFILE_UNSUPPORTED');
  const observed = await observeContractPins(options.rpcs, input.intent.token);
  for (const pin of observed.pins) {
    const matches = options.pins.filter(p => p.address === pin.address);
    if (matches.length !== 1 || canonicalJSON(matches[0]) !== canonicalJSON(pin)) fail('CONTRACT_UNVERIFIED');
  }
  const balances = await Promise.all(options.rpcs.map(rpc => tokenValue(rpc, input.intent.token, input.intent.wallet, 'latest')));
  if (balances[0] !== balances[1]) fail('RPC_DISAGREEMENT');
  const bundle = await prepareCashCandidate(input, options.reader, AbortSignal.timeout(12000), now);
  if (now() < at || now() - at > 60000 || bundle.preview.position.balanceRaw !== balances[0]) fail('POSITION_CHANGED');
  const rfq = dataRecord(bundle.build.rfq);
  if (rfq.vendor !== 'CowSwap') fail('VENDOR_PROFILE_UNSUPPORTED');
  authorizeCow({ typedData: rfq.typedDataToSign, wallet: input.intent.wallet, stock: input.intent.token,
    expectedDebitRaw: input.amountRaw, balanceRaw: balances[0]!, floorRaw: bundle.preview.floorRaw,
    targetRaw: bundle.preview.cashTargetRaw!, maximumFeeRaw: options.maximumStockFeeRaw,
    quoteAtMs: bundle.quoteAtMs, nowMs: now() });
  return { kind: 'REMAIN_EXECUTION_PREFLIGHT', runId: randomUUID(), observedAtMs: now(), mode: options.mode,
    status: 'COMPATIBLE_OBSERVATION', profile: 'COW_BSC_SELL_V1',
    checks: ['HELD_STOCK_RFQ_BUILD', 'TWO_RPC_BALANCE_AGREEMENT', 'PIN_MATCH', 'SIGNED_ECONOMIC_SCHEMA'] as const,
    executionEnabled: false, liveGate: 'UNVERIFIED', contractSourceReview: 'OPERATOR_ASSERTION',
    trust: 'READ_ONLY_SAMPLE_NOT_ACTIVATION_OR_SETTLEMENT_PROOF' };
}
