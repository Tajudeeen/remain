// Shared between the Worker admission gate and the Node container.
// Narrow read-only JSON-RPC policy; this is not a general HTTP proxy.
const METHODS = new Set([
  'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber',
  'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getCode',
  'eth_getStorageAt', 'eth_call'
]);
export function approvedTargets(config) {
  const values = typeof config === 'string' ? config.split('\n').map(s => s.trim()).filter(Boolean) : [];
  if (values.length < 1 || values.length > 2 || new Set(values).size !== values.length)
    throw new Error('EGRESS_ALLOWLIST_REQUIRED');
  return new Set(values.map(value => {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash ||
        (u.port && u.port !== '443') || u.hostname === 'localhost' ||
        /(?:^|\.)binance\.com$/i.test(u.hostname) || /(?:^|\.)binance\.info$/i.test(u.hostname) ||
        /(?:^|\.)geckoterminal\.com$/i.test(u.hostname) ||
        /^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname) ||
        u.hostname.includes(':') || u.hostname.endsWith('.internal') || u.hostname.endsWith('.local'))
      throw new Error('EGRESS_TARGET_REJECTED');
    return u.href;
  }));
}
export function validateRpcEnvelope(value, targets) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'payload,target' ||
      typeof value.target !== 'string' || !targets.has(value.target) ||
      typeof value.payload !== 'string' || new TextEncoder().encode(value.payload).byteLength > 8192)
    throw new Error('EGRESS_REQUEST_REJECTED');
  let rpc;
  try { rpc = JSON.parse(value.payload); } catch { throw new Error('EGRESS_REQUEST_REJECTED'); }
  if (!rpc || typeof rpc !== 'object' || Array.isArray(rpc) ||
      Object.keys(rpc).sort().join(',') !== 'id,jsonrpc,method,params' ||
      rpc.jsonrpc !== '2.0' || !Number.isSafeInteger(rpc.id) || rpc.id < 1 ||
      !METHODS.has(rpc.method) || !Array.isArray(rpc.params) ||
      rpc.params.length > 8) throw new Error('EGRESS_METHOD_REJECTED');
  return { target: value.target, payload: value.payload };
}
