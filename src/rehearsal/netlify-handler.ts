import { rehearsePlan } from './plan.ts';

export type NetlifyFixtureOptions = Readonly<{ origins: readonly string[]; buildSha?: string }>;

function response(status: number, value: unknown, head = false): Response {
  return new Response(head ? null : JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  } });
}

async function boundedBody(request: Request, signal: AbortSignal): Promise<string> {
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
      if (size > 4096) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
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
  if (url.search || !['/healthz', '/api/rehearse'].includes(url.pathname)) return response(404, { code: 'NOT_FOUND' });
  if (url.pathname === '/healthz') {
    if (!['GET', 'HEAD'].includes(request.method)) return response(405, { code: 'METHOD_REJECTED' });
    return response(200, { status: 'ok', service: 'remain-rehearsal', mode: 'TEST_FIXTURE', executionEnabled: false,
      liveGate: 'BLOCKED', buildSha: options.buildSha && /^[a-f0-9]{40}$/.test(options.buildSha) ? options.buildSha : 'unknown' }, request.method === 'HEAD');
  }
  if (request.method !== 'POST') return response(405, { code: 'METHOD_REJECTED' });
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return response(415, { code: 'CONTENT_TYPE_REJECTED' });
  if (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity') return response(415, { code: 'ENCODING_REJECTED' });
  const length = request.headers.get('content-length');
  if (length && (!/^[0-9]+$/.test(length) || Number(length) > 4096)) return response(413, { code: 'BODY_TOO_LARGE' });
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(2000)]);
    const input: unknown = JSON.parse(await boundedBody(request, signal));
    return response(200, await rehearsePlan(input, signal));
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'BODY_TOO_LARGE';
    return response(tooLarge ? 413 : 400, { code: tooLarge ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST' });
  }
}
