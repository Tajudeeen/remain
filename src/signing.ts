import { createHmac, randomUUID } from 'node:crypto';
import { RemainError } from './errors.ts';

export const BINANCE_ORIGIN = 'https://web3.binance.com';
export type Query = ReadonlyArray<readonly [string, string]>;

export function wirePath(endpoint: string, query: Query = []): string {
  // Fixed API paths only. Never normalize an untrusted URL after signing it.
  if (!/^\/api\/v1\/[a-z0-9/-]+$/.test(endpoint) || endpoint.includes('//') || endpoint.endsWith('/')) {
    throw new RemainError('INVALID_INPUT');
  }
  const keys = new Set<string>();
  const encoded = query.map(([key, value]) => {
    if (!key || keys.has(key) || typeof value !== 'string') throw new RemainError('INVALID_INPUT');
    keys.add(key);
    return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }).join('&');
  return `/build${endpoint}${encoded ? `?${encoded}` : ''}`;
}

export function signRequest(input: {
  apiKey: string; secretKey: string; method: 'GET' | 'POST';
  requestPath: string; body?: string; timestamp?: string; nonce?: string;
}): Record<string, string> {
  const { apiKey, secretKey, method, requestPath } = input;
  const body = input.body ?? '';
  const timestamp = input.timestamp ?? new Date().toISOString();
  const nonce = input.nonce ?? randomUUID();
  if (!apiKey.trim() || !secretKey.trim() || /[\r\n]/.test(apiKey)) throw new RemainError('CONFIG_MISSING');
  if (!requestPath.startsWith('/build/api/v1/') || /[\s#\r\n]/.test(requestPath)) throw new RemainError('INVALID_INPUT');
  if (!Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) throw new RemainError('INVALID_INPUT');
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(nonce) || (method === 'GET' && body !== '')) throw new RemainError('INVALID_INPUT');
  const signature = createHmac('sha256', secretKey).update(timestamp + method + requestPath + body, 'utf8').digest('base64');
  return {
    'X-OC-APIKEY': apiKey,
    'X-OC-TIMESTAMP': timestamp,
    'X-OC-SIGN': signature,
    'X-OC-NONCE': nonce,
    'X-OC-RECV-WINDOW': '5000',
    'Accept': 'application/json'
  };
}
