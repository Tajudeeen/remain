import { exactData, fail } from '../execution/cow.ts';
import { boundedJSON, fetchHeaders } from '../execution/rpc.ts';

const assertionKeys = ['registrationConfirmed', 'eligibilityConfirmed', 'ownerAuthorshipConfirmed', 'publicReleaseApproved', 'contractSourcesReviewed', 'independentRpcOperatorsConfirmed'] as const;
export function liveSubmissionManifest(value: unknown) {
  const r = exactData(value, ['kind', 'deploymentOrigin', 'buildSha', 'receiptPath', 'ownerReportPath', 'ownerAssertions']);
  if (r.kind !== 'REMAIN_LIVE_SUBMISSION_V1' || typeof r.deploymentOrigin !== 'string' || typeof r.buildSha !== 'string' || !/^[a-f0-9]{40}$/.test(r.buildSha)) fail('SUBMISSION_MANIFEST_INVALID');
  const u = new URL(r.deploymentOrigin);
  if (u.protocol !== 'https:' || u.origin !== r.deploymentOrigin || u.username || u.password) fail('SUBMISSION_MANIFEST_INVALID');
  if (typeof r.receiptPath !== 'string' || typeof r.ownerReportPath !== 'string' || !r.receiptPath || !r.ownerReportPath || r.receiptPath === r.ownerReportPath) fail('SUBMISSION_MANIFEST_INVALID');
  const assertions = exactData(r.ownerAssertions, assertionKeys);
  if (assertionKeys.some(k => typeof assertions[k] !== 'boolean')) fail('SUBMISSION_MANIFEST_INVALID');
  return { deploymentOrigin: r.deploymentOrigin, buildSha: r.buildSha, receiptPath: r.receiptPath, ownerReportPath: r.ownerReportPath,
    ownerAssertions: assertions as Record<typeof assertionKeys[number], boolean> };
}
export async function publicSourceCheck(buildSha: string, fetcher: typeof fetch = fetch) {
  if (!/^[a-f0-9]{40}$/.test(buildSha)) fail('SUBMISSION_MANIFEST_INVALID');
  const read = async (path: string) => {
    const signal = AbortSignal.timeout(10000);
    return boundedJSON(await fetchHeaders(fetcher, 'https://api.github.com/repos/Tajudeeen/remain' + path,
      { method: 'GET', headers: { Accept: 'application/vnd.github+json' }, signal, redirect: 'error', credentials: 'omit', cache: 'no-store' }, signal), signal, 65536);
  };
  const repo = await read('');
  if (!repo || typeof repo !== 'object' || Array.isArray(repo)) return false;
  const r = repo as Record<string, unknown>;
  if (r.full_name !== 'Tajudeeen/remain' || r.private !== false || r.archived !== false || r.visibility !== 'public') return false;
  const commit = await read('/git/commits/' + buildSha);
  return Boolean(commit && typeof commit === 'object' && !Array.isArray(commit) && (commit as Record<string, unknown>).sha === buildSha);
}

// Only the concrete CLI supplies these readers in ordinary use. Test injection
// exercises failures without network access or any source publication action.
export async function assessLiveSubmission(value: unknown, checks: {
  settlement: (path: string) => Promise<{ technicalStatus: string }>;
  host: (origin: string, buildSha: string) => Promise<{ status: string }>;
  source: (buildSha: string) => Promise<boolean>;
  ownerReport: (path: string) => Promise<boolean>;
}) {
  const manifest = liveSubmissionManifest(value), evidence: { check: string; status: 'PASS' | 'BLOCKED' }[] = [];
  const run = async (name: string, check: () => Promise<boolean>) => {
    let pass = false; try { pass = await check(); } catch { /* No provider or private content. */ }
    evidence.push({ check: name, status: pass ? 'PASS' : 'BLOCKED' }); return pass;
  };
  const settled = await run('LIVE_SUPPORTED_STOCK_SETTLEMENT', async () => (await checks.settlement(manifest.receiptPath)).technicalStatus === 'SETTLEMENT_RECHECKED');
  // A missing or fixture receipt stops downstream checks, even with all owner
  // declarations true. Do not perform unrelated requests past that boundary.
  if (settled) {
    const hosted = await run('EXACT_BUILD_EXECUTION_HOST', async () => (await checks.host(manifest.deploymentOrigin, manifest.buildSha)).status === 'PASS');
    if (hosted) {
      const publicSource = await run('SIGNED_OUT_PUBLIC_SOURCE_COMMIT', () => checks.source(manifest.buildSha));
      if (publicSource) await run('OWNER_REPORT_PRESENT', () => checks.ownerReport(manifest.ownerReportPath));
    }
  }
  const assertions = assertionKeys.map(check => ({ check, asserted: manifest.ownerAssertions[check], trust: 'OWNER_ASSERTION_NOT_INDEPENDENTLY_VERIFIED' }));
  const reviewable = settled && evidence.length === 4 && evidence.every(e => e.status === 'PASS') && assertions.every(a => a.asserted);
  return { kind: 'REMAIN_LIVE_SUBMISSION_REVIEW', submissionStatus: reviewable ? 'READY_FOR_OWNER_REVIEW' : 'BLOCKED',
    buildSha: manifest.buildSha, evidence, ownerAssertions: assertions,
    routeProvenance: 'BINANCE_TRANSPORT_AND_USAGE_REQUIRE_OWNER_EVIDENCE_REVIEW',
    publicationPerformed: false, submissionPerformed: false, financialActionsPerformed: false,
    automaticApproval: false };
}
