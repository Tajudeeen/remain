import { createHash } from 'node:crypto';
import { encodeFunctionData, parseAbi, type Hex } from 'viem';
import { parseRfqJSON } from '../rfq/json.ts';
import { dataRecord } from '../input/data.ts';
import { address } from '../validation.ts';
import { fail } from './cow.ts';

export type Rpc = { call(method: string, params: unknown[]): Promise<unknown> };
const allowed = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getCode', 'eth_getStorageAt', 'eth_call']);
export function quantity(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value) || value.length > 66) fail('RPC_SCHEMA_INVALID');
  return BigInt(value);
}
export function hexHash(value: unknown): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) fail('RPC_SCHEMA_INVALID'); return value.toLowerCase() as Hex;
}
export function bytecodeHash(value: unknown) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value) || value.length > 200002) fail('CONTRACT_UNVERIFIED');
  return createHash('sha256').update(Buffer.from(value.slice(2), 'hex')).digest('hex');
}
export async function boundedJSON(response: Response, signal: AbortSignal, limit = 2 * 1024 * 1024): Promise<unknown> {
  if (!response.ok || !response.body) fail('UPSTREAM_FAILED');
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => { abort = () => reject(new Error('REQUEST_TIMEOUT')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
  try {
    while (true) { const { value, done } = await Promise.race([reader.read(), interrupted]); if (done) break; size += value.length; if (size > limit) fail('UPSTREAM_TOO_LARGE'); chunks.push(value); }
    return parseRfqJSON(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)), limit);
  } finally { if (abort) signal.removeEventListener('abort', abort); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function fetchHeaders(fetcher: typeof fetch, url: string, init: RequestInit, signal: AbortSignal) {
  signal.throwIfAborted(); let abort: (() => void) | undefined;
  const pending = Promise.resolve().then(() => fetcher(url, init)).then(response => {
    if (signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error('REQUEST_TIMEOUT'); }
    return response;
  });
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('REQUEST_TIMEOUT')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  });
  try { return await Promise.race([pending, interrupted]); }
  finally { if (abort) signal.removeEventListener('abort', abort); }
}
export class HttpRpc implements Rpc {
  private readonly url: string; private sequence = 0;
  private readonly fetcher: typeof fetch;
  constructor(url: string, fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
    const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password || u.hash) fail('RPC_CONFIG_INVALID'); this.url = url;
  }
  async call(method: string, params: unknown[]) {
    if (!allowed.has(method)) fail('RPC_METHOD_REJECTED');
    const id = ++this.sequence, signal = AbortSignal.timeout(10000);
    const response = await fetchHeaders(this.fetcher, this.url, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), headers: { 'Content-Type': 'application/json' }, signal, redirect: 'error', cache: 'no-store' }, signal);
    const value = dataRecord(await boundedJSON(response, signal));
    if (value.jsonrpc !== '2.0' || value.id !== id || Object.hasOwn(value, 'error') || !Object.hasOwn(value, 'result')) fail('RPC_SCHEMA_INVALID');
    return value.result;
  }
}
const abi = parseAbi(['function balanceOf(address account) view returns (uint256)', 'function allowance(address owner,address spender) view returns (uint256)']);
export async function tokenValue(rpc: Rpc, token: string, wallet: string, block: unknown, spender?: string): Promise<string> {
  const data = spender ? encodeFunctionData({ abi, functionName: 'allowance', args: [address(wallet) as Hex, address(spender) as Hex] }) : encodeFunctionData({ abi, functionName: 'balanceOf', args: [address(wallet) as Hex] });
  const result = await rpc.call('eth_call', [{ to: address(token), data }, block]);
  if (typeof result !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(result)) fail('RPC_SCHEMA_INVALID'); return BigInt(result).toString();
}
