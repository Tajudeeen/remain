const artifactPaths = [
  'docs/submission/requirements.md', 'docs/submission/evidence-index.md',
  'docs/submission/demo-script.md', 'docs/submission/devex-worksheet.md',
  'docs/submission/release-checklist.md'
] as const;

const blockedGates = {
  liveFeasibility: 'A complete held-position stock-to-USDT RFQ/build and independently reviewed live evidence are still missing.',
  supportedStock: 'No real bStock, Ondo or xStock is central to the deployed fixture flow.',
  mainnetSettlement: 'No approved BSC mainnet sale and independently reconciled settlement are proven.'
} as const;
const pendingGates = {
  registration: 'Hackathon registration must be confirmed by the owner.',
  eligibility: 'The owner must confirm applicable eligibility and participation terms.',
  ownerDevexReport: 'The owner-authored Developer Experience Report is not complete.',
  demoVideo: 'A final accessible video of four minutes or less is not recorded.',
  publicSource: 'The source is private. Public release requires owner approval and a final history review.',
  signedOutLinks: 'The final repo, video and report links have not passed signed-out review.'
} as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SUBMISSION_SCHEMA_INVALID');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: readonly string[]) {
  if (Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) throw new Error('SUBMISSION_FIELDS_INVALID');
}

export interface FixturePacket {
  schemaVersion: 1;
  project: 'Remain';
  mode: 'TEST_FIXTURE';
  executionEnabled: false;
  snapshotAt: string;
  deployment: { url: string; buildSha: string; netlifyDeployId: string };
  evidence: { verificationWorkflow: string; httpsSmokeWorkflow: string };
  artifacts: string[];
  gates: Record<keyof typeof blockedGates, 'BLOCKED'> & Record<keyof typeof pendingGates, 'PENDING'>;
}

/** A fixture packet can be internally valid while remaining unfit for contest submission. */
export function validateFixturePacket(value: unknown): FixturePacket {
  const packet = object(value);
  keys(packet, ['schemaVersion', 'project', 'mode', 'executionEnabled', 'snapshotAt', 'deployment', 'evidence', 'artifacts', 'gates']);
  if (packet.schemaVersion !== 1 || packet.project !== 'Remain' || packet.mode !== 'TEST_FIXTURE' || packet.executionEnabled !== false) throw new Error('SUBMISSION_FIXTURE_BOUNDARY_INVALID');
  if (typeof packet.snapshotAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(packet.snapshotAt) || !Number.isFinite(Date.parse(packet.snapshotAt)) || new Date(packet.snapshotAt).toISOString() !== packet.snapshotAt.replace('Z', '.000Z')) throw new Error('SUBMISSION_TIMESTAMP_INVALID');
  const deployment = object(packet.deployment);
  keys(deployment, ['url', 'buildSha', 'netlifyDeployId']);
  if (deployment.url !== 'https://remain-cash.netlify.app/' || typeof deployment.buildSha !== 'string' || !/^[a-f0-9]{40}$/.test(deployment.buildSha) || typeof deployment.netlifyDeployId !== 'string' || !/^[a-f0-9]{24}$/.test(deployment.netlifyDeployId)) throw new Error('SUBMISSION_DEPLOYMENT_INVALID');
  const evidence = object(packet.evidence);
  keys(evidence, ['verificationWorkflow', 'httpsSmokeWorkflow']);
  for (const url of Object.values(evidence)) if (typeof url !== 'string' || !/^https:\/\/github\.com\/Tajudeeen\/remain\/actions\/runs\/[1-9]\d*$/.test(url)) throw new Error('SUBMISSION_EVIDENCE_URL_INVALID');
  if (evidence.verificationWorkflow === evidence.httpsSmokeWorkflow) throw new Error('SUBMISSION_EVIDENCE_NOT_DISTINCT');
  if (!Array.isArray(packet.artifacts) || packet.artifacts.length !== artifactPaths.length || new Set(packet.artifacts).size !== artifactPaths.length || !artifactPaths.every(path => (packet.artifacts as unknown[]).includes(path))) throw new Error('SUBMISSION_ARTIFACTS_INVALID');
  const gates = object(packet.gates);
  keys(gates, [...Object.keys(blockedGates), ...Object.keys(pendingGates)]);
  for (const key of Object.keys(blockedGates)) if (gates[key] !== 'BLOCKED') throw new Error('SUBMISSION_LIVE_CLAIM_INVALID');
  for (const key of Object.keys(pendingGates)) if (gates[key] !== 'PENDING') throw new Error('SUBMISSION_RELEASE_CLAIM_INVALID');
  return structuredClone(value) as FixturePacket;
}

export function fixtureReadiness(value: unknown) {
  const packet = validateFixturePacket(value);
  return {
    packetStatus: 'VALID' as const, submissionStatus: 'BLOCKED' as const,
    mode: packet.mode, executionEnabled: packet.executionEnabled,
    evidenceSnapshotAt: packet.snapshotAt, deployedBuildSha: packet.deployment.buildSha,
    evidenceLinksRechecked: false,
    optionalItems: [{ gate: 'demoVideo', reason: 'A video of four minutes or less is strongly recommended, optional under the current organizer rules.' }],
    blockers: [...Object.entries(blockedGates), ...Object.entries(pendingGates).filter(([gate]) => gate !== 'demoVideo')].map(([gate, reason]) => ({ gate, reason }))
  };
}
