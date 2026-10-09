import { Container, getContainer } from '@cloudflare/containers';
import { approvedTargets, validateRpcEnvelope } from './policy.mjs';

export class ReadOnlyRpcContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '2m';
  constructor(ctx, env) {
    super(ctx, env);
    // Container verifies the same allowlist independently of the Worker.
    this.envVars = { REMAIN_RPC_ALLOWED_ENDPOINTS: env.REMAIN_RPC_ALLOWED_ENDPOINTS || '' };
  }
}
export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/rpc' ||
        new URL(request.url).search) return new Response(null, { status: 404 });
    try {
      const targets = approvedTargets(env.REMAIN_RPC_ALLOWED_ENDPOINTS);
      const length = request.headers.get('content-length');
      if (length && Number(length) > 12288) throw Error('TOO_LARGE');
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > 12288) throw Error('TOO_LARGE');
      const input = validateRpcEnvelope(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), targets);
      const container = getContainer(env.RPC_CONTAINER, 'remain-readonly-rpc-v1');
      return await container.fetch(new Request('http://container/rpc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: request.signal
      }));
    } catch {
      // No raw RPC bodies, API tokens, private target URLs or upstream errors in logs.
      return Response.json({ code: 'RPC_EGRESS_UNAVAILABLE' }, { status: 503 });
    }
  }
};
