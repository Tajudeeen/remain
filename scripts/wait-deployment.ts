import { waitForDeployment } from '../src/release/deployment-wait.ts';

await waitForDeployment(process.env.REMAIN_BASE_URL ?? '', process.env.REMAIN_EXPECTED_BUILD_SHA ?? '');
console.log(JSON.stringify({ status: 'DEPLOYMENT_IDENTITY_MATCH', mode: 'TEST_FIXTURE', executionEnabled: false,
  liveGate: 'BLOCKED', expectedBuildSha: process.env.REMAIN_EXPECTED_BUILD_SHA }));
