import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { recoverTypedDataAddress, type Hex } from 'viem';
import { address } from '../validation.ts';
import { uuid } from '../orders/model.ts';
import { exactData, ExecutionError, fail } from './cow.ts';
import type { ExecutionEngine } from './engine.ts';

export const sessionTypes = { Session: [{ name: 'wallet', type: 'address' }, { name: 'origin', type: 'string' }, { name: 'nonce', type: 'string' }, { name: 'expiresAt', type: 'uint256' }, { name: 'purpose', type: 'string' }] };
export class ExecutionHttp {
  private readonly engine: ExecutionEngine;
  private readonly key = randomBytes(32);
  private readonly challenges = new Map<string, { wallet: string; origin: string; nonce: string; expiresAt: number; purpose: string }>();
  private readonly now: () => number;
  readonly origin: string;
  constructor(engine: ExecutionEngine, origin: string, now: () => number = Date.now) {
    const u = new URL(origin); if (u.origin !== origin || u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) fail('EXECUTION_ORIGIN_INVALID');
    this.origin = origin; this.engine = engine; this.now = now;
  }
  status() { return { kind: 'REMAIN_EXECUTION_STATUS', available: true, profile: 'COW_BSC_SELL_V1', userConfirmationRequired: true }; }
  private token(wallet: string) {
    const payload = Buffer.from(JSON.stringify({ wallet, expiresAt: this.now() + 600000, origin: this.origin })).toString('base64url');
    return payload + '.' + createHmac('sha256', this.key).update(payload).digest('base64url');
  }
  private wallet(header: string | undefined) {
    if (!header || header.length > 1024 || !header.startsWith('Bearer ')) fail('SESSION_REQUIRED');
    const [payload, mac, extra] = header.slice(7).split('.'); if (!payload || !mac || extra) fail('SESSION_REQUIRED');
    const expected = createHmac('sha256', this.key).update(payload).digest(), supplied = Buffer.from(mac, 'base64url');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) fail('SESSION_REQUIRED');
    const parsed = exactData(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')), ['wallet', 'expiresAt', 'origin']);
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= this.now() || parsed.expiresAt > this.now() + 600000 || parsed.origin !== this.origin) fail('SESSION_REQUIRED');
    return address(parsed.wallet);
  }
  async handle(action: string, body: unknown, authorization: string | undefined) {
    for (const [key, value] of this.challenges) if (value.expiresAt <= this.now()) this.challenges.delete(key);
    if (action === 'challenge') {
      const input = exactData(body, ['wallet']), wallet = address(input.wallet); if (this.challenges.size >= 100) fail('SESSION_LIMIT');
      const message = { wallet, origin: this.origin, nonce: randomUUID(), expiresAt: this.now() + 60000, purpose: 'Sign in to Remain. This authorizes no token transfer or order.' };
      this.challenges.set(message.nonce, message);
      return structuredClone({ domain: { name: 'Remain Session', version: '1', chainId: 56 }, types: sessionTypes, primaryType: 'Session', message });
    }
    if (action === 'login') {
      const input = exactData(body, ['nonce', 'signature']), nonce = uuid(input.nonce), message = this.challenges.get(nonce);
      this.challenges.delete(nonce);
      if (!message || message.expiresAt <= this.now() || typeof input.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) fail('SESSION_REQUIRED');
      const signer = await recoverTypedDataAddress({ domain: { name: 'Remain Session', version: '1', chainId: 56 }, types: sessionTypes,
        primaryType: 'Session', message: { ...message, wallet: message.wallet as Hex, expiresAt: BigInt(message.expiresAt) }, signature: input.signature as Hex });
      if (signer.toLowerCase() !== message.wallet) fail('SESSION_REQUIRED'); return { token: this.token(message.wallet) };
    }
    const wallet = this.wallet(authorization);
    if (action === 'preview') return this.engine.preview(wallet, body);
    if (action === 'prepare') return this.engine.prepare(wallet, body);
    const input = exactData(body, action === 'sign' ? ['id', 'signature'] : ['recover', 'invalidate'].includes(action) ? ['id', 'txHash'] : ['id']), id = uuid(input.id);
    if (action === 'signing') return this.engine.signing(wallet, id);
    if (action === 'approve') return this.engine.approve(wallet, id);
    if (action === 'receipt') return this.engine.receipt(wallet, id);
    if (action === 'sign') return this.engine.sign(wallet, id, input.signature);
    if (action === 'submit') return this.engine.submit(wallet, id);
    if (action === 'poll') return this.engine.poll(wallet, id);
    if (action === 'get') return this.engine.get(wallet, id);
    if (action === 'cancel') return this.engine.cancel(wallet, id);
    if (action === 'recover' && typeof input.txHash === 'string') return this.engine.recoverSettlement(wallet, id, input.txHash);
    if (action === 'invalidate' && typeof input.txHash === 'string') return this.engine.invalidate(wallet, id, input.txHash);
    fail('INVALID_EXECUTION_INPUT');
  }
}
const exposed = new Set(['SESSION_REQUIRED', 'SESSION_LIMIT', 'ORDER_NOT_FOUND', 'INVALID_EXECUTION_INPUT', 'STATE_CONFLICT', 'ACTIVE_ORDER_EXISTS', 'VENDOR_PROFILE_UNSUPPORTED', 'ECONOMIC_BINDING_FAILED', 'ORDER_EXPIRED', 'CONTRACT_UNVERIFIED', 'POSITION_CHANGED', 'RPC_DISAGREEMENT', 'RPC_STALE', 'CHAIN_MISMATCH', 'SMART_WALLET_UNSUPPORTED', 'CASH_DECIMALS_UNVERIFIED', 'FLOOR_BREACH', 'APPROVAL_REQUIRED', 'ORDER_ALREADY_USED', 'SIGNATURE_INVALID', 'MARKET_BLOCKED', 'SETTLEMENT_NOT_CONFIRMED', 'REORG_DETECTED']);
export function executionError(error: unknown) { return error instanceof ExecutionError && exposed.has(error.code) ? error.code : 'EXECUTION_REQUEST_BLOCKED'; }
