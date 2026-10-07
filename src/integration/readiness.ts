import { dataRecord } from '../input/data.ts';
import { address, uint } from '../validation.ts';
import { RemainError, isErrorCode } from '../errors.ts';
import type { SmokeReport } from '../feasibility.ts';
import { canonicalJSON } from '../receipts/canonical.ts';

export const inspectionChecks = ['authenticated_bsc_aggregator', 'supported_bsc_stock_identity', 'market_status_read',
  'wallet_balance_covers_input', 'matching_stock_to_usdt_rfq', 'inspectable_bsc_eip712_structure'] as const;
export type InspectionInput = Readonly<{ wallet: string; token: string; amountRaw: string }>;
export type LocalInspector = (input: InspectionInput, signal: AbortSignal) => Promise<SmokeReport>;

export function inspectionInput(input: unknown): InspectionInput {
  try {
    const r = dataRecord(input); const keys = Object.keys(r);
    if (keys.length !== 3 || !['wallet', 'token', 'amountRaw'].every(k => Object.hasOwn(r, k))) throw new Error();
    return Object.freeze({ wallet: address(r.wallet), token: address(r.token), amountRaw: uint(r.amountRaw, true) });
  } catch { throw new RemainError('INVALID_INPUT'); }
}

export function readinessStatus(available: boolean) {
  return { kind: 'REMAIN_INTEGRATION_READINESS' as const, mode: 'READ_ONLY_SETUP' as const,
    inspectionAvailable: available, deployment: available ? 'LOCAL_ONLY' as const : 'NOT_CONFIGURED' as const,
    executionEnabled: false as const, liveGate: 'UNVERIFIED' as const, signatureSemantics: 'UNVERIFIED' as const };
}
export function projectInspection(report: SmokeReport) {
  // Redact a supplied report through an exact vocabulary. It never promotes
  // mode or treats an arbitrary injected report as live evidence.
  try {
    dataRecord(report); canonicalJSON(report);
    if (report.rfqReview !== undefined) dataRecord(report.rfqReview);
    if (report.error !== undefined) dataRecord(report.error);
  } catch { throw new RemainError('UPSTREAM_SCHEMA_INVALID'); }
  if (!['LIVE_READ_ONLY', 'TEST_FIXTURE'].includes(report.mode) || report.executionEnabled !== false ||
      !['passed', 'blocked'].includes(report.status) || !Array.isArray(report.checks) || report.checks.length > inspectionChecks.length ||
      report.checks.some((check, i) => check !== inspectionChecks[i]) ||
      report.status === 'passed' && (report.checks.length !== inspectionChecks.length || report.rfqReview?.signatureSemantics !== 'UNVERIFIED' ||
        report.rfqReview.profile !== 'REMAIN_RFQ_REVIEW_V1' || report.rfqReview.structure !== 'VALIDATED' ||
        report.rfqReview.unsignedBuild !== 'MATCHES_SELECTED_QUOTE' || report.rfqReview.executionEnabled !== false)) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  return { kind: 'REMAIN_READ_ONLY_INSPECTION' as const, mode: report.mode,
    status: report.status === 'passed' ? 'INSPECTED' as const : 'BLOCKED' as const, checks: [...report.checks],
    errorCode: report.status === 'blocked' && isErrorCode(report.error?.code) ? report.error!.code : report.status === 'blocked' ? 'UPSTREAM_SCHEMA_INVALID' as const : null,
    executionEnabled: false as const, liveGate: 'UNVERIFIED' as const, signatureSemantics: 'UNVERIFIED' as const,
    ownership: 'NOT_AUTHENTICATED' as const };
}
