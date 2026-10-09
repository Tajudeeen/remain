import { parseRfqJSON } from '../rfq/json.ts';
import { address, BSC_USDT, uint } from '../validation.ts';
import { COW_RELAYER, COW_SETTLEMENT, exactData, fail } from './cow.ts';
import type { ContractPin } from './engine.ts';

export function contractPins(text: string): ContractPin[] {
  const values = parseRfqJSON(text, 16384);
  if (!Array.isArray(values) || values.length < 4 || values.length > 32) fail('CONTRACT_UNVERIFIED');
  const pins = values.map(value => {
    const p = exactData(value, ['address', 'codeHash', 'implementation']);
    if (typeof p.codeHash !== 'string' || !/^[a-f0-9]{64}$/.test(p.codeHash)) fail('CONTRACT_UNVERIFIED');
    let implementation: ContractPin['implementation'] = null;
    if (p.implementation !== null) {
      const i = exactData(p.implementation, ['address', 'codeHash']);
      if (typeof i.codeHash !== 'string' || !/^[a-f0-9]{64}$/.test(i.codeHash)) fail('CONTRACT_UNVERIFIED');
      implementation = { address: address(i.address), codeHash: i.codeHash };
    }
    return { address: address(p.address), codeHash: p.codeHash, implementation };
  });
  if (new Set(pins.map(p => p.address)).size !== pins.length ||
      [BSC_USDT.toLowerCase(), COW_SETTLEMENT, COW_RELAYER].some(target => !pins.some(p => p.address === target))) fail('CONTRACT_UNVERIFIED');
  return pins;
}
export function rpcPair(env: Record<string, string | undefined>): readonly [URL, URL] {
  const urls = [new URL(env.REMAIN_RPC_PRIMARY ?? ''), new URL(env.REMAIN_RPC_SECONDARY ?? '')] as const;
  if (urls.some(u => u.protocol !== 'https:' || u.username || u.password || u.hash) || urls[0].hostname === urls[1].hostname) fail('INDEPENDENT_RPC_REQUIRED');
  return urls;
}

// Offline configuration checks never create a journal, contact a provider or
// flip activation flags. A configured flag is not evidence of compatibility.
export function executionDoctor(env: Record<string, string | undefined>) {
  const checks: { check: string; status: 'PASS' | 'BLOCKED' }[] = [];
  const check = (name: string, run: () => boolean) => {
    let passed = false; try { passed = run(); } catch { /* Redact all values. */ }
    checks.push({ check: name, status: passed ? 'PASS' : 'BLOCKED' });
  };
  check('BINANCE_CREDENTIALS_PRESENT', () => Boolean(env.BINANCE_WEB3_API_KEY?.trim() && env.BINANCE_WEB3_SECRET_KEY?.trim()));
  check('TWO_HTTPS_RPC_HOSTS', () => { rpcPair(env); return true; });
  check('PRIVATE_STORAGE_KEY', () => /^[a-f0-9]{64}$/.test(env.REMAIN_STORAGE_KEY ?? ''));
  check('CONTRACT_PIN_SCHEMA', () => { contractPins(env.REMAIN_CONTRACT_PINS ?? ''); return true; });
  check('EXPLICIT_FEE_CAP', () => { uint(env.REMAIN_MAXIMUM_STOCK_FEE_RAW); return true; });
  check('EXACT_EXECUTION_ORIGIN', () => {
    const u = new URL(env.REMAIN_EXECUTION_ORIGIN ?? '');
    return u.origin === env.REMAIN_EXECUTION_ORIGIN && !u.username && !u.password &&
      (u.protocol === 'https:' || env.HOST !== '0.0.0.0' && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
  });
  check('PUBLIC_HOST_ISOLATION', () => env.HOST !== '0.0.0.0' || env.REMAIN_LOCAL_READ_ONLY !== 'true' &&
    new URL(env.REMAIN_EXECUTION_ORIGIN ?? '').protocol === 'https:' &&
    (env.REMAIN_ALLOWED_HOSTS ?? '').split(',').map(s => s.trim()).includes(new URL(env.REMAIN_EXECUTION_ORIGIN!).hostname));
  check('DURABLE_DATABASE_PATH', () => Boolean(env.REMAIN_EXECUTION_DB?.trim() && env.REMAIN_EXECUTION_DB !== ':memory:'));
  check('PUBLIC_IMAGE_DIGESTS', () => env.HOST !== '0.0.0.0' ||
    /^node:24-bookworm-slim@sha256:[a-f0-9]{64}$/.test(env.REMAIN_NODE_IMAGE ?? '') &&
    /^caddy:2\.10\.2-alpine@sha256:[a-f0-9]{64}$/.test(env.REMAIN_CADDY_IMAGE ?? ''));
  check('ACTIVATION_FLAGS_VALID', () => [env.REMAIN_EXECUTION_ENABLED, env.REMAIN_COW_PROFILE_REVIEWED].every(v => v === undefined || ['true', 'false'].includes(v)));
  return { kind: 'REMAIN_EXECUTION_DOCTOR', scope: 'OFFLINE_CONFIGURATION_ONLY',
    status: checks.every(c => c.status === 'PASS') ? 'CONFIGURED' : 'BLOCKED', checks,
    activationRequested: env.REMAIN_EXECUTION_ENABLED === 'true', profileReviewAsserted: env.REMAIN_COW_PROFILE_REVIEWED === 'true',
    liveGate: 'UNVERIFIED', financialActionsPerformed: false };
}
