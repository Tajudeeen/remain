import { mkdir, writeFile } from 'node:fs/promises';
import { runFeasibility } from '../src/feasibility.ts';

const report = await runFeasibility(process.env);
await mkdir('evidence', { recursive: true, mode: 0o700 });
const output = `evidence/binance-smoke-${report.runId}.json`;
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({
  status: report.status, mode: report.mode, executionEnabled: false,
  checks: report.checks, rfqReview: report.rfqReview, error: report.error, evidenceFile: output
}, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
