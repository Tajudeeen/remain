import { isErrorCode, isSchemaCheck, type ErrorCode } from './errors.ts';
import { isMarketStatus } from './validation.ts';

export type EvidenceKind = 'discovery' | 'smoke';
export class EvidenceInspectionError extends Error {
  constructor() { super('Local evidence could not be safely inspected.'); }
}
function fail(): never { throw new EvidenceInspectionError(); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
const issueChecks = ['DISCOVERY_STATUS', 'DISCOVERY_MARKET_STATUS', 'DISCOVERY_OPEN_STATE'] as const;
const receivedTypes = ['missing', 'null', 'array', 'string', 'number', 'boolean', 'object', 'other'] as const;
type MarketIssue = { check: typeof issueChecks[number]; receivedType: typeof receivedTypes[number] };
const smokeChecks = ['authenticated_bsc_aggregator', 'supported_bsc_stock_identity', 'market_status_read',
  'wallet_balance_covers_input', 'matching_stock_to_usdt_rfq', 'inspectable_bsc_eip712_structure'] as const;

function errorAdvice(code: ErrorCode) {
  switch (code) {
    case 'CONFIG_MISSING': return 'CHECK_LOCAL_CONFIGURATION';
    case 'AUTH_KEY_INVALID': case 'AUTH_SIGNATURE_INVALID': case 'AUTH_PERMISSION_DENIED': return 'CHECK_DEVELOPER_PROJECT_AND_SIGNING';
    case 'AUTH_CLOCK_DRIFT': return 'CHECK_SYSTEM_CLOCK';
    case 'ACCESS_REGION_RESTRICTED': case 'ACCESS_PROXY_REJECTED': case 'ACCESS_IP_RESTRICTED': case 'ACCESS_COMPLIANCE_RESTRICTED': return 'STOP_AND_CONTACT_BINANCE_SUPPORT';
    case 'UPSTREAM_SCHEMA_INVALID': return 'INVESTIGATE_FIXED_VALIDATION_LABEL';
    case 'INSUFFICIENT_POSITION': return 'CHECK_HELD_STOCK_AND_RAW_AMOUNT';
    case 'MARKET_BLOCKED': return 'WAIT_FOR_VERIFIED_MARKET_AVAILABILITY';
    case 'RFQ_OPAQUE': return 'ASK_BINANCE_FOR_INSPECTABLE_RFQ_SCHEMA';
    case 'RFQ_UNAVAILABLE': return 'CHECK_SUPPORTED_STOCK_TO_USDT_RFQ';
    default: return 'REVIEW_READ_ONLY_FAILURE';
  }
}

// Local files are untrusted claims. Validate each emitted field, never echo
// arbitrary messages, notes, symbols, payloads, balances or unknown properties.
export function inspectEvidence(value: unknown, kind: EvidenceKind, now = Date.now()) {
  const report = object(value);
  if (typeof report.runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(report.runId)) fail();
  if (typeof report.startedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(report.startedAt)) fail();
  const started = Date.parse(report.startedAt);
  if (!Number.isFinite(now) || !Number.isFinite(started) || new Date(started).toISOString() !== report.startedAt || started > now + 300_000) fail();
  if (report.mode !== 'LIVE_READ_ONLY' && report.mode !== 'TEST_FIXTURE') fail();
  if (report.executionEnabled !== false || (report.status !== 'passed' && report.status !== 'partial' && report.status !== 'blocked')) fail();
  const ageSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const base = { inspectionStatus: 'complete' as const, source: 'LOCAL_FILE_UNAUTHENTICATED' as const,
    kind, runId: report.runId, startedAt: report.startedAt, reportStatus: report.status as 'passed' | 'partial' | 'blocked',
    reportedMode: report.mode, ageSeconds, freshness: ageSeconds > 900 ? 'historical' as const : 'recent' as const,
    liveGate: 'UNVERIFIED' as const, executionEnabled: false as const };
  if (report.status === 'blocked') {
    const error = object(report.error);
    if (!isErrorCode(error.code)) fail();
    if (error.validationCheck !== undefined && (error.code !== 'UPSTREAM_SCHEMA_INVALID' || !isSchemaCheck(error.validationCheck))) fail();
    return { ...base, error: { code: error.code,
      ...(isSchemaCheck(error.validationCheck) ? { validationCheck: error.validationCheck } : {}) },
      nextStep: errorAdvice(error.code) };
  }
  // Older passed catalogs do not contain the new identity-only scope. Keep
  // them visible as historical format without treating their rows as current.
  if (kind === 'discovery' && report.scope === undefined && report.status === 'passed') {
    if (!Array.isArray(report.stocks)) fail();
    return { ...base, catalogFormat: 'legacy' as const, nextStep: 'RERUN_CURRENT_DISCOVERY' as const };
  }
  if (kind === 'discovery') {
    if (report.scope !== 'STOCK_IDENTITY_DISCOVERY_ONLY' || !Array.isArray(report.stocks) || report.stocks.length > 2000) fail();
    let unavailableMarketCount = 0;
    const affectedStocks: { tokenAddress: string; marketIssues: MarketIssue[] }[] = [];
    const issueCounts: Partial<Record<MarketIssue['check'], number>> = {};
    for (const value of report.stocks) {
      const stock = object(value);
      if (stock.chain !== '56' || typeof stock.tokenAddress !== 'string' || !/^0x[0-9a-f]{40}$/i.test(stock.tokenAddress) || /^0x0{40}$/i.test(stock.tokenAddress)) fail();
      if (!Array.isArray(stock.marketIssues) || stock.marketIssues.length > 2) fail();
      if (stock.marketMetadataStatus === 'readable') {
        if (!isMarketStatus(stock.marketStatus) || typeof stock.openState !== 'boolean' || stock.marketIssues.length !== 0) fail();
      } else if (stock.marketMetadataStatus === 'unavailable') {
        if (stock.marketStatus !== null || stock.openState !== null || stock.marketIssues.length === 0) fail();
        unavailableMarketCount++;
        const issues = stock.marketIssues.map((value): MarketIssue => {
          const issue = object(value);
          if (!(issueChecks as readonly unknown[]).includes(issue.check) || !(receivedTypes as readonly unknown[]).includes(issue.receivedType)) fail();
          const check = issue.check as MarketIssue['check'];
          issueCounts[check] = (issueCounts[check] ?? 0) + 1;
          return { check, receivedType: issue.receivedType as MarketIssue['receivedType'] };
        });
        if (affectedStocks.length < 5) affectedStocks.push({ tokenAddress: stock.tokenAddress.toLowerCase(), marketIssues: issues });
      } else fail();
    }
    if (report.unavailableMarketCount !== unavailableMarketCount || (report.status === 'partial') !== (unavailableMarketCount > 0)) fail();
    return { ...base, catalogFormat: 'current' as const, stockCount: report.stocks.length, unavailableMarketCount,
      issueCounts, affectedStocks, omittedAffectedStockCount: Math.max(0, unavailableMarketCount - affectedStocks.length),
      nextStep: report.stocks.length ? 'CONFIGURE_HELD_STOCK_AND_RUN_READ_ONLY_SMOKE' as const : 'ASK_BINANCE_ABOUT_EMPTY_BSC_STOCK_CATALOG' as const };
  }
  const checks = report.checks;
  if (report.status !== 'passed' || !Array.isArray(checks) || checks.length !== smokeChecks.length ||
    !smokeChecks.every((check, index) => checks[index] === check)) fail();
  return { ...base, checks: [...smokeChecks], nextStep: 'REVIEW_READ_ONLY_RFQ_EVIDENCE_AND_SIGNATURE_SEMANTICS' as const };
}
