import { readFile } from 'node:fs/promises';
import { fixtureReadiness, validateFixturePacket } from '../src/release/readiness.ts';

try {
  if (process.argv.includes('--live')) {
    const args = process.argv.slice(2).filter(a => a !== '--require-ready');
    if (args.length !== 2 || args[0] !== '--live') throw new Error();
    const { checkLiveSubmission } = await import('./check-live-submission.ts');
    await checkLiveSubmission(args[1]!);
  } else {
    const value: unknown = JSON.parse(await readFile('docs/submission/packet.json', 'utf8'));
    const packet = validateFixturePacket(value);
    for (const path of packet.artifacts) if (!(await readFile(path, 'utf8')).trim()) throw new Error('SUBMISSION_ARTIFACT_EMPTY');
    console.log(JSON.stringify(fixtureReadiness(packet), null, 2));
    // Integrity verification can pass while the actual submission gate is blocked.
    if (process.argv.includes('--require-ready')) process.exitCode = 1;
  }
} catch {
  console.error('SUBMISSION_PACKET_INVALID: unable to validate the private preparation packet. No input contents are printed.');
  process.exitCode = 1;
}
