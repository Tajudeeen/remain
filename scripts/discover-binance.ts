import { discoverStocks } from '../src/discovery.ts';
import { safeError } from '../src/errors.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const runId = randomUUID();
const startedAt = new Date().toISOString();
let report;
try {
  report = { runId, startedAt, ...await discoverStocks(process.env) };
  // A partial catalog must never turn a manual feasibility job green.
  if (report.status === 'partial') process.exitCode = 1;
}
catch (error) { report = { runId, startedAt, status: 'blocked', mode: 'LIVE_READ_ONLY', executionEnabled: false, error: safeError(error) }; process.exitCode = 1; }
// Only allowlisted public metadata or safe classified errors are persisted.
await mkdir('evidence', { recursive: true, mode: 0o700 });
const evidenceFile = `evidence/binance-discovery-${runId}.json`;
await writeFile(evidenceFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ ...report, evidenceFile }, null, 2));
