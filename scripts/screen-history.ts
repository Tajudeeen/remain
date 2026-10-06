import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { screenHistoryBlob, type HistoryFinding } from '../src/release/history-screen.ts';

function git(args: string[], input?: string): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...(input === undefined ? {} : { input }), stdio: ['pipe', 'pipe', 'pipe'] });
}

try {
  const head = git(['rev-parse', 'HEAD']).trim();
  const shallow = git(['rev-parse', '--is-shallow-repository']).trim() !== 'false';
  const entries = new Map<string, string>();
  for (const line of git(['rev-list', '--objects', '--all']).split('\n')) {
    const match = /^([a-f0-9]{40}) (.+)$/.exec(line);
    if (match?.[1] && match[2]) entries.set(match[1], match[2]);
  }
  if (!entries.size || !/^[a-f0-9]{40}$/.test(head)) throw new Error('HISTORY_OBJECTS_MISSING');
  const metadata = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], [...entries.keys()].join('\n') + '\n');
  // rev-list lists each unique blob only once. Check historical filenames
  // separately so a reused example blob cannot conceal a tracked .env file.
  const sensitivePaths = [...new Set(git(['log', '--all', '--format=', '--name-only', '--no-renames']).split('\n'))]
    .filter(path => { const leaf = path.split('/').at(-1) ?? ''; return (leaf.startsWith('.env') && leaf !== '.env.example') || /\.(?:pem|key)$/i.test(leaf); });
  const findings: HistoryFinding[] = [];
  let inspectedBlobs = 0; let binaryBlobs = 0; let oversizedBlobs = 0;
  for (const line of metadata.trim().split('\n')) {
    const match = /^([a-f0-9]{40}) (blob|tree) (\d+)$/.exec(line);
    if (!match) throw new Error('HISTORY_METADATA_INVALID');
    if (match[2] !== 'blob') continue;
    const sha = match[1]!; const path = entries.get(sha)!;
    if (Number(match[3]) > 2 * 1024 * 1024) { oversizedBlobs++; continue; }
    const bytes = execFileSync('git', ['cat-file', 'blob', sha], { maxBuffer: 2 * 1024 * 1024 + 1, stdio: ['pipe', 'pipe', 'pipe'] });
    inspectedBlobs++; if (bytes.includes(0)) binaryBlobs++;
    findings.push(...screenHistoryBlob(sha, path, bytes));
  }
  const passed = !shallow && oversizedBlobs === 0 && findings.length === 0 && sensitivePaths.length === 0;
  const report = {
    kind: 'TRACKED_HISTORY_PATTERN_SCREEN', headSha: head, generatedAt: new Date().toISOString(),
    status: passed ? 'PASS_PATTERN_SCREEN' : 'BLOCKED', shallow, inspectedBlobs, binaryBlobs, oversizedBlobs,
    scope: 'All reachable refs available in this checkout. Text patterns only; binary content, ignored files, dangling objects, external logs and revoked credentials are not cleared.',
    formalAudit: false, provesSecretAbsence: false, findings, sensitivePaths
  };
  await mkdir('evidence', { recursive: true });
  const evidenceFile = `evidence/history-screen-${head}.json`;
  await writeFile(evidenceFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ...report, evidenceFile }, null, 2));
  if (!passed) process.exitCode = 1;
} catch {
  console.error('HISTORY_SCREEN_INCOMPLETE: could not inspect the available tracked history. No object contents are printed.');
  process.exitCode = 1;
}
