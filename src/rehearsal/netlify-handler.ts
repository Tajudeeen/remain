import { rehearsePlan, parsePlanningRequest } from './plan.ts';
import { inspectFixtureReceipt } from '../receipts/inspection.ts';
import { RECEIPT_MAX_BYTES } from '../receipts/canonical.ts';
import { readinessStatus, inspectionInput, projectInspection } from '../integration/readiness.ts';
import { positionInput, projectPosition } from '../integration/position.ts';
import { cashPreviewInput, projectCashPreview, cashOrderInput, projectCashOrder } from '../integration/preview.ts';
import { RemainError } from '../errors.ts';
import type { HostedLiveReaders } from '../integration/hosted.ts';
import { proxyExecution, type ExecutionProxy } from './execution-proxy.ts';

export type NetlifyFixtureOptions = Readonly<{ origins: readonly string[]; buildSha?: string; live?: HostedLiveReaders; executionProxy?: ExecutionProxy }>;

function response(status: number, value: unknown, head = false): Response {
  return new Response(head ? null : JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  } });
}

async function boundedBody(request: Request, signal: AbortSignal, limit: number): Promise<string> {
  signal.throwIfAborted();
  if (!request.body) throw new Error('INVALID_REQUEST');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

/** Pure adapter: no wallet, Binance client, SQLite journal or network imports. */
export async function handleNetlifyFixture(request: Request, options: NetlifyFixtureOptions): Promise<Response> {
  let url: URL;
  try {
    url = new URL(request.url);
    const allowed = options.origins.filter(origin => {
      try { const u = new URL(origin); return u.protocol === 'https:' && u.origin === origin; } catch { return false; }
    });
    if (!allowed.includes(url.origin)) return response(403, { code: 'HOST_REJECTED' });
  } catch { return response(403, { code: 'HOST_REJECTED' }); }
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== url.origin) return response(403, { code: 'ORIGIN_REJECTED' });
  const execution = /^\/api\/execution\/(status|challenge|login|preview|prepare|approve|signing|sign|submit|poll|get|cancel|recover|invalidate|receipt)$/.test(url.pathname);
  if (url.search || !execution && !['/healthz', '/api/rehearse', '/api/receipt/verify', '/api/live/status', '/api/live/inspect', '/api/live/position', '/api/live/preview', '/api/live/review', '/api/live/catalog'].includes(url.pathname)) return response(404, { code: 'NOT_FOUND' });
  if (execution && options.executionProxy) return proxyExecution(request,url.pathname.split('/').at(-1)!,options.executionProxy);
  if (url.pathname === '/api/execution/status') return response(['GET', 'HEAD'].includes(request.method) ? 200 : 405, ['GET', 'HEAD'].includes(request.method) ? { kind: 'REMAIN_EXECUTION_STATUS', available: false, profile: 'COW_BSC_SELL_V1', userConfirmationRequired: true } : { code: 'METHOD_REJECTED' }, request.method === 'HEAD');
  if (execution) return response(request.method === 'POST' ? 503 : 405, { code: request.method === 'POST' ? 'EXECUTION_SETUP_REQUIRED' : 'METHOD_REJECTED' });
  if (url.pathname === '/api/live/status') {
    if (!['GET', 'HEAD'].includes(request.method)) return response(405, { code: 'METHOD_REJECTED' });
    return response(200, readinessStatus(Boolean(options.live), options.live ? 'HOSTED_READ_ONLY' : 'LOCAL_ONLY'), request.method === 'HEAD');
  }
  if (url.pathname === '/api/live/catalog') {
    if (!['GET','HEAD'].includes(request.method)) return response(405,{code:'METHOD_REJECTED'});
    if (!options.live) return response(503,{code:'LOCAL_SETUP_REQUIRED'});
    if (request.headers.has('authorization')) return response(400,{code:'INVALID_REQUEST'});
    try {
      const data = await options.live.catalogReader(AbortSignal.any([request.signal,AbortSignal.timeout(12000)]));
      return response(200,data,request.method==='HEAD');
    } catch (error) { return response(error instanceof RemainError && error.code === 'RATE_LIMITED' ? 429 : 502,
      {code:error instanceof RemainError ? error.code : 'UPSTREAM_UNAVAILABLE'}); }
  }
  const liveAction = ['/api/live/inspect', '/api/live/position', '/api/live/preview', '/api/live/review'].includes(url.pathname);
  if (liveAction && !options.live) return response(request.method === 'POST' ? 503 : 405, { code: request.method === 'POST' ? 'LOCAL_SETUP_REQUIRED' : 'METHOD_REJECTED' });
  if (url.pathname === '/healthz') {
    if (!['GET', 'HEAD'].includes(request.method)) return response(405, { code: 'METHOD_REJECTED' });
    return response(200, { status: 'ok', service: 'remain-rehearsal', mode: 'TEST_FIXTURE', executionEnabled: false,
      liveGate: 'BLOCKED', buildSha: options.buildSha && /^[a-f0-9]{40}$/.test(options.buildSha) ? options.buildSha : 'unknown' }, request.method === 'HEAD');
  }
  if (request.method !== 'POST') return response(405, { code: 'METHOD_REJECTED' });
  const receipt = url.pathname === '/api/receipt/verify';
  const limit = receipt ? RECEIPT_MAX_BYTES : 4096;
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return response(415, { code: 'CONTENT_TYPE_REJECTED' });
  if (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity') return response(415, { code: 'ENCODING_REJECTED' });
  const length = request.headers.get('content-length');
  if (length && (!/^[0-9]+$/.test(length) || Number(length) > limit)) return response(413, { code: 'BODY_TOO_LARGE' });
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(liveAction ? 14500 : 2000)]);
    const body = await boundedBody(request, signal, limit);
    if (receipt) return response(200, inspectFixtureReceipt(body));
    if (liveAction) {
      const data: unknown = JSON.parse(body);
      const live = options.live!;
      if (url.pathname === '/api/live/position') {
        const input = positionInput(data);
        return response(200,projectPosition(await live.positionReader(input,signal),input));
      }
      if (url.pathname === '/api/live/preview') {
        const input = cashPreviewInput(data);
        return response(200,projectCashPreview(await live.cashPreviewer(input,signal),input));
      }
      if (url.pathname === '/api/live/review') {
        const input = cashOrderInput(data);
        return response(200,projectCashOrder(await live.cashReviewer(input,signal),input));
      }
      const input = inspectionInput(data);
      return response(200,projectInspection(await live.inspector(input,signal)));
    }
    const input = parsePlanningRequest(body);
    return response(200, await rehearsePlan(input, signal));
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
    if (liveAction && error instanceof RemainError)
      return response(error.code === 'INVALID_INPUT' ? 400 : error.code === 'RATE_LIMITED' ? 429 : error.code === 'UPSTREAM_TIMEOUT' || error.code === 'REQUEST_CANCELLED' ? 408 : 502, {code:error.code});
    return response(tooLarge ? 413 : 400, { code: tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST' });
  }
}
