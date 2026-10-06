import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { rehearsePlan, RehearsalError } from './plan.ts';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']], ['/logo.png', ['logo.png', 'image/png']]
]);
function headers(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
}
function json(response: ServerResponse, status: number, value: unknown): void {
  if (response.destroyed) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value));
}
function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = []; let done = false;
    request.on('data', (chunk: Buffer) => {
      if (done) return; size += chunk.length;
      if (size > 4096) { done = true; chunks.length = 0; reject(new RehearsalError('BODY_TOO_LARGE')); return; }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    request.on('error', () => { if (!done) { done = true; reject(new RehearsalError('INVALID_REQUEST')); } });
    request.on('aborted', () => { if (!done) { done = true; reject(new RehearsalError('INVALID_REQUEST')); } });
  });
}
export function createRehearsalServer(assetRoot = new URL('../../web/', import.meta.url)) {
  // One global budget is intentionally simple and memory-bounded for a local
  // fixture server. This is not an authenticated production trading service.
  let windowStarted = Date.now(); let requests = 0; let inFlight = 0;
  const server = createServer(async (request, response) => {
    headers(response);
    const host = request.headers.host;
    if (!host || !/^(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/.test(host)) { json(response, 403, { code: 'HOST_REJECTED' }); return; }
    if (request.headers['sec-fetch-site'] === 'cross-site' || request.headers.origin && request.headers.origin !== `http://${host}`) { json(response, 403, { code: 'ORIGIN_REJECTED' }); return; }
    // Exact URL allowlist, rather than filesystem joining untrusted paths.
    const asset = assets.get(request.url ?? '');
    if (asset && (request.method === 'GET' || request.method === 'HEAD')) {
      try {
        const data = await readFile(new URL(asset[0]!, assetRoot));
        response.writeHead(200, { 'Content-Type': asset[1]!, 'Content-Length': data.length });
        response.end(request.method === 'HEAD' ? undefined : data);
      } catch { json(response, 503, { code: 'ASSET_UNAVAILABLE' }); }
      return;
    }
    if (request.url !== '/api/rehearse') { json(response, 404, { code: 'NOT_FOUND' }); return; }
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); json(response, 405, { code: 'METHOD_REJECTED' }); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) { json(response, 415, { code: 'CONTENT_TYPE_REJECTED' }); return; }
    if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') { json(response, 415, { code: 'ENCODING_REJECTED' }); return; }
    if (Number(request.headers['content-length'] ?? 0) > 4096) { json(response, 413, { code: 'BODY_TOO_LARGE' }); return; }
    const now = Date.now();
    if (now - windowStarted >= 60000 || now < windowStarted) { windowStarted = now; requests = 0; }
    if (++requests > 30 || inFlight >= 4) { response.setHeader('Retry-After', '60'); json(response, 429, { code: 'REHEARSAL_LIMIT' }); return; }
    inFlight++; const controller = new AbortController();
    const disconnect = () => { if (!response.writableFinished) controller.abort(); };
    response.on('close', disconnect);
    try {
      const body = await readBody(request);
      const input: unknown = JSON.parse(body);
      json(response, 200, await rehearsePlan(input, controller.signal));
    } catch (error) {
      const tooLarge = error instanceof RehearsalError && error.code === 'BODY_TOO_LARGE';
      json(response, tooLarge ? 413 : 400, { code: tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST' });
    } finally { inFlight--; response.off('close', disconnect); }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  return server;
}
