import { signRequest, wirePath, BINANCE_ORIGIN } from '../signing.ts';
import { boundedJSON, fetchHeaders } from './rpc.ts';
import { exactData, fail } from './cow.ts';
import { identifier, uuid } from '../orders/model.ts';
import { dataRecord } from '../input/data.ts';

export type VendorObservation = { orderId: string; status: 'PENDING_VENDOR' | 'PENDING_ONCHAIN' | 'FILLED' | 'FAILED' | 'EXPIRED' | 'CANCELLED'; txHash: string | null };
export type ExecutionVendor = {
  submit(body: { requestId: string; userSignature: string; vendor: 'CowSwap'; quoteId: string }): Promise<VendorObservation>;
  status(orderId: string): Promise<VendorObservation>;
};
export function vendorObservation(value: unknown): VendorObservation {
  const v = dataRecord(value);
  if (!['PENDING_VENDOR', 'PENDING_ONCHAIN', 'FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(v.status as string)) fail('VENDOR_STATUS_INVALID');
  const hash = v.txHash == null || v.txHash === '' ? null : v.txHash;
  if (hash !== null && (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) || v.status === 'FILLED' && hash === null) fail('VENDOR_STATUS_INVALID');
  return { orderId: identifier(v.orderId), status: v.status as VendorObservation['status'], txHash: hash === null ? null : String(hash).toLowerCase() };
}
// Execution transport is separate from the original GET-only client.
// POSTs are never retried here. The encrypted journal owns request identity.
export class BinanceExecutionVendor implements ExecutionVendor {
  private readonly credentials: { apiKey: string; secretKey: string };
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  constructor(credentials: { apiKey: string; secretKey: string }, fetcher: typeof fetch = fetch, now: () => number = Date.now) { this.credentials = credentials; this.fetcher = fetcher; this.now = now; }
  private async request(endpoint: string, method: 'GET' | 'POST', body?: unknown) {
    const path = endpoint.startsWith('/api/v1/dex/aggregator/order/') && /^\/api\/v1\/dex\/aggregator\/order\/[A-Za-z0-9-]+$/.test(endpoint) ? '/build' + endpoint : wirePath(endpoint);
    const text = body === undefined ? '' : JSON.stringify(body), signal = AbortSignal.timeout(10000);
    const headers = signRequest({ ...this.credentials, method, requestPath: path, body: text, timestamp: new Date(this.now()).toISOString() });
    const options: RequestInit = { method, headers: { ...headers, 'Content-Type': 'application/json' }, signal, redirect: 'error', cache: 'no-store' };
    if (method === 'POST') options.body = text;
    const response = await fetchHeaders(this.fetcher, BINANCE_ORIGIN + path, options, signal);
    const envelope = dataRecord(await boundedJSON(response, signal));
    if (envelope.code !== 0 || envelope.success === false || !Number.isSafeInteger(envelope.timestamp) || Math.abs(Number(envelope.timestamp) - this.now()) > 60000) fail('VENDOR_RESPONSE_INVALID');
    return vendorObservation(envelope.data);
  }
  submit(value: { requestId: string; userSignature: string; vendor: 'CowSwap'; quoteId: string }) {
    const v = exactData(value, ['requestId', 'userSignature', 'vendor', 'quoteId']); uuid(v.requestId);
    if (v.vendor !== 'CowSwap' || typeof v.userSignature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(v.userSignature)) fail('SIGNATURE_INVALID'); identifier(v.quoteId);
    return this.request('/api/v1/dex/aggregator/order/submit', 'POST', value);
  }
  status(orderId: string) { return this.request('/api/v1/dex/aggregator/order/' + identifier(orderId), 'GET'); }
}
