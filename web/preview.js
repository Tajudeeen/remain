import { validatePosition } from './position.js';

const fail = () => { throw new Error('INVALID_PREVIEW'); };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || !keys.every(key => own.includes(key))) fail();
  for (const key of own) { const d = Object.getOwnPropertyDescriptor(value, key); if (!Object.hasOwn(d, 'value') || !d.enumerable) fail(); }
  return value;
}
function list(value, max) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail();
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) fail(); }
  return value;
}
const address = value => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) fail();
  return value.toLowerCase();
};
const raw = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= (1n << 256n)) fail();
  return value;
};
export function previewInput(value) {
  const v = exact(value, ['wallet', 'token', 'cashTarget', 'retainBps', 'maxImpactBps', 'allowClosedMarket']);
  if (typeof v.cashTarget !== 'string' || v.cashTarget.length > 116 || !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(v.cashTarget) || !/[1-9]/.test(v.cashTarget) ||
      !Number.isInteger(v.retainBps) || v.retainBps < 0 || v.retainBps > 10000 ||
      !Number.isInteger(v.maxImpactBps) || v.maxImpactBps < 0 || v.maxImpactBps > 500 || typeof v.allowClosedMarket !== 'boolean') fail();
  return Object.freeze({ ...v, wallet: address(v.wallet), token: address(v.token) });
}
export function cashTargetRaw(value, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || typeof value !== 'string' || value.length > 116 || !/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) fail();
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) fail();
  const result = BigInt(whole + fraction.padEnd(decimals, '0')).toString();
  raw(result); if (result === '0') fail(); return result;
}
export function impactWithin(value, bps) {
  if (value === null) return false;
  if (typeof value !== 'string' || value.length > 48 || !/^-?(0|[1-9][0-9]*)(?:\.[0-9]{1,36})?$/.test(value)) fail();
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  // Compare the absolute reported percent exactly. Never round a fraction of a basis point down.
  return BigInt(whole + fraction) * 100n <= BigInt(bps) * 10n ** BigInt(fraction.length);
}
export function qualifiesPreview(route, input, target) {
  return impactWithin(route.impactPercent, input.maxImpactBps) && BigInt(route.estimatedOutputRaw) >= BigInt(target);
}
export function validatePreview(value, submitted, now = Date.now()) {
  const v = exact(value, ['kind', 'mode', 'input', 'position', 'market', 'cashDecimals', 'cashTargetRaw', 'floorRaw', 'maxInputRaw', 'probes', 'candidate', 'stopReason', 'createdAtMs', 'executionEnabled', 'liveGate', 'minimumOutputBinding', 'fees', 'ownership']);
  const input = previewInput(v.input), expected = previewInput(submitted);
  if (Object.keys(input).some(k => input[k] !== expected[k]) || v.kind !== 'REMAIN_CASH_PREVIEW' || !['LIVE_READ_ONLY', 'TEST_FIXTURE'].includes(v.mode) ||
      v.executionEnabled !== false || v.liveGate !== 'UNVERIFIED' || v.minimumOutputBinding !== 'UNVERIFIED' || v.fees !== 'UNVERIFIED' || v.ownership !== 'NOT_AUTHENTICATED' ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(v.createdAtMs) || v.createdAtMs < 0 || v.createdAtMs > now || now - v.createdAtMs > 15000 ||
      !['SEARCH_LIMIT', 'EXHAUSTED'].includes(v.stopReason)) fail();
  const position = validatePosition(v.position, { wallet: input.wallet, token: input.token }, now);
  if (position.mode !== v.mode || position.status !== 'HELD_OBSERVED' || position.observedAtMs > v.createdAtMs) fail();
  const market = exact(v.market, ['marketStatus', 'openState', 'reasonCode', 'observedAtMs']);
  if (!['regular', 'premarket', 'postmarket', 'overnight', 'closed'].includes(market.marketStatus) || typeof market.openState !== 'boolean' ||
      ![null, 'TRADING', 'MARKET_CLOSED'].includes(market.reasonCode) ||
      !Number.isSafeInteger(market.observedAtMs) || market.observedAtMs < position.observedAtMs || market.observedAtMs > v.createdAtMs || now - market.observedAtMs > 60000 ||
      (market.marketStatus === 'closed') === market.openState ||
      (market.reasonCode === 'TRADING' && !market.openState) || (market.reasonCode === 'MARKET_CLOSED' && market.openState) ||
      (!market.openState && !input.allowClosedMarket)) fail();
  const floor = (BigInt(position.balanceRaw) * BigInt(input.retainBps) + 9999n) / 10000n;
  const max = BigInt(position.balanceRaw) - floor;
  if (raw(v.floorRaw) !== floor.toString() || raw(v.maxInputRaw) !== max.toString() || max <= 0n) fail();
  const probes = list(v.probes, 8), seen = new Set(); let decimals = null, best = null, previous = market.observedAtMs;
  const detached = probes.map((p, i) => {
    exact(p, ['inputRaw', 'observedAtMs', 'routes']); raw(p.inputRaw);
    if (p.inputRaw === '0' || BigInt(p.inputRaw) > max || seen.has(p.inputRaw) || !Number.isSafeInteger(p.observedAtMs) ||
        p.observedAtMs < previous || p.observedAtMs > v.createdAtMs || now - p.observedAtMs > 15000) fail();
    previous = p.observedAtMs;
    seen.add(p.inputRaw);
    const routes = list(p.routes, 16).map((r, j) => {
      exact(r, ['vendor', 'estimatedOutputRaw', 'impactPercent']);
      if (!['PcsXRfq', 'InchFusion', 'CowSwap'].includes(r.vendor)) fail();
      raw(r.estimatedOutputRaw); if (r.estimatedOutputRaw === '0') fail();
      impactWithin(r.impactPercent, input.maxImpactBps);
      if (qualifiesPreview(r, input, v.cashTargetRaw) && (!best || BigInt(p.inputRaw) < BigInt(probes[best.probeIndex].inputRaw) ||
          p.inputRaw === probes[best.probeIndex].inputRaw && BigInt(r.estimatedOutputRaw) > BigInt(probes[best.probeIndex].routes[best.routeIndex].estimatedOutputRaw))) best = { probeIndex: i, routeIndex: j };
      return Object.freeze({ ...r });
    });
    if (routes.length) decimals = v.cashDecimals;
    return Object.freeze({ ...p, routes: Object.freeze(routes) });
  });
  if (!probes.length || (decimals === null ? v.cashDecimals !== null || v.cashTargetRaw !== null : cashTargetRaw(input.cashTarget, v.cashDecimals) !== v.cashTargetRaw)) fail();
  if (best === null ? v.candidate !== null : !v.candidate || (exact(v.candidate, ['probeIndex', 'routeIndex']), v.candidate.probeIndex !== best.probeIndex || v.candidate.routeIndex !== best.routeIndex)) fail();
  return Object.freeze({ ...v, input, position, market: Object.freeze({ ...market }), probes: Object.freeze(detached), candidate: best && Object.freeze(best) });
}
