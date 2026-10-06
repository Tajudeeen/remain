import test from 'node:test';
import assert from 'node:assert/strict';
import { ceilDiv, exposureFloor, formatUnits, normalizeIntent, parseUnits } from '../src/planning/model.ts';
import { intent } from './planning-fixtures.ts';

test('unit conversion remains exact beyond Number precision and with 18-decimal USDT', () => {
  const raw = parseUnits('9007199254740993.123456789012345678', 18);
  assert.equal(raw, '9007199254740993123456789012345678');
  assert.equal(formatUnits(raw, 18), '9007199254740993.123456789012345678');
  assert.equal(parseUnits('25', 18), '25000000000000000000');
  assert.equal(parseUnits('25', 6), '25000000');
  assert.equal(formatUnits('12300', 4), '1.23');
  assert.equal(formatUnits('25', 0), '25');
});
for (const text of ['1e18', '-1', '+1', '.5', '01', '1.', ' 1', 'Infinity', '1.0000001']) {
  test(`rejects ambiguous or excess-precision cash input ${text}`, () => assert.throws(() => parseUnits(text, 6)));
}
test('invalid decimals and uint256 overflow reject', () => {
  for (const decimals of [-1, 37, 1.5, NaN]) { assert.throws(() => parseUnits('1', decimals)); assert.throws(() => formatUnits('1', decimals)); }
  assert.throws(() => parseUnits((1n << 256n).toString(), 0));
  assert.throws(() => ceilDiv(1n, 0n));
});
test('retained exposure rounds upward and absolute floor wins', () => {
  assert.equal(exposureFloor(intent({ stockBalanceRaw: '3', retainBps: 7000 })), 3n);
  assert.equal(exposureFloor(intent({ stockBalanceRaw: '101', retainBps: 7000 })), 71n);
  assert.equal(exposureFloor(intent({ absoluteFloorRaw: '85' })), 85n);
});
test('floor obeys an independent integer oracle over 10000 cases', () => {
  for (let balance = 1n; balance <= 100n; balance++) for (let retain = 0; retain < 10000; retain += 100) {
    const expected = (balance * BigInt(retain) + 9999n) / 10000n;
    assert.equal(exposureFloor(intent({ stockBalanceRaw: balance.toString(), retainBps: retain })), expected);
  }
});
test('intent normalization rejects invalid chain, asset, fractions and floor', () => {
  for (const changes of [{ chain: '1' }, { cashToken: '0x3333333333333333333333333333333333333333' }, { retainBps: 1.5 }, { stockBalanceRaw: '0' }, { absoluteFloorRaw: '101' }, { cashTargetRaw: '01' }, { market: {} }, { allowClosedMarket: 'false' }, { balanceObservedAtMs: NaN }]) assert.throws(() => normalizeIntent({ ...intent(), ...changes }));
});
