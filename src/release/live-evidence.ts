import type { Reader } from '../feasibility.ts';
import { dataRecord } from '../input/data.ts';
import { snapshotRfq } from '../rfq/json.ts';
import { canonicalJSON } from '../receipts/canonical.ts';
import { address, findStock } from '../validation.ts';
import { verifyChainReceipt } from '../execution/receipt.ts';
import { observeContractPins } from '../execution/pins.ts';
import { fail } from '../execution/cow.ts';
import type { ContractPin } from '../execution/engine.ts';
import type { Rpc } from '../execution/rpc.ts';

// Fresh technical evidence is separate from registration, public-source and
// report decisions. No owner checkbox can turn a fixture into mainnet proof.
export async function checkLiveEvidence(value: unknown, options: {
  reader: Reader; rpcs: readonly [Rpc, Rpc]; pins: readonly ContractPin[]; now?: () => number;
}) {
  const now = options.now ?? Date.now, started = now(), receipt = dataRecord(snapshotRfq(value));
  if (receipt.mode !== 'LIVE_EXECUTION') fail('RECEIPT_MODE_INVALID');
  const auth = dataRecord(receipt.auth), stock = address(auth.stock);
  const catalog = await options.reader.get('/api/v1/dex/market/rwa/tokens', [['binanceChainId', '56']], AbortSignal.timeout(10000));
  if (!Number.isSafeInteger(catalog.timestamp) || catalog.timestamp > now() || now() - catalog.timestamp > 15000 || !Array.isArray(catalog.data) || catalog.data.length > 2048) fail('CATALOG_UNVERIFIED');
  const rows = snapshotRfq(catalog.data);
  if (!Array.isArray(rows)) fail('CATALOG_UNVERIFIED');
  const matches = rows.filter((row: unknown) => {
    const item = dataRecord(row); return item.binanceChainId === '56' && typeof item.tokenContractAddress === 'string' && item.tokenContractAddress.toLowerCase() === stock;
  });
  if (matches.length !== 1) fail('CATALOG_UNVERIFIED');
  const identity = findStock(matches, stock);
  if (Number(identity.decimals) !== receipt.stockDecimals) fail('STOCK_DECIMALS_UNVERIFIED');
  const pins = await observeContractPins(options.rpcs, stock);
  for (const pin of pins.pins) {
    const match = options.pins.filter(p => p.address === pin.address);
    if (match.length !== 1 || canonicalJSON(match[0]) !== canonicalJSON(pin)) fail('CONTRACT_UNVERIFIED');
  }
  const result = await verifyChainReceipt(receipt, options.rpcs);
  if (now() < started || now() - started > 120000) fail('EVIDENCE_EXPIRED');
  return { kind: 'REMAIN_LIVE_EVIDENCE_RECHECK', technicalStatus: result.status === 'RECONCILED' ? 'SETTLEMENT_RECHECKED' : 'BLOCKED',
    mode: result.mode, observedAtMs: now(), confirmations: result.confirmations, reasons: result.reasons,
    supportedStockIdentity: 'CURRENT_CATALOG_MATCH', suppliedPins: 'CURRENT_BYTECODE_MATCH_SOURCE_REVIEW_ASSERTED',
    submissionStatus: 'BLOCKED', remainingChecks: ['BINANCE_ROUTE_PROVENANCE', 'DEPLOYED_EXECUTION_FLOW', 'REGISTRATION_AND_ELIGIBILITY', 'OWNER_DEVEX_REPORT', 'PUBLIC_SOURCE_APPROVAL', 'SIGNED_OUT_LINKS'],
    trust: result.trust, offchainIntent: 'RECEIPT_ASSERTION_NOT_SIGNED_AUTHORITY', financialActionsPerformed: false };
}
