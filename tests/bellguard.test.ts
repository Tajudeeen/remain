import test from 'node:test';
import assert from 'node:assert/strict';
import { bellGuard } from '../src/planning/bellguard.ts';
import { intent, quote, clock, stock, wallet } from './planning-fixtures.ts';
const query = { wallet, chain: '56' as const, stockToken: stock, cashToken: intent().cashToken, inputRaw: '20' };
test('planning verdict keeps execution disabled and checks both net cash and retained tokens', () => {
  const v = bellGuard(intent(), quote(query), '20', clock);
  assert.equal(v.status, 'PASS_FOR_PLANNING'); assert.equal(v.executionEnabled, false);
  assert.equal(v.amounts?.remainingStockRaw, '80'); assert.equal(v.amounts?.minimumNetCashRaw, '20');
});
test('expected output reaching target is insufficient when fees reduce the minimum', () => {
  const v = bellGuard(intent(), quote(query, { expectedGrossOutputRaw: '21', minimumGrossOutputRaw: '20', outputFeeUpperBoundRaw: '1' }), '20', clock);
  assert.ok(v.reasons.includes('CASH_TARGET_SHORTFALL'));
});
test('stock-denominated input fees count against the floor', () => {
  const v = bellGuard(intent(), quote({ ...query, inputRaw: '30' }, { inputFeeRaw: '1' }), '30', clock);
  assert.ok(v.reasons.includes('FLOOR_BREACH'));
});
for (const [name, changes, reason] of [
  ['wrong wallet', { wallet: stock }, 'IDENTITY_MISMATCH'],
  ['wrong input', { inputRaw: '21' }, 'AMOUNT_MISMATCH'],
  ['impact', { impactBps: 51 }, 'IMPACT_LIMIT'],
  ['expired', { expiresAtMs: clock }, 'QUOTE_EXPIRING'],
  ['short window', { expiresAtMs: clock + 4999 }, 'QUOTE_EXPIRING'],
  ['future quote', { issuedAtMs: clock + 1 }, 'QUOTE_STALE'],
  ['stale quote', { issuedAtMs: clock - 15001 }, 'QUOTE_STALE'],
  ['unverified minimum', { minimumOutputBinding: 'UNVERIFIED' }, 'MINIMUM_OUTPUT_UNVERIFIED'],
  ['impossible minimum', { minimumGrossOutputRaw: '21' }, 'INVALID_OUTPUT_BOUNDS'],
  ['fees consume minimum', { outputFeeUpperBoundRaw: '20' }, 'INVALID_OUTPUT_BOUNDS'],
  ['malformed fees', { inputFeeRaw: '-1' }, 'INVALID_QUOTE']
] as const) {
  test(`blocks ${name}`, () => assert.ok(bellGuard(intent(), quote(query, changes), '20', clock).reasons.includes(reason)));
}
test('fractional slippage breaches cannot round down to the allowed bps', () => {
  const v = bellGuard(intent({ cashTargetRaw: '1', maxSlippageBps: 1, maxExpectedSurplusRaw: '100000' }), quote(query, { expectedGrossOutputRaw: '10001', minimumGrossOutputRaw: '9999' }), '20', clock);
  assert.ok(v.reasons.includes('SLIPPAGE_LIMIT'));
});
test('closed markets require permission and preserve a warning', () => {
  const closed = { observedAtMs: clock, openState: false, marketStatus: 'closed', reasonCode: 'MARKET_CLOSED' };
  assert.ok(bellGuard(intent({ market: closed }), quote(query), '20', clock).reasons.includes('CLOSED_MARKET_PERMISSION_REQUIRED'));
  const v = bellGuard(intent({ market: closed, allowClosedMarket: true }), quote(query), '20', clock);
  assert.equal(v.status, 'PASS_FOR_PLANNING'); assert.ok(v.warnings.some((w) => w.includes('closed')));
});
test('hard market blocks cannot be overridden by closed-market permission', () => {
  for (const reasonCode of ['MARKET_PAUSED', 'MARKET_MAINTENANCE', 'ASSET_PAUSED', 'ASSET_LIMITED', 'UNSUPPORTED', 'UNKNOWN']) {
    assert.ok(bellGuard(intent({ allowClosedMarket: true, market: { observedAtMs: clock, openState: false, marketStatus: 'pause', reasonCode } }), quote(query), '20', clock).reasons.includes('MARKET_BLOCKED'));
  }
});
test('stale balance, market facts and inconsistent states block', () => {
  assert.ok(bellGuard(intent({ balanceObservedAtMs: clock - 15001 }), quote(query), '20', clock).reasons.includes('BALANCE_STALE'));
  assert.ok(bellGuard(intent({ market: { ...intent().market, observedAtMs: clock - 60001 } }), quote(query), '20', clock).reasons.includes('MARKET_STALE'));
  assert.ok(bellGuard(intent({ market: { ...intent().market, openState: false } }), quote(query), '20', clock).reasons.includes('MARKET_INCONSISTENT'));
  assert.ok(bellGuard(intent({ market: { ...intent().market, reasonCode: 'MARKET_CLOSED' } }), quote(query), '20', clock).reasons.includes('MARKET_INCONSISTENT'));
});
test('surplus cap blocks unintended excess cash raises', () => {
  assert.ok(bellGuard(intent({ maxExpectedSurplusRaw: '0' }), quote(query, { expectedGrossOutputRaw: '21', minimumGrossOutputRaw: '21' }), '20', clock).reasons.includes('SURPLUS_LIMIT'));
});
test('fee upper bound cannot hide a surplus-cap violation', () => {
  const v = bellGuard(intent({ cashTargetRaw: '15', maxExpectedSurplusRaw: '0' }), quote(query, { outputFeeUpperBoundRaw: '5' }), '20', clock);
  assert.ok(v.reasons.includes('SURPLUS_LIMIT'));
  assert.equal(v.amounts?.minimumNetCashRaw, '15');
  assert.equal(v.amounts?.maximumExpectedNetCashRaw, '20');
});
test('invalid intent fails closed', () => assert.deepEqual(bellGuard({}, {}, '1', clock).reasons, ['INVALID_INTENT']));
