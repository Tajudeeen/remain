import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewTypedData } from '../src/rfq/typed-data.ts';
import { parseRfqJSON, snapshotRfq } from '../src/rfq/json.ts';
import { reviewRfqBuild } from '../src/rfq/review.ts';
import { inspectRfq } from '../src/validation.ts';
import { safeError } from '../src/errors.ts';
import { inspectEvidence } from '../src/evidence-inspection.ts';
import { config, fixtureTyped, fixtureBuild, fixtureQuote, token, wallet } from './fixtures/rfq.ts';

function scalar(type: string, value: unknown) {
  return { domain: { chainId: 56, verifyingContract: token }, primaryType: 'Order',
    types: { Order: [{ name: 'value', type }] }, message: { value } };
}
test('nested typed data and declared domain are structurally checked without signing', () => {
  const result = reviewRfqBuild(fixtureBuild(), fixtureQuote(), config);
  assert.equal(result.typeCount, 3); assert.equal(result.fieldCount, 7);
  assert.equal(result.domainTypeDeclared, true); assert.equal(result.signatureSemantics, 'UNVERIFIED');
  assert.equal(result.executionEnabled, false); assert.equal(result.checksumKind, 'SHA256_JSON_NOT_EIP712');
  const text = JSON.stringify(result);
  for (const secret of [token, wallet, 'fixture-quote', 'PcsXRfq', '25000000000000000000', 'typedDataToSign']) assert.equal(text.includes(secret), false);
  assert.deepEqual(reviewTypedData(fixtureTyped()), reviewTypedData(JSON.stringify(fixtureTyped())));
});
for (let bits = 8; bits <= 256; bits += 8) {
  for (const signed of [false, true]) {
    test(`${signed ? 'int' : 'uint'}${bits} checks both exact boundaries`, () => {
      const t = `${signed ? 'int' : 'uint'}${bits}`;
      const limit = 1n << BigInt(signed ? bits - 1 : bits); const low = signed ? -limit : 0n;
      for (const value of [low, limit - 1n]) assert.doesNotThrow(() => reviewTypedData(scalar(t, value.toString())));
      for (const value of [low - 1n, limit]) assert.throws(() => reviewTypedData(scalar(t, value.toString())));
    });
  }
}
for (const [type, good, bad] of [
  ['bool', true, 'true'], ['address', wallet, '0x123'], ['bytes', '0xabcd', '0xabc'],
  ['bytes1', '0xab', '0xabcd'], ['bytes32', '0x' + 'ab'.repeat(32), '0x'],
  ['string', 'hello 😄', 42], ['uint8[]', ['0', 255], ['256']],
  ['uint8[2][]', [[1, 2], [3, 4]], [[1]]], ['int8', '-128', '-129']
] as const) test(`strict value validation for ${type}`, () => {
  assert.doesNotThrow(() => reviewTypedData(scalar(type, good)));
  assert.throws(() => reviewTypedData(scalar(type, bad)));
});
for (const type of ['uint', 'int', 'uint7', 'uint264', 'bytes0', 'bytes33', 'float', 'fixed128x18', 'Unknown', 'uint8[0]', 'uint8[129]', 'uint8[01]', 'uint8[][][][]']) {
  test(`unsupported type fails closed: ${type}`, () => assert.throws(() => reviewTypedData(scalar(type, '1'))));
}
for (const value of ['01', '-0', '+1', '1.0', '1e2', '0x00', '-0x1', 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -0, 1n, null, true, {}, []]) {
  test(`integer coercion is rejected: ${String(value)}`, () => assert.throws(() => reviewTypedData(scalar('uint256', value))));
}
test('hex integer input and safe integers are accepted within width', () => {
  assert.doesNotThrow(() => reviewTypedData(scalar('uint8', '0xff')));
  assert.doesNotThrow(() => reviewTypedData(scalar('uint8', 255)));
});
test('all schemas including unused declarations and nested values are inspected', () => {
  const a = fixtureTyped(); a.types.Asset[1]!.type = 'Missing'; assert.throws(() => reviewTypedData(a));
  const b = fixtureTyped(); b.message.sell.amount = 'oops'; assert.throws(() => reviewTypedData(b));
  const c = fixtureTyped(); Object.assign(c.types, { Hidden: [{ name: 'bad', type: 'Missing' }] }); assert.throws(() => reviewTypedData(c));
  const d = fixtureTyped(); Object.assign(d.message.sell, { hidden: 'extra' }); assert.throws(() => reviewTypedData(d));
  const e = fixtureTyped(); Object.assign(e.types, { Hidden: [{ name: 'next', type: 'Hidden[]' }] }); assert.throws(() => reviewTypedData(e));
  const f = fixtureTyped(); f.types.Order.push({ name: 'sell', type: 'Asset' }); assert.throws(() => reviewTypedData(f));
});
test('domain must match BSC and its exact declared standard fields', () => {
  for (const domain of [{ chainId: 1, verifyingContract: token }, { chainId: 56 },
    { chainId: 56, verifyingContract: '0x' + '0'.repeat(40) }, { chainId: 56, verifyingContract: token, unknown: true }]) {
    assert.throws(() => reviewTypedData({ ...fixtureTyped(), domain }));
  }
  const a = fixtureTyped(); a.types.EIP712Domain[0]!.type = 'uint8'; assert.throws(() => reviewTypedData(a));
  const b = fixtureTyped(); b.types.EIP712Domain.pop(); assert.throws(() => reviewTypedData(b));
  const c = fixtureTyped(); Object.assign(c.domain, { name: 'undeclared' }); assert.throws(() => reviewTypedData(c));
  assert.doesNotThrow(() => reviewTypedData({ ...scalar('bool', false), domain: { chainId: '0x38', verifyingContract: token } }));
});
test('strict JSON rejects duplicate escaped keys before information loss', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"nested":{"a":1,"a":2}}',
    '{"__proto__":{}}', '{"x":"\\ud800"}', '{} extra', '[1,]', '{"a":1,}', '{"a":9007199254740993}', '1e999',
    '100.000000000000000000001', '1e-999', '1e2']) assert.throws(() => parseRfqJSON(text));
  const text = JSON.stringify(fixtureTyped()).replace('"chainId":56', '"chainId":1,"chainId":56');
  assert.throws(() => reviewTypedData(text));
  assert.deepEqual(parseRfqJSON('[true,false,null,-3,1.5,"ok"]'), [true, false, null, -3, 1.5, 'ok']);
});
test('object snapshots reject accessors without invoking them', () => {
  let invoked = 0; const typed = fixtureTyped();
  Object.defineProperty(typed.message.sell, 'amount', { get() { invoked++; return '100'; } });
  assert.throws(() => reviewTypedData(typed)); assert.equal(invoked, 0);
  const build = fixtureBuild(); Object.defineProperty(build.rfq, 'vendor', { get() { invoked++; return 'PcsXRfq'; } });
  assert.throws(() => inspectRfq(build)); assert.equal(invoked, 0);
});
test('objects, cycles, sparse arrays and hidden properties cannot become JSON', () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const hidden = {}; Object.defineProperty(hidden, 'secret', { value: true });
  for (const v of [cycle, new Date(), [,,], Object.assign([], { extra: 1 }), hidden, { [Symbol('x')]: 1 }, { toJSON: () => ({}) }]) assert.throws(() => snapshotRfq(v));
});
test('payload, string, array and depth limits fail closed', () => {
  assert.throws(() => parseRfqJSON(' '.repeat(131073)));
  assert.throws(() => reviewTypedData(scalar('string', 'x'.repeat(32769))));
  assert.throws(() => reviewTypedData(scalar('bool[]', Array(129).fill(true))));
  let nested: unknown = true; for (let i = 0; i < 25; i++) nested = [nested];
  assert.throws(() => snapshotRfq(nested));
  assert.throws(() => parseRfqJSON('['.repeat(25) + '0' + ']'.repeat(25)));
  assert.throws(() => reviewTypedData({ ...fixtureTyped(), secret: 'extra' }));
});
test('all declared schema and aggregate limits apply before accepting values', () => {
  const fields = Array.from({ length: 65 }, (_, i) => ({ name: 'f' + i, type: 'bool' }));
  assert.throws(() => reviewTypedData({ ...scalar('bool', true), types: { Order: fields } }));
  const many: Record<string, unknown> = { Order: [{ name: 'value', type: 'bool' }] };
  for (let i = 0; i < 32; i++) many['T' + i] = [{ name: 'value', type: 'bool' }];
  assert.throws(() => reviewTypedData({ ...scalar('bool', true), types: many }));
});
test('mismatched unsigned build does not pass route review', () => {
  const patches = [{ binanceChainId: '1' }, { fromTokenAmount: '101' }, { toTokenAmount: '1' }, { vendorName: 'CowSwap' },
    { fromToken: { tokenContractAddress: wallet } }, { toToken: { tokenContractAddress: token } }];
  for (const patch of patches) {
    const build = fixtureBuild(); Object.assign(build.routerResult, patch);
    assert.throws(() => reviewRfqBuild(build, fixtureQuote(), config), e => safeError(e).validationCheck === 'RFQ_BUILD_BINDING');
  }
  const build = fixtureBuild(); build.tx.from = token;
  assert.throws(() => reviewRfqBuild(build, fixtureQuote(), config));
  assert.throws(() => reviewRfqBuild({ ...fixtureBuild(), routerResult: undefined }, fixtureQuote(), config));
  assert.throws(() => reviewRfqBuild(fixtureBuild(), { ...fixtureQuote(), vendorName: 'CowSwap' }, config));
});
test('vendor and signing scheme reject object coercion and unexpected protocols', () => {
  for (const patch of [{ vendor: ['PcsXRfq'] }, { signingScheme: 'PERSONAL_SIGN' }, { txType: 'TRANSACTION' }]) {
    assert.throws(() => inspectRfq({ ...fixtureBuild(), rfq: { ...fixtureBuild().rfq, ...patch } }));
  }
});
test('schema validation deliberately does not authenticate signed economic terms', () => {
  const build = fixtureBuild(); build.rfq.typedDataToSign.message.sell.amount = '999';
  const result = reviewRfqBuild(build, fixtureQuote(), config);
  assert.equal(result.signatureSemantics, 'UNVERIFIED'); assert.equal(result.executionEnabled, false);
});
test('local RFQ reports are safely projected and legacy reports require a rerun', () => {
  const base = { runId: '00000000-0000-4000-8000-000000000001', startedAt: new Date().toISOString(),
    status: 'passed', mode: 'TEST_FIXTURE', executionEnabled: false,
    checks: ['authenticated_bsc_aggregator', 'supported_bsc_stock_identity', 'market_status_read',
      'wallet_balance_covers_input', 'matching_stock_to_usdt_rfq', 'inspectable_bsc_eip712_structure'] };
  const review = reviewRfqBuild(fixtureBuild(), fixtureQuote(), config);
  assert.equal(inspectEvidence(base, 'smoke').nextStep, 'RERUN_CURRENT_READ_ONLY_RFQ_REVIEW');
  const summary = inspectEvidence({ ...base, rfqReview: { ...review, privateKey: 'never-print' } }, 'smoke');
  assert.equal(summary.liveGate, 'UNVERIFIED'); assert.equal(JSON.stringify(summary).includes('never-print'), false);
  for (const patch of [{ executionEnabled: true }, { signatureSemantics: 'VERIFIED' }, { artifactChecksum: 'secret' },
    { fieldCount: 257 }, { typeCount: 0 }, { domainTypeDeclared: 'true' }, { profile: 'unknown' }]) {
    assert.throws(() => inspectEvidence({ ...base, rfqReview: { ...review, ...patch } }, 'smoke'));
  }
});
