import { lstat, open, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { inspectEvidence, type EvidenceKind } from '../src/evidence-inspection.ts';
import { parseRfqJSON } from '../src/rfq/json.ts';

const pattern = /^binance-(discovery|smoke|market)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i;
const evidenceDirectory = resolve('evidence');
const maxBytes = 2 * 1024 * 1024;

async function load(file: string) {
  const match = pattern.exec(basename(file));
  if (!match || dirname(file) !== evidenceDirectory) throw new Error();
  // Ignore unrelated files. Never inspect .env, arbitrary paths or symlinks.
  // O_NOFOLLOW protects supported Unix platforms; the pre-open entry check
  // also rejects symlinks on platforms where that flag is unavailable.
  const entry = await lstat(file);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error();
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error();
    const bytes = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = await handle.read(bytes, size, bytes.length - size, null);
      if (read.bytesRead === 0) break;
      size += read.bytesRead;
    }
    if (size > maxBytes) throw new Error();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
    const summary = inspectEvidence(parseRfqJSON(text, maxBytes), match[1]!.toLowerCase() as EvidenceKind);
    if (summary.runId.toLowerCase() !== match[2]!.toLowerCase()) throw new Error();
    return { ...summary, evidenceFile: `evidence/${basename(file)}` };
  } finally { await handle.close(); }
}

try {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error();
  let summary;
  if (args[0]) summary = await load(resolve(args[0]));
  else {
    const files = (await readdir(evidenceDirectory, { withFileTypes: true })).filter((entry) => pattern.test(entry.name));
    if (!files.length || files.length > 500) throw new Error();
    // Choose report time, not filesystem mtime, so copying an old file does
    // not make it the latest run. Malformed candidates prevent silent fallback.
    for (const entry of files) {
      const candidate = await load(resolve(evidenceDirectory, entry.name));
      if (!summary || candidate.startedAt > summary.startedAt ||
        (candidate.startedAt === summary.startedAt && candidate.evidenceFile > summary.evidenceFile)) summary = candidate;
    }
  }
  if (!summary) throw new Error();
  console.log(JSON.stringify(summary, null, 2));
  // Inspecting a file is never a live feasibility check. Preserve a nonzero
  // result for blocked, partial, fixture, historical or legacy reports.
  if (summary.reportStatus !== 'passed' || summary.reportedMode !== 'LIVE_READ_ONLY' || summary.freshness !== 'recent' ||
    ('catalogFormat' in summary && summary.catalogFormat === 'legacy') ||
    ('rfqReviewStatus' in summary && summary.rfqReviewStatus === 'LEGACY_UNREVIEWED') ||
    ('stockCount' in summary && summary.stockCount === 0)) process.exitCode = 1;
} catch {
  console.log(JSON.stringify({ inspectionStatus: 'blocked', code: 'LOCAL_EVIDENCE_INVALID_OR_MISSING',
    liveGate: 'UNVERIFIED', executionEnabled: false,
    nextStep: 'CHECK_IGNORED_EVIDENCE_FILES_OR_RUN_CURRENT_DISCOVERY' }, null, 2));
  process.exitCode = 2;
}
