// Optional, service-bound Cloudflare Container transport for approved read-only BSC RPC.
// Binance always uses its direct signed connection, never this transport.
export function makeRpcEgressFetcher(env, directFetch = fetch) {
  if (env.REMAIN_RPC_EGRESS_ENABLED !== 'true') return directFetch;
  return async (url, init) => {
    if (!env.REMAIN_RPC_EGRESS || typeof env.REMAIN_RPC_EGRESS.fetch !== 'function')
      throw new Error('RPC_EGRESS_NOT_CONFIGURED');
    if (typeof url !== 'string' || ![env.REMAIN_RPC_PRIMARY, env.REMAIN_RPC_SECONDARY].includes(url))
      throw new Error('RPC_EGRESS_TARGET_REJECTED');
    if (init?.method !== 'POST' || typeof init.body !== 'string' || new TextEncoder().encode(init.body).byteLength > 8192)
      throw new Error('RPC_EGRESS_REQUEST_REJECTED');
    if (init.signal?.aborted) throw new Error('RPC_EGRESS_ABORTED');
    // Service binding is private to this Cloudflare account, not an internet relay.
    // An unavailable container never downgrades to a different network route.
    return env.REMAIN_RPC_EGRESS.fetch(new Request('https://rpc-egress.internal/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: url, payload: init.body }),
      signal: init.signal,
      redirect: 'error',
      cache: 'no-store'
    }));
  };
}
