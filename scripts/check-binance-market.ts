import { mkdir, writeFile } from 'node:fs/promises';
import { runMarketCheck } from '../src/market-check.ts';

const args = process.argv.slice(2);
// Exactly one public token contract is accepted, never a ticker, URL, wallet
// credential or inferred catalog default. Invalid selection fails before HTTP.
const report = await runMarketCheck(process.env, args.length === 1 ? args[0] : undefined);
await mkdir('evidence', { recursive: true, mode: 0o700 });
const evidenceFile = `evidence/binance-market-${report.runId}.json`;
await writeFile(evidenceFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ ...report, evidenceFile }, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
