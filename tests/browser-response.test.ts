import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFixtureJSON, readFixtureText, readFixtureJSON, validateReceiptReport, validatePlanningRecord } from '../web/response.js';
import { parseReceiptJSON } from '../src/receipts/canonical.ts';
import { inspectFixtureReceipt } from '../src/receipts/inspection.ts';
import { rehearsePlan, type RehearsalInput } from '../src/rehearsal/plan.ts';

const valid: RehearsalInput = { cashTarget: '25', retainPercent: 70, maxImpactPercent: '0.50', market: 'regular', allowClosedMarket: false };
const sample = readFileSync('web/demo-receipt.json', 'utf8');
const signal = () => new AbortController().signal;
const json = (body: string, headers: Record<string, string> = {}) => new Response(body, { headers: { 'content-type': 'application/json', ...headers } });
const fixed = { message: 'Unexpected fixture response. Please retry.' };
const malformed = [
  '{"status":"PRIVATE_SENTINEL","status":"CONSISTENT_FIXTURE"}',
  '{"status":0,"sta\\u0074us":1}', '{"constructor":1}', '{"__proto__":{}}',
  '{', '[1,]', '{"a":1,}', '"unterminated', '[0', '[0,', '01', '-0', '1.0', '1e0', '9007199254740992', 'null true',
  '"\\ud800"', '"\\udc00"', '['.repeat(26) + '0' + ']'.repeat(26),
  '[' + Array(513).fill(0).join(',') + ']',
  '{' + Array.from({ length: 257 }, (_, i) => `"k${i}":0`).join(',') + '}',
  ' '.repeat(262145)
];
for (const [index, text] of malformed.entries()) test(`browser receiver rejects ambiguous or unbounded JSON ${index}`, () => {
  assert.throws(() => parseFixtureJSON(text), fixed);
});
test('browser receiver agrees with the receipt profile on valid nested Unicode and fixture data', () => {
  for (const text of [sample, JSON.stringify(inspectFixtureReceipt(sample)), ' {"a":[null,true,false,0,"😀","a\\\"b",{"z":"\\\\"}]} \n']) {
    assert.deepEqual(parseFixtureJSON(text), parseReceiptJSON(text));
  }
});
test('transport reads chunked JSON with multibyte UTF-8 split across boundaries', async () => {
  const body = new TextEncoder().encode('{"message":"😀"}');
  const stream = new ReadableStream<Uint8Array>({ start(c) { for (const byte of body) c.enqueue(new Uint8Array([byte])); c.close(); } });
  const response = new Response(stream, { headers: { 'content-type': 'application/json; charset=utf-8' } });
  assert.deepEqual(await readFixtureJSON(response, signal()), parseFixtureJSON('{"message":"😀"}'));
  assert.equal(response.body!.locked, false);
});
test('transport enforces actual size even when a declared length is missing or understated', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(262145)); }, cancel() { cancelled = true; return new Promise<void>(() => {}); } });
    const r = new Response(stream, { headers: { 'content-type': 'application/json', ...headers } });
    await assert.rejects(readFixtureText(r, signal()), fixed);
    assert.equal(cancelled, true); assert.equal(r.body!.locked, false);
  }
});
test('transport aborts a stalled reader, cancels without awaiting its hook, and releases its lock', async () => {
  let cancelled = false;
  const r = new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise<void>(() => {}); } }), { headers: { 'content-type': 'application/json' } });
  const controller = new AbortController(); const pending = readFixtureJSON(r, controller.signal);
  controller.abort(new Error('PRIVATE_SENTINEL'));
  await assert.rejects(pending, fixed); assert.equal(cancelled, true); assert.equal(r.body!.locked, false);
});
test('transport rejects pre-abort and never reads a source', async () => {
  const controller = new AbortController(); controller.abort(); let reads = 0;
  const r = json('{}'); const body = r.body!; const original = body.getReader.bind(body);
  body.getReader = (() => { reads++; return original(); }) as typeof body.getReader;
  await assert.rejects(readFixtureJSON(r, controller.signal), fixed); assert.equal(reads, 0);
});
const invalidHeaders = [{ 'content-type': 'text/html' }, { 'content-type': 'application/json; charset=latin1' },
  { 'content-length': '262145' }, { 'content-length': '-1' }, { 'content-length': '1e3' }, { 'content-length': '00' }];
for (const [index, headers] of invalidHeaders.entries()) test(`transport rejects invalid media or length metadata ${index}`, async () => {
  await assert.rejects(readFixtureJSON(json('{}', headers), signal()), fixed);
});
test('transport rejects redirects, missing bodies, invalid bytes and stream failures with fixed errors', async () => {
  const redirected = json('{}'); Object.defineProperty(redirected, 'redirected', { value: true });
  const responses = [redirected, new Response(null, { headers: { 'content-type': 'application/json' } }),
    new Response('{}', { status: 503 }), new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }),
    new Response(new ReadableStream({ start(c) { c.error(new Error('PRIVATE_SENTINEL')); } }), { headers: { 'content-type': 'application/json' } })];
  for (const r of responses) await assert.rejects(readFixtureJSON(r, signal()), fixed);
});
test('receipt display contract accepts actual matched, unreconciled and rejected fixture reports', () => {
  assert.equal(validateReceiptReport(inspectFixtureReceipt(sample)).status, 'CONSISTENT_FIXTURE');
  assert.equal(validateReceiptReport(inspectFixtureReceipt('{')).status, 'INVALID_RECEIPT');
  const r = structuredClone(inspectFixtureReceipt(sample));
  r.facts = { eventCount: 0, providerStatus: null, settlementStatus: 'NOT_RECONCILED', stockRemainingRaw: null, netCashReceivedRaw: null };
  assert.equal(validateReceiptReport(r).facts!.settlementStatus, 'NOT_RECONCILED');
});
test('receipt display contract never executes accessor properties or accepts false rejected facts', () => {
  let invoked = false; const r = structuredClone(inspectFixtureReceipt(sample));
  Object.defineProperty(r, 'status', { get() { invoked = true; return 'CONSISTENT_FIXTURE'; }, enumerable: true });
  assert.throws(() => validateReceiptReport(r), fixed); assert.equal(invoked, false);
  const rejected = inspectFixtureReceipt('{');
  assert.throws(() => validateReceiptReport({ ...rejected, facts: {} }), fixed);
  assert.throws(() => validateReceiptReport({ ...rejected, reasons: [] }), fixed);
  assert.throws(() => validateReceiptReport({ ...rejected, executionEnabled: true }), fixed);
});
test('planner display contract accepts actual solver outcomes and fractional targets', async () => {
  for (const patch of [{}, { cashTarget: '25.01' }, { cashTarget: '40' }, { retainPercent: 100 },
    { market: 'closed' as const }, { market: 'closed' as const, allowClosedMarket: true }, { market: 'pause' as const }, { maxImpactPercent: '0.19' }]) {
    const input = { ...valid, ...patch }; const r = await rehearsePlan(input);
    assert.equal(validatePlanningRecord(parseFixtureJSON(JSON.stringify(r)), input).plan.status, r.plan.status);
  }
});
test('planner display contract rejects altered amounts, stale intent, mode, freshness and trace metadata', async () => {
  const report = await rehearsePlan(valid);
  const mutations: ((r: typeof report) => void)[] = [
    r => { r.plan.intent.cashTargetRaw = '1'; }, r => { r.plan.intent.retainBps = 0; },
    r => { r.plan.intent.maxImpactBps = 500; }, r => { r.plan.intent.allowClosedMarket = true; },
    r => { r.plan.intent.market.openState = false; }, r => { Object.defineProperty(r, 'reviewUntilMs', { value: r.reviewUntilMs + 1 }); },
    r => { r.plan.candidate!.verdict.amounts!.remainingStockRaw = '76'; },
    r => { r.plan.candidate!.verdict.amounts!.minimumNetCashRaw = '26000000000000000000'; },
    r => { r.plan.candidate!.verdict.amounts!.retainedFloorRaw = '69'; },
    r => { r.plan.candidate!.quote.inputFeeRaw = '1'; }, r => { r.plan.candidate!.quote.impactBps = 0; },
    r => { r.plan.reasons = ['PRIVATE_SENTINEL']; }, r => { r.plan.planHash = 'PRIVATE_SENTINEL'; },
    r => { r.plan.attempts = Array(65).fill(r.plan.attempts[0]); },
    r => { r.plan.candidate!.verdict.amounts!.totalStockDebitRaw = '025'; }
  ];
  for (const mutate of mutations) { const r = structuredClone(report); mutate(r); assert.throws(() => validatePlanningRecord(r, valid), fixed); }
  assert.throws(() => validatePlanningRecord({ ...report, executionEnabled: true }, valid), fixed);
  assert.throws(() => validatePlanningRecord(report, { ...valid, cashTarget: '26' }), fixed);
});
