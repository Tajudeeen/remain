import { createServer } from 'node:http';
import { approvedTargets, validateRpcEnvelope } from './policy.mjs';

export async function handleRpc(body, config, fetcher = fetch) {
  const targets = approvedTargets(config);
  const input = validateRpcEnvelope(body, targets);
  const response = await fetcher(input.target, {
    method: 'POST', redirect: 'error', cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: input.payload,
    signal: AbortSignal.timeout(9000)
  });
  if (!response.body) throw Error('UPSTREAM_EMPTY');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw Error('UPSTREAM_TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return { status: response.status, contentType: 'application/json', data: Buffer.concat(chunks) };
}
async function readJson(req) {
  let size=0; const chunks=[];
  for await (const chunk of req) {
    size+=chunk.byteLength;
    if (size>12288) throw Error('TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function startServer(config = process.env.REMAIN_RPC_ALLOWED_ENDPOINTS || '') {
  const server=createServer(async (req,res) => {
    if (req.method !== 'POST' || req.url !== '/rpc') { res.writeHead(404); return res.end(); }
    try {
      const data=await readJson(req);
      const result=await handleRpc(data, config);
      res.writeHead(result.status, { 'content-type': result.contentType, 'cache-control': 'no-store' });
      res.end(result.data);
    } catch {
      res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end('{"code":"RPC_EGRESS_UNAVAILABLE"}');
    }
  });
  server.listen(8080, '0.0.0.0');
  return server;
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) startServer();
