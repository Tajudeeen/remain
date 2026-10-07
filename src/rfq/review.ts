import { schemaError } from '../errors.ts';
import { address, BSC_CHAIN, BSC_USDT, inspectRfq, record, uint, type SmokeConfig } from '../validation.ts';
import { snapshotRfq } from './json.ts';

export type RfqReview = {
  profile: 'REMAIN_RFQ_REVIEW_V1'; structure: 'VALIDATED'; unsignedBuild: 'MATCHES_SELECTED_QUOTE';
  checksumKind: 'SHA256_JSON_NOT_EIP712'; artifactChecksum: string;
  typeCount: number; fieldCount: number; domainTypeDeclared: boolean;
  signatureSemantics: 'UNVERIFIED'; executionEnabled: false;
};

export function reviewRfqBuild(input: unknown, selected: unknown, config: Pick<SmokeConfig, 'token' | 'amount' | 'wallet'>): RfqReview {
  // Structural inspection is intentionally separate from vendor semantics.
  const inspection = inspectRfq(input);
  try {
    const built = record(snapshotRfq(input)); const quote = record(snapshotRfq(selected));
    const route = record(built.routerResult);
    const matches = (candidate: Record<string, unknown>) => candidate.binanceChainId === BSC_CHAIN &&
      candidate.fromTokenAmount === config.amount &&
      address(record(candidate.fromToken).tokenContractAddress) === config.token &&
      address(record(candidate.toToken).tokenContractAddress) === BSC_USDT.toLowerCase();
    if (!matches(quote) || !matches(route) || quote.executionMode !== 'RFQ' ||
      route.vendorName !== inspection.vendor || quote.vendorName !== inspection.vendor ||
      uint(route.toTokenAmount, true) !== uint(quote.toTokenAmount, true)) throw new Error('ROUTE_MISMATCH');
    if (built.tx != null) {
      const tx = record(built.tx);
      if (tx.from !== undefined && address(tx.from) !== config.wallet) throw new Error('WALLET_MISMATCH');
    }
    return { profile: 'REMAIN_RFQ_REVIEW_V1', structure: 'VALIDATED', unsignedBuild: 'MATCHES_SELECTED_QUOTE',
      checksumKind: 'SHA256_JSON_NOT_EIP712', artifactChecksum: inspection.typedDataHash,
      typeCount: inspection.typeCount, fieldCount: inspection.fieldCount, domainTypeDeclared: inspection.domainTypeDeclared,
      signatureSemantics: 'UNVERIFIED', executionEnabled: false };
  } catch { throw schemaError('RFQ_BUILD_BINDING'); }
}
