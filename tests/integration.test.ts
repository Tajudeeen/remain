import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createRehearsalServer, type RehearsalServerOptions } from '../src/rehearsal/server.ts';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
import { inspectionInput, readinessStatus, inspectionChecks, projectInspection } from '../src/integration/readiness.ts';
import { localInspector } from '../src/integration/local.ts';
import { RemainError } from '../src/errors.ts';
import { runFeasibility, type SmokeReport } from '../src/feasibility.ts';
import { validateInspection, validateReadiness } from '../web/live.js';
import { reviewRfqBuild } from '../src/rfq/review.ts';
import { fixtureQuote, fixtureBuild, config } from './fixtures/rfq.ts';

const wallet = '0x' + '1'.repeat(40), token = '0x' + '2'.repeat(40);
const input = { wallet, token, amountRaw: '1' };
const origin = 'https://remain-fixture.netlify.app';
const blocked = (): SmokeReport => ({ runId: 'fixture', startedAt: new Date().toISOString(), mode: 'TEST_FIXTURE', status: 'blocked', executionEnabled: false,
  checks: inspectionChecks.slice(0, 3), observations: [], notes: [], error: { code: 'INSUFFICIENT_POSITION', message: 'private-response-never-reflect' } });
async function withServer(run: (url: string) => Promise<void>, options: RehearsalServerOptions = {}) {
  const server = createRehearsalServer(options); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
  try { await run(`http://127.0.0.1:${addr.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
function post(url: string, body = JSON.stringify(input), extra: Record<string, string> = {}) {
  return fetch(url + '/api/live/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url, ...extra }, body });
}
test('local setup is opt-in and incomplete credentials fail before serving', () => {
  assert.equal(localInspector({}), undefined); assert.equal(localInspector({ REMAIN_LOCAL_READ_ONLY: 'false' }), undefined);
  assert.throws(() => localInspector({ REMAIN_LOCAL_READ_ONLY: 'true' }), (e: unknown) => e instanceof RemainError && e.code === 'CONFIG_MISSING');
  assert.equal(typeof localInspector({ REMAIN_LOCAL_READ_ONLY: 'true', BINANCE_WEB3_API_KEY: 'test-placeholder', BINANCE_WEB3_SECRET_KEY: 'test-placeholder' }), 'function');
});
test('inspection input rejects coercion, hidden fields, zero addresses and out-of-range amounts', () => {
  assert.deepEqual(inspectionInput(input), input); let invoked = 0;
  const accessor = { ...input }; Object.defineProperty(accessor, 'wallet', { enumerable: true, get() { invoked++; return wallet; } });
  for (const value of [accessor, null, [], { ...input, extra: 1 }, { ...input, wallet: '0x' + '0'.repeat(40) }, { ...input, token: ['0x' + '2'.repeat(40)] },
    ...['0', '01', '-1', '1.2', '1e18', (1n << 256n).toString(), '9'.repeat(79)].map(amountRaw => ({ ...input, amountRaw }))]) assert.throws(() => inspectionInput(value));
  assert.equal(invoked, 0); assert.ok(Object.isFrozen(inspectionInput(input)));
});
test('report projection redacts provider text and preserves the fixture boundary', () => {
  const result = projectInspection(blocked()); validateInspection(result);
  assert.equal(result.mode, 'TEST_FIXTURE'); assert.equal(result.executionEnabled, false); assert.equal(result.liveGate, 'UNVERIFIED');
  assert.equal(result.errorCode, 'INSUFFICIENT_POSITION'); assert.equal(JSON.stringify(result).includes('private-response'), false);
});
test('a complete fixture structure pass preserves every unverified gate', () => {
  const report = blocked(); report.status = 'passed'; report.checks = [...inspectionChecks]; delete report.error;
  report.rfqReview = reviewRfqBuild(fixtureBuild(), fixtureQuote(), config);
  const result = projectInspection(report); validateInspection(result);
  assert.equal(result.status, 'INSPECTED'); assert.equal(result.mode, 'TEST_FIXTURE'); assert.equal(result.executionEnabled, false);
  assert.equal(result.signatureSemantics, 'UNVERIFIED'); assert.equal(result.ownership, 'NOT_AUTHENTICATED');
  for (const patch of [{ profile: 'UNKNOWN' }, { unsignedBuild: 'UNKNOWN' }, { executionEnabled: true }]) assert.throws(() => projectInspection({ ...report, rfqReview: { ...report.rfqReview, ...patch } } as SmokeReport));
});
test('hidden report accessors are rejected before reading their values', () => {
  let invoked = 0; const report = blocked(); Object.defineProperty(report, 'mode', { enumerable: false, get() { invoked++; return 'LIVE_READ_ONLY'; } });
  assert.throws(() => projectInspection(report));
  const nested = blocked(); Object.defineProperty(nested.error!, 'code', { enumerable: false, get() { invoked++; return 'INSUFFICIENT_POSITION'; } });
  assert.throws(() => projectInspection(nested)); assert.equal(invoked, 0);
});
test('projection rejects forged readiness, out-of-order checks and getters without invoking them', () => {
  let invoked = 0; const accessor = blocked(); Object.defineProperty(accessor, 'mode', { enumerable: true, get() { invoked++; return 'LIVE_READ_ONLY'; } });
  for (const value of [accessor, { ...blocked(), mode: 'LIVE' }, { ...blocked(), executionEnabled: true }, { ...blocked(), checks: [...inspectionChecks].reverse() },
    { ...blocked(), status: 'passed', checks: [...inspectionChecks] }]) assert.throws(() => projectInspection(value as SmokeReport));
  assert.equal(invoked, 0);
});
for (const available of [false, true]) test(`browser readiness contract ${available} cannot promote execution`, () => {
  const result = readinessStatus(available); validateReadiness(result);
  for (const patch of [{ executionEnabled: true }, { liveGate: 'READY' }, { signatureSemantics: 'VERIFIED' }, { inspectionAvailable: 1 }, { deployment: 'HOSTED' }, { extra: 'x' }]) assert.throws(() => validateReadiness({ ...result, ...patch }));
});
test('browser inspection rejects partial passes and unchecked claims', () => {
  const result = projectInspection(blocked());
  for (const patch of [{ executionEnabled: true }, { ownership: 'AUTHENTICATED' }, { status: 'INSPECTED', errorCode: null }, { checks: [inspectionChecks[1]] }, { errorCode: 'PROVIDER_SECRET' }, { mode: 'LIVE' }, { extra: 1 }]) assert.throws(() => validateInspection({ ...result, ...patch }));
});
test('hosted status stays unconfigured and the inspect endpoint cannot run a Binance read', async () => {
  const result = await handleNetlifyFixture(new Request(origin + '/api/live/status'), { origins: [origin] });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), readinessStatus(false));
  const rejected = await handleNetlifyFixture(new Request(origin + '/api/live/inspect', { method: 'POST', body: JSON.stringify(input) }), { origins: [origin] });
  assert.equal(rejected.status, 503); assert.deepEqual(await rejected.json(), { code: 'LOCAL_SETUP_REQUIRED' });
  for (const path of ['/api/live/status?key=ignored', '/api/live/inspect?key=ignored']) assert.equal((await handleNetlifyFixture(new Request(origin + path), { origins: [origin] })).status, 404);
});
test('unconfigured local adapter never examines or forwards supplied input', async () => withServer(async url => {
  assert.deepEqual(await (await fetch(url + '/api/live/status')).json(), readinessStatus(false));
  const result = await post(url); assert.equal(result.status, 503); assert.deepEqual(await result.json(), { code: 'LOCAL_SETUP_REQUIRED' });
}));
test('loopback inspection invokes one read callback and returns only a redacted report', async () => {
  let calls = 0;
  await withServer(async url => {
    assert.deepEqual(await (await fetch(url + '/api/live/status')).json(), readinessStatus(true));
    const result = await post(url); assert.equal(result.status, 200); const body = await result.json(); validateInspection(body);
    assert.equal(JSON.stringify(body).includes(wallet), false); assert.equal(JSON.stringify(body).includes('private-response'), false);
    assert.equal(body.status, 'BLOCKED'); assert.equal(body.mode, 'TEST_FIXTURE');
  }, { inspector: async (selected, signal) => { calls++; assert.deepEqual(selected, input); assert.equal(signal.aborted, false); return blocked(); } });
  assert.equal(calls, 1);
});
test('cross-origin, absent-origin and unexpected host requests cannot reach inspection', async () => {
  let calls = 0;
  await withServer(async url => {
    for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }, { Origin: url, 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await post(url, JSON.stringify(input), headers)).status, 403, JSON.stringify(headers));
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(url + '/api/live/inspect', { method: 'POST', headers: { Host: 'configured.example', Origin: url, 'Content-Type': 'application/json' } }, res => {
        res.resume(); res.on('end', () => { try { assert.equal(res.statusCode, 403); resolve(); } catch (e) { reject(e); } });
      }); req.on('error', reject); req.end(JSON.stringify(input));
    });
  }, { allowedHosts: ['configured.example'], inspector: async () => { calls++; return blocked(); } });
  assert.equal(calls, 0);
});
test('duplicate and oversized bodies never reach the read callback', async () => {
  let calls = 0;
  await withServer(async url => {
    assert.equal((await post(url, JSON.stringify(input).replace('"amountRaw":"1"', '"amountRaw":"2","amountRaw":"1"'))).status, 400);
    assert.equal((await post(url, JSON.stringify({ ...input, amountRaw: '0' }))).status, 400);
    assert.equal((await post(url, 'x'.repeat(4097))).status, 413);
  }, { inspector: async () => { calls++; return blocked(); } }); assert.equal(calls, 0);
});
test('a noncooperating inspector times out and releases its HTTP slot', async () => {
  let calls = 0; let abandoned: AbortSignal | undefined;
  await withServer(async url => {
    const result = await post(url); assert.equal(result.status, 408); assert.deepEqual(await result.json(), { code: 'REQUEST_CANCELLED' });
    assert.equal(abandoned?.aborted, true);
    const next = await post(url); assert.equal(next.status, 200);
  }, { inspectionTimeoutMs: 30, inspector: async (_input, signal) => { abandoned = signal; if (++calls === 1) return new Promise(() => {}); return blocked(); } });
});
test('public binding cannot activate a supplied inspector even for loopback clients', async () => {
  let calls = 0; const server = createRehearsalServer({ inspector: async () => { calls++; return blocked(); } });
  await new Promise<void>(resolve => server.listen(0, '0.0.0.0', resolve)); const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
  try { const url = `http://127.0.0.1:${addr.port}`; assert.deepEqual(await (await fetch(url + '/api/live/status')).json(), readinessStatus(false)); assert.equal((await post(url)).status, 503); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  assert.equal(calls, 0);
});
test('cancelled feasibility cannot start a protected request', async () => {
  let calls = 0; const signal = AbortSignal.abort();
  const result = await runFeasibility({ BINANCE_WEB3_API_KEY: 'test-placeholder', BINANCE_WEB3_SECRET_KEY: 'test-placeholder', REMAIN_WALLET_ADDRESS: wallet, REMAIN_RWA_TOKEN_ADDRESS: token, REMAIN_SELL_AMOUNT_RAW: '1' }, { get: async () => { calls++; throw new Error(); } }, signal);
  assert.equal(result.error?.code, 'REQUEST_CANCELLED'); assert.equal(calls, 0);
});
test('invalid inspection timeout fails closed', () => { for (const value of [0, -1, 20001, NaN, 0.5]) assert.throws(() => createRehearsalServer({ inspectionTimeoutMs: value })); });
