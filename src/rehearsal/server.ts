import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { rehearsePlan, parsePlanningRequest, RehearsalError } from './plan.ts';
import { inspectFixtureReceipt } from '../receipts/inspection.ts';
import { RECEIPT_MAX_BYTES, parseReceiptJSON } from '../receipts/canonical.ts';
import { inspectionInput, readinessStatus, projectInspection, type LocalInspector } from '../integration/readiness.ts';
import { RemainError } from '../errors.ts';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']], ['/logo.png', ['logo.png', 'image/png']],
  ['/proof.js', ['proof.js', 'text/javascript; charset=utf-8']],
  ['/response.js', ['response.js', 'text/javascript; charset=utf-8']],
  ['/live.js', ['live.js', 'text/javascript; charset=utf-8']],
  ['/wallet.js', ['wallet.js', 'text/javascript; charset=utf-8']],
  ['/demo-receipt.json', ['demo-receipt.json', 'application/json; charset=utf-8']]
]);

export type RehearsalServerOptions = Readonly<{
  assetRoot?: URL;
  allowedHosts?: readonly string[];
  buildSha?: string;
  bodyReadTimeoutMs?: number;
  inspector?: LocalInspector;
  inspectionTimeoutMs?: number;
}>;

function headers(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
}
function json(response: ServerResponse, status: number, value: unknown, head = false): void {
  if (response.destroyed) return;
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  response.end(head ? undefined : body);
}
function readBody(request: IncomingMessage, limit: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = []; let done = false;
    const finish = (error?: RehearsalError, body?: string) => {
      if (done) return; done = true; clearTimeout(timer); chunks.length = 0;
      request.off('data', onData); request.off('end', onEnd); request.off('aborted', onAborted);
      // Keep an error sink until close, since aborted can precede ECONNRESET.
      if (error) { request.pause(); reject(error); } else resolve(body!);
    };
    const onData = (chunk: Buffer) => {
      if (done) return; size += chunk.length;
      if (size > limit) { finish(new RehearsalError('BODY_TOO_LARGE')); return; }
      chunks.push(chunk);
    };
    const onEnd = () => {
      try { const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); finish(undefined, body); }
      catch { finish(new RehearsalError('INVALID_REQUEST')); }
    };
    const onError = () => finish(new RehearsalError('INVALID_REQUEST'));
    const onAborted = () => finish(new RehearsalError('INVALID_REQUEST'));
    const timer = setTimeout(() => finish(new RehearsalError('BODY_TIMEOUT')), timeoutMs);
    request.on('data', onData); request.once('end', onEnd); request.once('error', onError); request.once('aborted', onAborted);
    request.once('close', () => { onAborted(); request.off('error', onError); });
  });
}
function normalizeAllowedHosts(values: readonly string[] | undefined): Set<string> {
  const hosts = new Set<string>();
  for (const raw of values ?? []) {
    const value = raw.trim().toLowerCase();
    if (!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(value) || value.startsWith('.') || value.endsWith('.') || value.includes('..')) throw new RehearsalError('INVALID_REQUEST');
    hosts.add(value);
  }
  return hosts;
}
function normalizedHost(value: string | undefined): string | null {
  if (!value) return null;
  const host = value.toLowerCase();
  if (!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(host) || host.startsWith('.') || host.endsWith('.') || host.includes('..')) return null;
  return host;
}
function hostAllowed(host: string, explicit: Set<string>): boolean {
  if (/^(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/.test(host)) return true;
  if (explicit.has(host)) return true;
  const withoutPort = host.replace(/:[0-9]{1,5}$/, '');
  return explicit.has(withoutPort);
}
function buildId(value: string | undefined): string {
  return value && /^[a-f0-9]{7,40}$/i.test(value) ? value.toLowerCase() : 'unknown';
}

export function createRehearsalServer(options: RehearsalServerOptions = {}) {
  const assetRoot = options.assetRoot ?? new URL('../../web/', import.meta.url);
  const allowedHosts = normalizeAllowedHosts(options.allowedHosts);
  const deployedBuild = buildId(options.buildSha);
  const bodyReadTimeoutMs = options.bodyReadTimeoutMs ?? 2000;
  if (!Number.isInteger(bodyReadTimeoutMs) || bodyReadTimeoutMs < 1 || bodyReadTimeoutMs > 5000) throw new RehearsalError('INVALID_REQUEST');
  const inspectionTimeoutMs = options.inspectionTimeoutMs ?? 20000;
  if (!Number.isInteger(inspectionTimeoutMs) || inspectionTimeoutMs < 1 || inspectionTimeoutMs > 20000) throw new RehearsalError('INVALID_REQUEST');
  // One global budget is intentionally simple and memory-bounded for a fixture
  // service. It is not an authenticated production trading backend.
  let windowStarted = Date.now(); let requests = 0; let inFlight = 0;
  const server = createServer(async (request, response) => {
    headers(response);
    const host = normalizedHost(request.headers.host);
    if (!host || !hostAllowed(host, allowedHosts)) { json(response, 403, { code: 'HOST_REJECTED' }); return; }
    if (
      request.headers['sec-fetch-site'] === 'cross-site' ||
      request.headers.origin && request.headers.origin !== `http://${host}` && request.headers.origin !== `https://${host}`
    ) { json(response, 403, { code: 'ORIGIN_REJECTED' }); return; }
    const bound = server.address();
    const loopback = bound && typeof bound !== 'string' && ['127.0.0.1', '::1'].includes(bound.address) &&
      /^(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/.test(host) &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '');
    const inspectionAvailable = Boolean(options.inspector && loopback);
    if (request.url === '/api/live/status') {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) { json(response, 405, { code: 'METHOD_REJECTED' }); return; }
      json(response, 200, readinessStatus(inspectionAvailable), request.method === 'HEAD'); return;
    }

    if (request.url === '/healthz') {
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.setHeader('Allow', 'GET, HEAD'); json(response, 405, { code: 'METHOD_REJECTED' }); return; }
      json(response, 200, {
        status: 'ok',
        service: 'remain-rehearsal',
        mode: 'TEST_FIXTURE',
        executionEnabled: false,
        liveGate: 'BLOCKED',
        buildSha: deployedBuild
      }, request.method === 'HEAD');
      return;
    }

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
    if (request.url !== '/api/rehearse' && request.url !== '/api/receipt/verify' && request.url !== '/api/live/inspect') { json(response, 404, { code: 'NOT_FOUND' }); return; }
    const receipt = request.url === '/api/receipt/verify';
    const live = request.url === '/api/live/inspect';
    const limit = receipt ? RECEIPT_MAX_BYTES : 4096;
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); json(response, 405, { code: 'METHOD_REJECTED' }); return; }
    if (live && !inspectionAvailable) { json(response, 503, { code: 'LOCAL_SETUP_REQUIRED' }); return; }
    if (live && !request.headers.origin) { json(response, 403, { code: 'ORIGIN_REJECTED' }); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '')) { json(response, 415, { code: 'CONTENT_TYPE_REJECTED' }); return; }
    if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') { json(response, 415, { code: 'ENCODING_REJECTED' }); return; }
    const length = request.headers['content-length'];
    if (length && (!/^[0-9]+$/.test(length) || Number(length) > limit)) { json(response, 413, { code: 'BODY_TOO_LARGE' }); return; }
    const now = Date.now();
    if (now - windowStarted >= 60000 || now < windowStarted) { windowStarted = now; requests = 0; }
    if (++requests > 30 || inFlight >= 4) { response.setHeader('Retry-After', '60'); json(response, 429, { code: 'REHEARSAL_LIMIT' }); return; }
    inFlight++; const controller = new AbortController();
    const disconnect = () => { if (!response.writableFinished) controller.abort(); };
    response.on('close', disconnect);
    try {
      const body = await readBody(request, limit, bodyReadTimeoutMs);
      controller.signal.throwIfAborted();
      if (live) {
        const input = inspectionInput(parseReceiptJSON(body));
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(inspectionTimeoutMs)]);
        let onAbort: (() => void) | undefined;
        const interrupted = new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(new RemainError('REQUEST_CANCELLED'));
          signal.addEventListener('abort', onAbort, { once: true }); if (signal.aborted) onAbort();
        });
        try {
          const report = await Promise.race([options.inspector!(input, signal), interrupted]);
          if (signal.aborted) throw new RemainError('REQUEST_CANCELLED');
          json(response, 200, projectInspection(report));
        } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
        return;
      }
      if (receipt) { json(response, 200, inspectFixtureReceipt(body)); return; }
      const input = parsePlanningRequest(body);
      json(response, 200, await rehearsePlan(input, controller.signal));
    } catch (error) {
      if (live && error instanceof RemainError && error.code === 'REQUEST_CANCELLED') { json(response, 408, { code: 'REQUEST_CANCELLED' }); return; }
      const tooLarge = error instanceof RehearsalError && error.code === 'BODY_TOO_LARGE';
      const timedOut = error instanceof RehearsalError && error.code === 'BODY_TIMEOUT';
      if (!request.complete) response.setHeader('Connection', 'close');
      json(response, tooLarge ? 413 : timedOut ? 408 : 400, { code: tooLarge ? 'BODY_TOO_LARGE' : timedOut ? 'BODY_TIMEOUT' : 'INVALID_REQUEST' });
    } finally { inFlight--; response.off('close', disconnect); }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  return server;
}
