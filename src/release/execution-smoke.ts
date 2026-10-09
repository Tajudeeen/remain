import { exactData, fail } from '../execution/cow.ts';
import { boundedJSON, fetchHeaders } from '../execution/rpc.ts';

export async function smokeExecutionHost(origin: string, buildSha: string, availability: 'enabled' | 'disabled', fetcher: typeof fetch = fetch) {
  const base = new URL(origin);
  if (base.origin !== origin || base.username || base.password ||
      base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)) ||
      !/^[a-f0-9]{40}$/.test(buildSha) || !['enabled', 'disabled'].includes(availability)) fail('HOST_SMOKE_CONFIG_INVALID');
  const read = async (path: string) => {
    const signal = AbortSignal.timeout(10000);
    const response = await fetchHeaders(fetcher, origin + path, { method: 'GET', redirect: 'error', cache: 'no-store', signal }, signal);
    if (response.headers.get('x-content-type-options') !== 'nosniff' || response.headers.get('cache-control') !== 'no-store' || response.headers.get('x-frame-options') !== 'DENY') fail('HOST_BOUNDARY_INVALID');
    return boundedJSON(response, signal, 16384);
  };
  const health = exactData(await read('/healthz'), ['status', 'service', 'mode', 'executionEnabled', 'liveGate', 'buildSha']);
  if (health.status !== 'ok' || health.service !== 'remain-rehearsal' || health.mode !== 'TEST_FIXTURE' || health.executionEnabled !== false || health.liveGate !== 'BLOCKED' || health.buildSha !== buildSha) fail('HOST_BUILD_MISMATCH');
  const status = exactData(await read('/api/execution/status'), ['kind', 'available', 'profile', 'userConfirmationRequired']);
  if (status.kind !== 'REMAIN_EXECUTION_STATUS' || status.profile !== 'COW_BSC_SELL_V1' || status.userConfirmationRequired !== true || status.available !== (availability === 'enabled')) fail('HOST_EXECUTION_MISMATCH');
  return { kind: 'REMAIN_EXECUTION_HOST_SMOKE', status: 'PASS', buildSha, availability,
    requests: ['GET_HEALTH', 'GET_EXECUTION_STATUS'], financialActionsPerformed: false,
    liveGate: 'UNVERIFIED', trust: 'EXACT_BUILD_AND_CONFIGURED_AVAILABILITY_ONLY' };
}
