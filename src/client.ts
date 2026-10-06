import { createHash } from 'node:crypto';
import { BINANCE_ORIGIN, signRequest, wirePath, type Query } from './signing.ts';
import { RemainError, upstreamError } from './errors.ts';

const READ_ENDPOINTS = new Set([
  '/api/v1/dex/aggregator/supported/chain',
  '/api/v1/dex/market/rwa/tokens',
  '/api/v1/dex/market/rwa/price',
  '/api/v1/dex/market/rwa/underlying-market',
  '/api/v1/dex/balance/all-token-balances-by-address',
  '/api/v1/dex/aggregator/quote',
  '/api/v1/dex/aggregator/swap'
]);

export interface CallResult {
  data: unknown;
  timestamp: number;
  responseHash: string;
  latencyMs: number;
}

type Options = {
  apiKey: string; secretKey: string;
  fetcher?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

export class ReadOnlyBinanceClient {
  readonly #apiKey: string;
  readonly #secretKey: string;
  readonly #fetcher: typeof fetch;
  readonly #now: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #timeoutMs: number;

  constructor(options: Options) {
    if (!options.apiKey.trim() || !options.secretKey.trim()) throw new RemainError('CONFIG_MISSING');
    this.#apiKey = options.apiKey;
    this.#secretKey = options.secretKey;
    this.#fetcher = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#timeoutMs = options.timeoutMs ?? 8000;
  }

  async get(endpoint: string, query: Query = []): Promise<CallResult> {
    if (!READ_ENDPOINTS.has(endpoint)) throw new RemainError('READ_ONLY_VIOLATION');
    const path = wirePath(endpoint, query);
    // Quotes expire quickly. Never retry quote/build calls silently.
    const attempts = endpoint.endsWith('/quote') || endpoint.endsWith('/swap') ? 1 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const started = this.#now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const response = await this.#fetcher(BINANCE_ORIGIN + path, {
          method: 'GET',
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
          headers: signRequest({
            apiKey: this.#apiKey, secretKey: this.#secretKey, method: 'GET',
            requestPath: path, timestamp: new Date(this.#now()).toISOString()
          })
        });
        // Bound responses before parsing. Credentials and raw responses are never logged.
        const raw = await readBounded(response, 2 * 1024 * 1024);
        let body: unknown;
        try { body = JSON.parse(raw); }
        catch { throw response.ok ? new RemainError('UPSTREAM_SCHEMA_INVALID') : upstreamError(response.status); }
        const value = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        const code = typeof value.code === 'number' ? value.code : undefined;
        if (!response.ok || (code !== undefined && code !== 0)) {
          const error = upstreamError(response.status, code);
          if (attempt + 1 < attempts && ['RATE_LIMITED', 'UPSTREAM_UNAVAILABLE'].includes(error.code)) {
            const retryAfter = Number(response.headers.get('Retry-After'));
            const delay = response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000 : 250 * (2 ** attempt) + Math.floor(Math.random() * 100);
            if (delay > 2000) throw error;
            clearTimeout(timer);
            await this.#sleep(delay);
            continue;
          }
          throw error;
        }
        if (code !== 0 || value.success === false || typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp) || !('data' in value)) {
          throw new RemainError('UPSTREAM_SCHEMA_INVALID');
        }
        if (Math.abs(value.timestamp - this.#now()) > 60000) throw new RemainError('AUTH_CLOCK_DRIFT');
        return { data: value.data, timestamp: value.timestamp,
          responseHash: createHash('sha256').update(raw).digest('hex'), latencyMs: this.#now() - started };
      } catch (error) {
        if (error instanceof RemainError) throw error;
        if (controller.signal.aborted) throw new RemainError('UPSTREAM_TIMEOUT');
        // Network failures are not retried automatically at this gate.
        throw new RemainError('UPSTREAM_UNAVAILABLE');
      } finally { clearTimeout(timer); }
    }
    throw new RemainError('UPSTREAM_UNAVAILABLE');
  }
}

async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.body) throw new RemainError('UPSTREAM_SCHEMA_INVALID');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new RemainError('UPSTREAM_SCHEMA_INVALID'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
