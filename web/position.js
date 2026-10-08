// Shared local-response boundary. All values are data, never display HTML.
const address = value => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) throw new Error('INVALID_POSITION');
  return value.toLowerCase();
};
const uint = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= (1n << 256n)) throw new Error('INVALID_POSITION');
  return value;
};
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('INVALID_POSITION');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || !keys.every(key => own.includes(key))) throw new Error('INVALID_POSITION');
  for (const key of own) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(d, 'value') || !d.enumerable) throw new Error('INVALID_POSITION');
  }
  return value;
}
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value);
export function validatePosition(value, submitted, now = Date.now()) {
  const v = exact(value, ['kind', 'mode', 'wallet', 'stock', 'status', 'balanceRaw', 'observedAtMs', 'pagesRead', 'executionEnabled', 'liveGate', 'ownership']);
  const s = exact(v.stock, ['chain', 'token', 'symbol', 'ticker', 'issuer', 'decimals']);
  const input = exact(submitted, ['wallet', 'token']);
  if (v.kind !== 'REMAIN_POSITION_READ' || !['LIVE_READ_ONLY', 'TEST_FIXTURE'].includes(v.mode) ||
      v.wallet !== address(input.wallet) || s.token !== address(input.token) || s.chain !== '56' ||
      !text(s.symbol, 64) || !text(s.ticker, 32) || !['ondo', 'bstock', 'xstocks'].includes(s.issuer) ||
      !Number.isInteger(s.decimals) || s.decimals < 0 || s.decimals > 36 ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(v.observedAtMs) || v.observedAtMs < 0 ||
      now < v.observedAtMs || now - v.observedAtMs > 15000 ||
      !Number.isInteger(v.pagesRead) || v.pagesRead < 1 || v.pagesRead > 10 ||
      v.executionEnabled !== false || v.liveGate !== 'UNVERIFIED' || v.ownership !== 'NOT_AUTHENTICATED') throw new Error('INVALID_POSITION');
  if (v.status === 'HELD_OBSERVED' || v.status === 'ZERO_OBSERVED') {
    uint(v.balanceRaw);
    if ((v.status === 'ZERO_OBSERVED') !== (v.balanceRaw === '0')) throw new Error('INVALID_POSITION');
  } else if (!['RAW_UNAVAILABLE', 'NOT_REPORTED', 'INCOMPLETE'].includes(v.status) || v.balanceRaw !== null || v.status === 'INCOMPLETE' && v.pagesRead !== 10) throw new Error('INVALID_POSITION');
  return Object.freeze({ ...v, stock: Object.freeze({ ...s }) });
}
export function formatPositionUnits(raw, decimals) {
  uint(raw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('INVALID_POSITION');
  if (decimals === 0) return raw;
  const padded = raw.padStart(decimals + 1, '0');
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return padded.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}
export function preparePositionAmount(amount, snapshot, submitted, now = Date.now(), elapsedMs = 0) {
  const v = validatePosition(snapshot, submitted, now);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 15000) throw new Error('POSITION_EXPIRED');
  if (v.status !== 'HELD_OBSERVED') throw new Error('POSITION_UNKNOWN');
  if (typeof amount !== 'string' || amount.length > 116 || !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(amount)) throw new Error('AMOUNT_INVALID');
  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > v.stock.decimals) throw new Error('AMOUNT_PRECISION');
  const raw = BigInt(whole + fraction.padEnd(v.stock.decimals, '0')).toString();
  uint(raw);
  if (raw === '0') throw new Error('AMOUNT_INVALID');
  if (BigInt(raw) > BigInt(v.balanceRaw)) throw new Error('AMOUNT_EXCEEDS_BALANCE');
  return raw;
}
