import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixtureReadiness, validateFixturePacket } from '../src/release/readiness.ts';
import { screenHistoryBlob } from '../src/release/history-screen.ts';

const packet = JSON.parse(await readFile('docs/submission/packet.json', 'utf8'));

test('valid fixture evidence remains blocked and is snapshotted against caller mutation', () => {
  const input = structuredClone(packet); const validated = validateFixturePacket(input);
  input.deployment.buildSha = 'changed';
  assert.equal(validated.deployment.buildSha, packet.deployment.buildSha);
  const report = fixtureReadiness(validated);
  assert.equal(report.packetStatus, 'VALID'); assert.equal(report.submissionStatus, 'BLOCKED');
  assert.equal(report.executionEnabled, false); assert.equal(report.evidenceLinksRechecked, false);
  assert.equal(report.blockers.length, 9);
});

for (const gate of ['liveFeasibility', 'supportedStock', 'mainnetSettlement', 'registration', 'eligibility', 'ownerDevexReport', 'demoVideo', 'publicSource', 'signedOutLinks']) {
  test(`fixture packet cannot promote ${gate} to passed`, () => {
    const input = structuredClone(packet); input.gates[gate] = 'PASSED';
    assert.throws(() => validateFixturePacket(input), /SUBMISSION_(?:LIVE|RELEASE)_CLAIM_INVALID/);
  });
}

for (const change of [
  (x: typeof packet) => { x.executionEnabled = true; },
  (x: typeof packet) => { x.mode = 'LIVE'; },
  (x: typeof packet) => { x.extra = 'unreviewed'; },
  (x: typeof packet) => { x.snapshotAt = '2026-02-30T08:00:00Z'; },
  (x: typeof packet) => { x.deployment.buildSha = 'main'; },
  (x: typeof packet) => { x.deployment.url = 'https://remain-cash.netlify.app/?token=secret'; },
  (x: typeof packet) => { x.evidence.httpsSmokeWorkflow = x.evidence.verificationWorkflow; },
  (x: typeof packet) => { x.evidence.httpsSmokeWorkflow = 'https://github.com.evil.test/Tajudeeen/remain/actions/runs/123'; },
  (x: typeof packet) => { x.artifacts[0] = '../../.env.local'; },
  (x: typeof packet) => { x.artifacts[0] = x.artifacts[1]; },
  (x: typeof packet) => { delete x.gates.mainnetSettlement; }
]) test('malformed or misleading release evidence fails closed', () => {
  const input = structuredClone(packet); change(input); assert.throws(() => validateFixturePacket(input), /SUBMISSION_/);
});

const sha = 'a'.repeat(40);
function screen(path: string, text: string) { return screenHistoryBlob(sha, path, Buffer.from(text)); }
test('history findings report paths and rules without printing sensitive values', () => {
  const secret = 'SensitiveValueNotForLogs0123456789';
  const text = ['BINANCE_WEB3_', 'API_KEY=', secret].join('');
  const findings = screen('old/config.ts', text);
  assert.equal(findings[0]?.rule, 'BINANCE_CREDENTIAL_LITERAL');
  assert.ok(!JSON.stringify(findings).includes(secret));
});
test('private key markers and wallet-key literals are detected', () => {
  assert.equal(screen('old/key.txt', ['-----BEGIN ', 'PRIVATE KEY-----'].join(''))[0]?.rule, 'PRIVATE_KEY_MARKER');
  assert.equal(screen('old/wallet.ts', ['private', 'Key="0x', 'f'.repeat(64), '"'].join(''))[0]?.rule, 'WALLET_PRIVATE_KEY_LITERAL');
});
test('credential filenames are checked even for binary files', () => {
  assert.equal(screenHistoryBlob(sha, '.env.local', Uint8Array.from([0, 1]))[0]?.rule, 'CREDENTIAL_FILE_TRACKED');
  assert.equal(screen('nested/wallet.key', '')[0]?.rule, 'CREDENTIAL_FILE_TRACKED');
});
test('blank environment example, ordinary digests and fixture configuration are not secrets', () => {
  assert.deepEqual(screen('.env.example', ['BINANCE_WEB3_', 'API_KEY=\n'].join('')), []);
  assert.deepEqual(screen('tests/fixture.ts', `planHash="${'f'.repeat(64)}"; secret="fixture-secret"`), []);
});

const historyScript = resolve('scripts/screen-history.ts');
test('release-status CLI returns a blocked exit even when packet integrity passes', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/check-submission.ts'), '--require-ready'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.packetStatus, 'VALID'); assert.equal(report.submissionStatus, 'BLOCKED');
  assert.equal(report.executionEnabled, false);
});
async function repository() {
  const cwd = await mkdtemp(join(tmpdir(), 'remain-history-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  return { cwd, git };
}
function history(cwd: string) {
  const result = spawnSync(process.execPath, [historyScript], { cwd, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  return { status: result.status, report: JSON.parse(result.stdout), output: result.stdout + result.stderr };
}

test('deleted credential content remains detectable in real Git history without value leakage', async () => {
  const { cwd, git } = await repository();
  try {
    const sensitive = 'SyntheticCredentialForHistoryTest0123456789';
    await writeFile(join(cwd, 'old-config.txt'), ['BINANCE_WEB3_', 'SECRET_KEY=', sensitive].join(''), { mode: 0o600 });
    git('add', 'old-config.txt'); git('commit', '-qm', 'fixture old config');
    git('rm', '-q', 'old-config.txt'); git('commit', '-qm', 'fixture removal');
    const result = history(cwd);
    assert.equal(result.status, 1); assert.equal(result.report.status, 'BLOCKED');
    assert.ok(result.report.findings.some((x: { rule: string }) => x.rule === 'BINANCE_CREDENTIAL_LITERAL'));
    assert.ok(!result.output.includes(sensitive));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('a reused empty blob cannot conceal a historical tracked credential filename', async () => {
  const { cwd, git } = await repository();
  try {
    await writeFile(join(cwd, '.env.example'), ''); await writeFile(join(cwd, '.env.local'), '');
    git('add', '.env.example', '.env.local'); git('commit', '-qm', 'fixture reused blob');
    git('rm', '-q', '.env.local'); git('commit', '-qm', 'fixture removal');
    const result = history(cwd);
    assert.equal(result.status, 1); assert.ok(result.report.sensitivePaths.includes('.env.local'));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('clean history passes pattern screening and shallow history cannot receive a pass', async () => {
  const { cwd, git } = await repository();
  try {
    await writeFile(join(cwd, 'README.md'), 'Fixture repository'); git('add', 'README.md'); git('commit', '-qm', 'fixture initial');
    assert.equal(history(cwd).report.status, 'PASS_PATTERN_SCREEN');
    await writeFile(join(cwd, '.git', 'shallow'), git('rev-parse', 'HEAD') + '\n');
    const result = history(cwd);
    assert.equal(result.status, 1); assert.equal(result.report.shallow, true); assert.equal(result.report.status, 'BLOCKED');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
