import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { hashTypedData } from 'viem';
import { createRehearsalServer, type RehearsalServerOptions } from '../../src/rehearsal/server.ts';
import { ExecutionEngine } from '../../src/execution/engine.ts';
import { ExecutionHttp } from '../../src/execution/http.ts';
import { ExecutionStore } from '../../src/execution/store.ts';
import { parseReceiptJSON } from '../../src/receipts/canonical.ts';
import { dataRecord } from '../../src/input/data.ts';
import { executionFixture, txHash } from '../fixtures/execution.ts';

// Isolated synthetic harness. Every wallet/API/RPC is controlled here. The
// generated unfunded key stays in this process. Nothing connects to Binance,
// a real wallet or a chain. LIVE_EXECUTION wire labels exercise production
// browser validation only, never establish a live integration pass.
const exec = promisify(execFile), session = 'remain-execution-fixture-' + randomUUID().slice(0, 8);
const folder = await mkdtemp(join(tmpdir(), 'remain-browser-execution-'));
const f = executionFixture(Date.now()), store = new ExecutionStore(join(folder, 'orders.sqlite'), randomBytes(32).toString('hex'));
let submissions = 0, signingPrompts = 0;
const reader = { async get(endpoint: string, query: import('../../src/signing.ts').Query = []) {
  const amount = new Map(query).get('amount') ?? '25', result = await f.reader.get(endpoint, query);
  const route = { ...f.quote, quoteId: 'fixture-cache-' + amount, fromTokenAmount: amount, toTokenAmount: (BigInt(amount) * 10n ** 18n).toString() };
  if (endpoint.endsWith('/quote')) result.data = [route];
  if (endpoint.endsWith('/swap')) result.data = { executionMode: 'RFQ', routerResult: route, tx: { from: f.wallet },
    rfq: { vendor: 'CowSwap', orderId: 'fixture-order', signingScheme: 'EIP712', typedDataToSign: { ...f.typed,
      message: { ...f.typed.message, sellAmount: (BigInt(amount) - 1n).toString(), buyAmount: route.toTokenAmount, validTo: Math.floor(Date.now() / 1000) + 600 } } } };
  return { ...result, timestamp: Date.now() };
} };
const rpc = { async call(method: string, params: unknown[]) {
  const value = await f.rpc.call(method, params);
  if (method === 'eth_getBlockByNumber') return { ...dataRecord(value), timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16) };
  return value;
} };
const engine = new ExecutionEngine({ reader, rpcs: [rpc, rpc], store, pins: f.pins, maximumStockFeeRaw: '1', mode: 'LIVE_EXECUTION',
  vendor: { async submit() { submissions++; return { orderId: 'fixture-platform-id', status: 'PENDING_VENDOR', txHash: null }; },
    async status() { return { orderId: 'fixture-platform-id', status: f.flags.settled ? 'FILLED' : 'PENDING_VENDOR', txHash: f.flags.settled ? txHash : null }; } } });
const options: RehearsalServerOptions & { execution?: ExecutionHttp } = {};
const server = createRehearsalServer(options);
// The synthetic signer exists only in this test harness, never application code.
const application = server.listeners('request')[0] as (req: IncomingMessage, res: ServerResponse) => void;
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url !== '/__test_fixture_sign') { application(req, res); return; }
  void (async () => {
    try {
      if (req.method !== 'POST' || req.headers.origin !== options.execution?.origin) throw new Error();
      let text = ''; for await (const chunk of req) { text += String(chunk); if (Buffer.byteLength(text) > 16384) throw new Error(); }
      const typed = dataRecord(parseReceiptJSON(text)), domain = dataRecord(typed.domain), message = dataRecord(typed.message);
      if (!['Session', 'Order'].includes(String(typed.primaryType)) || domain.chainId !== 56 ||
          typed.primaryType === 'Order' && (message.receiver !== f.wallet || message.sellToken !== f.input.intent.token)) throw new Error();
      if (typed.primaryType === 'Order') signingPrompts++;
      const signature = await f.account.signTypedData(typed as Parameters<typeof hashTypedData>[0]);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ signature }));
    } catch { res.writeHead(400); res.end('{}'); }
  })();
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const bound = server.address(); assert.ok(bound && typeof bound !== 'string');
const origin = 'http://127.0.0.1:' + bound.port; options.execution = new ExecutionHttp(engine, origin);
async function browser(...args: string[]) {
  const { stdout } = await exec('agent-browser', ['--session', session, '--json', ...args], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const result = JSON.parse(stdout); if (!result.success) throw new Error('FIXTURE_BROWSER_COMMAND_FAILED'); return result.data;
}
async function check(expression: string) { await browser('eval', `(() => {if (!(${expression})) throw new Error('FIXTURE_BROWSER_INVARIANT'); return true;})()`); }
let stage = 'login';
try {
  await browser('open', origin + '/#trade');
  await browser('wait', '--fn', "document.querySelector('#trade-server').textContent === 'Execution backend configured'");
  await browser('eval', `window.fixtureCalls=[];window.fixtureListeners={};window.ethereum={request:async q=>{window.fixtureCalls.push(q.method);if(['eth_accounts','eth_requestAccounts'].includes(q.method))return [${JSON.stringify(f.wallet)}];if(q.method==='eth_chainId')return '0x38';if(q.method==='eth_signTypedData_v4'){const r=await fetch('/__test_fixture_sign',{method:'POST',headers:{'Content-Type':'application/json'},body:q.params[1]});if(!r.ok)throw new Error('FIXTURE_SIGNATURE_BLOCKED');return (await r.json()).signature;}throw new Error('FIXTURE_WALLET_METHOD_BLOCKED');},on:(e,h)=>window.fixtureListeners[e]=h,removeListener:e=>delete window.fixtureListeners[e]};const label=document.createElement('p');label.textContent='TEST_FIXTURE: synthetic wallet, vendor and RPC. No funded sale or live proof.';document.querySelector('#trade-view').prepend(label);`);
  await browser('click', '#trade-login'); await browser('wait', '--fn', "!document.querySelector('#trade-preview').disabled");
  stage = 'cash composer';
  await browser('fill', '#trade-stock', f.input.intent.token); await browser('fill', '#trade-target', '25'); await browser('fill', '#trade-retain', '70');
  await browser('click', '#trade-preview'); await browser('wait', '--fn', "!document.querySelector('#trade-prepare').disabled");
  stage = 'exact sale preparation';
  await browser('click', '#trade-prepare'); await browser('wait', '--fn', "!document.querySelector('#trade-sign').disabled");
  await check("document.querySelector('#trade-debit').textContent.includes('25') && document.querySelector('#trade-cash').textContent.includes('25')");
  stage = 'sign and submit separately';
  await browser('click', '#trade-sign'); await browser('wait', '--fn', "!document.querySelector('#trade-submit').disabled");
  assert.equal(signingPrompts, 1); assert.equal(submissions, 0);
  await browser('click', '#trade-submit'); await browser('wait', '--fn', "document.querySelector('#trade-state').textContent.includes('PENDING')");
  assert.equal(submissions, 1);
  f.flags.settled = true;
  // The UID remains inside this process and is not printed or persisted outside
  // the temporary encrypted journal.
  const rows = await browser('eval', "document.querySelector('#trade-order-id').textContent");
  const id = typeof rows === 'string' ? rows : rows.result;
  f.flags.orderUid = store.get(id, f.wallet).auth.orderUid;
  stage = 'settlement and reorg withdrawal';
  await browser('click', '#trade-poll'); await browser('wait', '--fn', "document.querySelector('#trade-state').textContent.includes('FILLED')");
  await browser('click', '#trade-poll'); await browser('wait', '--fn', "document.querySelector('#trade-state').textContent.includes('RECONCILED')");
  await check("!document.querySelector('#trade-settled-facts').hidden && document.querySelector('#trade-actual-cash').textContent.includes('25') && document.querySelector('#trade-actual-stock').textContent.includes('75')");
  await mkdir('evidence', { recursive: true }); await browser('screenshot', 'evidence/rehearsal-execution-fixture.png', '--full');
  f.flags.reorg = true;
  await browser('click', '#trade-poll'); await browser('wait', '--fn', "!document.querySelector('#trade-poll').disabled");
  await check("document.querySelector('#trade-settled-facts').hidden && document.querySelector('#trade-actual-cash').textContent === ''");
  stage = 'account change';
  await browser('eval', "window.fixtureListeners.accountsChanged()");
  await check("document.querySelector('#trade-result').hidden && document.querySelector('#trade-submit').disabled");
  assert.equal(submissions, 1); assert.equal(signingPrompts, 1);
  console.log('TEST_FIXTURE browser execution passed: authenticated cash composer, exact review, separate signing and one submission, reconciled display, reorg withdrawal and account-change clearing. No live provider or funded wallet was used.');
} catch {
  console.error('TEST_FIXTURE browser execution failed at ' + stage + '. No signing material or wallet state is printed.');
  try {
    console.error(JSON.stringify(await browser('eval', "({fixedCode:document.querySelector('#trade-message').textContent.match(/^[A-Z_]+/)?.[0]??'NO_FIXED_CODE',previewDisabled:document.querySelector('#trade-preview').disabled,prepareDisabled:document.querySelector('#trade-prepare').disabled,signDisabled:document.querySelector('#trade-sign').disabled,submitDisabled:document.querySelector('#trade-submit').disabled})")));
  } catch { console.error('FIXTURE_BROWSER_DIAGNOSTICS_UNAVAILABLE'); }
  throw new Error('FIXTURE_EXECUTION_BROWSER_FAILED');
} finally {
  try { await browser('close'); } catch { /* Fixed failure only, no browser data. */ }
  await new Promise<void>(resolve => server.close(() => resolve())); store.close(); await rm(folder, { recursive: true, force: true });
}
