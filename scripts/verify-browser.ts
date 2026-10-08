import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRehearsalServer } from '../src/rehearsal/server.ts';
import { digest, BSC_USDT } from '../src/validation.ts';
import { exploreCashTarget, reviewCashCandidate } from '../src/integration/preview.ts';
import type { PreviewInput } from '../web/preview.js';
import { inspectFixtureReceipt } from '../src/receipts/inspection.ts';
import { inspectionChecks } from '../src/integration/readiness.ts';
import type { SmokeReport } from '../src/feasibility.ts';

// Run through npm run test:web after agent-browser install. Uses a dedicated
// empty browser session, fictional data and an ephemeral loopback-only port.
const exec = promisify(execFile); const session = `remain-${randomUUID().slice(0, 8)}`;
const server = createRehearsalServer();
function browserCashReader(input: PreviewInput) {
  return { async get(endpoint: string, query: import('../src/signing.ts').Query = []) {
    const amount = new Map(query).get('amount') ?? '1';
    const route = { binanceChainId: '56', executionMode: 'RFQ', vendorName: 'PcsXRfq', quoteId: 'browser-fixture-' + amount, fromTokenAmount: amount, toTokenAmount: (BigInt(amount) * 20000n).toString(),
      fromToken: { tokenContractAddress: input.token, decimal: '2', isHoneyPot: false, taxRate: '0' }, toToken: { tokenContractAddress: BSC_USDT, decimal: '6', isHoneyPot: false, taxRate: '0' },
      priceImpactPercent: '-0.01', feeAmount: null, feeToken: null, actualSwapAmount: null };
    // Fictional inspection structure, never a vendor signing profile.
    const typed = { domain: { chainId: 56, verifyingContract: input.token }, primaryType: 'FixtureOrder',
      types: { FixtureOrder: [{ name: 'amount', type: 'uint256' }, { name: 'receiver', type: 'address' }] }, message: { amount, receiver: input.wallet } };
    const data = endpoint.endsWith('/tokens') ? [{ binanceChainId: '56', tokenContractAddress: input.token, tokenSymbol: 'FIXon', underlyingTicker: 'FIX', platformId: 'ondo', assetType: 1, decimals: 2 }] :
      endpoint.includes('/balance/') ? [{ page: 1, pageSize: 100, tokenAssets: [{ binanceChainId: '56', address: input.wallet, tokenContractAddress: input.token, rawBalance: '250', isRiskToken: false }] }] :
      endpoint.endsWith('/underlying-market') ? { binanceChainId: '56', tokenContractAddress: input.token, statusInfo: { marketStatus: 'regular', openState: true, reasonCode: 'TRADING' } } :
      endpoint.endsWith('/swap') ? { executionMode: 'RFQ', routerResult: route, tx: { from: input.wallet }, rfq: { vendor: 'PcsXRfq', signingScheme: 'EIP712', typedDataToSign: typed } } : [route];
    return { data, timestamp: Date.now(), responseHash: 'browser-fixture', latencyMs: 0 };
  } };
}
const inspectionServer = createRehearsalServer({ inspector: async input => {
  const report: SmokeReport = { runId: 'browser-fixture', startedAt: new Date().toISOString(), mode: 'TEST_FIXTURE', status: 'blocked', executionEnabled: false,
    checks: inspectionChecks.slice(0, 3), observations: [], notes: [], error: { code: 'INSUFFICIENT_POSITION', message: 'Fixture only' } };
  if (input.amountRaw === '100') {
    report.status = 'passed'; report.checks = [...inspectionChecks]; delete report.error;
    report.rfqReview = { profile: 'REMAIN_RFQ_REVIEW_V1', structure: 'VALIDATED', unsignedBuild: 'MATCHES_SELECTED_QUOTE', checksumKind: 'SHA256_JSON_NOT_EIP712', artifactChecksum: 'a'.repeat(64), typeCount: 3, fieldCount: 7, domainTypeDeclared: true, signatureSemantics: 'UNVERIFIED', executionEnabled: false };
  }
  return report;
}, positionReader: async input => ({ kind: 'REMAIN_POSITION_READ', mode: 'TEST_FIXTURE', wallet: input.wallet,
  stock: { chain: '56', token: input.token, symbol: 'FIXon', ticker: 'FIX', issuer: 'ondo', decimals: 2 },
  status: input.token.endsWith('3') ? 'ZERO_OBSERVED' : 'HELD_OBSERVED', balanceRaw: input.token.endsWith('3') ? '0' : '250',
  observedAtMs: Date.now(), pagesRead: 1, executionEnabled: false, liveGate: 'UNVERIFIED', ownership: 'NOT_AUTHENTICATED' }),
  cashPreviewer: (input, signal) => exploreCashTarget(input, browserCashReader(input), signal),
  cashReviewer: (input, signal) => reviewCashCandidate(input, browserCashReader(input.intent), signal) });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
await new Promise<void>((resolve) => inspectionServer.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert.ok(address && typeof address === 'object');
const inspectionAddress = inspectionServer.address(); assert.ok(inspectionAddress && typeof inspectionAddress === 'object');
let stage = 'initial load';
async function browser(...args: string[]) {
  const { stdout } = await exec('agent-browser', ['--session', session, '--json', ...args], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const result = JSON.parse(stdout) as { success: boolean; data?: unknown; error?: string };
  if (!result.success) throw new Error(result.error ?? 'Browser command failed');
  return result.data;
}
async function check(expression: string) {
  await browser('eval', `(() => { if (!(${expression})) throw new Error('Browser invariant failed: ${expression.replace(/'/g, '')}'); return 'PASS'; })()`);
}
try {
  await browser('open', `http://127.0.0.1:${address.port}`);
  await browser('wait', '--load', 'networkidle');
  await browser('snapshot', '-i');
  stage = 'landing introduction';
  await mkdir('evidence', { recursive: true });
  await browser('wait', '--fn', "document.querySelector('#splash').hidden");
  await check("!document.querySelector('#landing-view').hidden && document.querySelector('#dashboard-view').hidden && !document.querySelector('#site-content').inert");
  await check("document.querySelector('#launch-planner') && document.querySelector('footer').innerText.includes('Live execution disabled')");
  await browser('screenshot', 'evidence/rehearsal-landing.png', '--full');
  for (const width of [320, 375, 768, 1024, 1440]) {
    await browser('set', 'viewport', String(width), '1000');
    await check('document.documentElement.scrollWidth <= window.innerWidth');
    await browser('screenshot', `evidence/rehearsal-landing-${width}.png`, '--full');
  }
  stage = 'splash skip';
  await browser('eval', "sessionStorage.removeItem('remain-introduced')");
  await browser('open', `http://127.0.0.1:${address.port}`);
  await browser('wait', '--fn', "!document.querySelector('#splash').hidden");
  await check("document.querySelector('#site-content').inert");
  await browser('screenshot', 'evidence/rehearsal-splash.png');
  await browser('click', '#skip-splash');
  await check("document.querySelector('#splash').hidden && !document.querySelector('#site-content').inert && document.activeElement.id === 'landing-title'");
  stage = 'repeat visit';
  await browser('open', `http://127.0.0.1:${address.port}`);
  await check("document.querySelector('#splash').hidden");
  await browser('press', 'Tab');
  await check("document.activeElement.classList.contains('skip')");
  await browser('press', 'Enter');
  await browser('wait', '--fn', "!document.querySelector('#dashboard-view').hidden");
  await check("document.querySelector('#landing-view').hidden && document.activeElement.id === 'intro-title'");
  stage = 'route history';
  await browser('click', '.dashboard-nav a');
  await browser('wait', '--fn', "!document.querySelector('#landing-view').hidden");
  await browser('back');
  await browser('wait', '--fn', "!document.querySelector('#dashboard-view').hidden");
  await browser('forward');
  await browser('wait', '--fn', "!document.querySelector('#landing-view').hidden");
  await browser('click', '#launch-planner');
  await browser('wait', '--fn', "!document.querySelector('#dashboard-view').hidden");
  await browser('eval', "window.rehearsalSubmits = 0; window.rehearsalEvents = []; document.querySelector('#plan-form').addEventListener('submit', () => window.rehearsalSubmits++); for (const kind of ['click', 'input', 'submit']) document.addEventListener(kind, event => { window.rehearsalEvents.push({kind, target: event.target.id || event.target.tagName}); if(window.rehearsalEvents.length > 16) window.rehearsalEvents.shift(); }, true)");
  await check("getComputedStyle(document.documentElement).scrollBehavior === 'auto'");
  await check("document.body.innerText.includes('TEST_FIXTURE') && document.querySelector('#plan-button') && document.querySelector('#download').disabled");
  stage = 'safe plan'; await browser('click', '#plan-button');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  await check("document.querySelector('#retained-number').textContent === '75' && document.querySelector('#minimum-cash').textContent === '25.00'");
  stage = 'unreachable target'; await browser('fill', '#cash-target', '40');
  await check("document.querySelector('#retained-number').textContent === '—' && document.querySelector('#download').disabled");
  await browser('click', '#plan-button');
  await check('window.rehearsalSubmits === 2');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan blocked'");
  stage = 'closed market'; await browser('click', '[data-scenario="closed"]');
  await browser('wait', '--fn', "document.querySelector('#guard-details').textContent.includes('explicit permission')");
  stage = 'closed market permission'; await browser('check', '#closed-permission'); await browser('click', '#plan-button');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  await check("document.querySelector('#guard-details').textContent.includes('explicitly permitted')");
  stage = 'paused market'; await browser('select', '#market', 'pause'); await browser('click', '#plan-button');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan blocked'");
  await check("document.querySelector('#guard-details').textContent.includes('cannot override')");
  stage = 'snapshot expiry'; await browser('click', '[data-scenario="safe"]');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  await mkdir('evidence', { recursive: true });
  stage = 'planning record download';
  const download = resolve('evidence/rehearsal-record.json');
  await browser('download', '#download', download);
  const downloaded = JSON.parse(await readFile(download, 'utf8')) as { kind: string; mode: string; executionEnabled: boolean; plan: { planHash: string; [key: string]: unknown } };
  assert.equal(downloaded.kind, 'SYNTHETIC_PLANNING_RECORD'); assert.equal(downloaded.mode, 'TEST_FIXTURE'); assert.equal(downloaded.executionEnabled, false);
  const { planHash, ...body } = downloaded.plan; assert.equal(planHash, digest(body));
  stage = 'snapshot expiry';
  // Allow deterministic clock advancement without a blocking sleep.
  await browser('eval', "window.remainRealNow = Date.now; Date.now = () => window.remainRealNow() + 16000");
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Snapshot expired'");
  await browser('eval', 'Date.now = window.remainRealNow');
  stage = 'clock rollback cannot extend review';
  await browser('click', '[data-scenario="safe"]');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  await browser('eval', "window.remainRealPerformanceNow = performance.now.bind(performance); Date.now = () => window.remainRealNow() - 5000; Object.defineProperty(performance, 'now', {configurable: true, value: () => window.remainRealPerformanceNow() + 16000})");
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Snapshot expired'");
  await check("document.querySelector('#form-message').textContent.includes('Snapshot expired')");
  await browser('eval', 'Date.now = window.remainRealNow; delete performance.now');
  await browser('click', '[data-scenario="safe"]');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  // An older response must not overwrite settings changed during a request.
  stage = 'response race'; await browser('eval', "window.remainRealFetch = window.fetch; window.fetch = async (...args) => { const response = await window.remainRealFetch(...args); await new Promise(resolve => setTimeout(resolve, 500)); return response; }");
  stage = 'duplicate input event'; await browser('click', '#plan-button');
  await browser('eval', "document.querySelector('#cash-target').dispatchEvent(new Event('input', { bubbles: true }))");
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  stage = 'response race';
  await browser('click', '#plan-button'); await browser('fill', '#cash-target', '30');
  await browser('wait', '700');
  await check("document.querySelector('#retained-number').textContent === '—' && document.querySelector('#download').disabled && !document.querySelector('#plan-button').disabled");
  await browser('eval', 'window.fetch = window.remainRealFetch');
  stage = 'planner altered response and retry';
  await browser('eval', "window.fetch = async (...args) => { const r = await window.remainRealFetch(...args); if (String(args[0]) !== '/api/rehearse') return r; const body = await r.json(); body.plan.candidate.verdict.amounts.remainingStockRaw = '76'; return new Response(JSON.stringify(body), {headers: {'content-type':'application/json'}}); }");
  await browser('click', '[data-scenario="safe"]');
  await browser('wait', '--fn', "document.querySelector('#form-message').classList.contains('error') && !document.querySelector('#plan-button').disabled");
  await check("document.querySelector('#retained-number').textContent === '—' && document.querySelector('#download').disabled && document.querySelector('#plan-preview').getAttribute('aria-busy') === 'false'");
  await browser('eval', 'window.fetch = window.remainRealFetch');
  await browser('click', '[data-scenario="safe"]');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  stage = 'responsive widths'; for (const width of [320, 375, 768, 1024, 1440]) {
    await browser('set', 'viewport', String(width), '1000');
    await check('document.documentElement.scrollWidth <= window.innerWidth');
    await browser('screenshot', `evidence/rehearsal-${width}.png`, '--full');
  }
  stage = 'receipt workspace';
  await browser('click', 'nav a[href="#proof"]');
  await browser('wait', '--fn', "!document.querySelector('#proof-view').hidden");
  await check("document.querySelector('#dashboard-view').hidden && document.querySelector('#landing-view').hidden && document.activeElement.id === 'proof-title'");
  await check("document.querySelector('#receipt-verify').disabled && document.querySelector('#receipt-report').disabled");
  await browser('click', '#receipt-demo');
  await browser('wait', '--fn', "document.querySelector('#receipt-status').textContent === 'Consistent fixture'");
  await check("document.querySelector('#receipt-stock').textContent === '75' && document.querySelector('#receipt-accounting').textContent === 'Matched fixture' && document.querySelector('#receipt-boundary') === null && document.querySelector('.receipt-boundary').textContent.includes('fabricated')");
  const inspectionDownload = resolve('evidence/rehearsal-inspection.json');
  await browser('download', '#receipt-report', inspectionDownload);
  const inspection = JSON.parse(await readFile(inspectionDownload, 'utf8'));
  assert.equal(inspection.status, 'CONSISTENT_FIXTURE'); assert.equal(inspection.source, 'UNAUTHENTICATED'); assert.equal(inspection.executionEnabled, false);
  const sampleDownload = resolve('evidence/rehearsal-demo-receipt.json');
  await browser('download', '.receipt-sample-link', sampleDownload);
  assert.equal(inspectFixtureReceipt(await readFile(sampleDownload, 'utf8')).status, 'CONSISTENT_FIXTURE');
  for (const width of [320, 375, 768, 1024, 1440]) {
    await browser('set', 'viewport', String(width), '1000');
    await check('document.documentElement.scrollWidth <= window.innerWidth');
    await browser('screenshot', `evidence/rehearsal-receipt-${width}.png`, '--full');
  }
  stage = 'tampered receipt upload';
  await browser('eval', "(async () => { const r = await (await fetch('/demo-receipt.json')).json(); r.summary.stockRemainingRaw = '74'; const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(r)], 'tampered.json', {type: 'application/json'})); const input = document.querySelector('#receipt-file'); input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles: true})); })()");
  await browser('wait', '--fn', "!document.querySelector('#receipt-verify').disabled");
  await check("document.querySelector('#receipt-status').textContent === 'Awaiting receipt' && document.querySelector('#receipt-report').disabled");
  await browser('click', '#receipt-verify');
  await browser('wait', '--fn', "document.querySelector('#receipt-status').textContent === 'Rejected'");
  await check("document.querySelector('#receipt-facts').hidden && document.querySelector('#receipt-reasons').textContent.includes('recomputed journal')");
  stage = 'duplicate fields upload';
  await browser('eval', `(() => { const dt = new DataTransfer(); dt.items.add(new File(['{"mode":"TEST_FIXTURE","mode":"LIVE"}'], 'duplicate.json')); const input = document.querySelector('#receipt-file'); input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await browser('wait', '--fn', "!document.querySelector('#receipt-verify').disabled");
  await browser('click', '#receipt-verify');
  await browser('wait', '--fn', "document.querySelector('#receipt-reasons').textContent.includes('Duplicate fields')");
  stage = 'receipt size limit';
  await browser('eval', "(() => { const dt = new DataTransfer(); dt.items.add(new File([' '.repeat(262145)], 'large.json')); const input = document.querySelector('#receipt-file'); input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()");
  await check("document.querySelector('#receipt-verify').disabled && document.querySelector('#receipt-report').disabled && document.querySelector('#receipt-message').textContent.includes('256 KiB')");
  stage = 'receipt service failure and retry';
  await browser('eval', "window.fetch = (...args) => String(args[0]) === '/api/receipt/verify' ? Promise.reject(new Error('Fixture service unavailable')) : window.remainRealFetch(...args)");
  await browser('click', '#receipt-demo');
  await browser('wait', '--fn', "document.querySelector('#receipt-message').classList.contains('error') && !document.querySelector('#receipt-verify').disabled");
  await check("document.querySelector('#receipt-report').disabled && document.querySelector('#receipt-facts').hidden");
  await browser('eval', 'window.fetch = window.remainRealFetch');
  await browser('click', '#receipt-verify');
  await browser('wait', '--fn', "document.querySelector('#receipt-status').textContent === 'Consistent fixture'");
  stage = 'receipt malformed success and retry';
  await browser('eval', "window.fetch = async (...args) => { const r = await window.remainRealFetch(...args); if (String(args[0]) !== '/api/receipt/verify') return r; const body = await r.json(); body.facts.settlementStatus = 'UNKNOWN'; return new Response(JSON.stringify(body), {headers: {'content-type':'application/json'}}); }");
  await browser('click', '#receipt-verify');
  await browser('wait', '--fn', "document.querySelector('#receipt-message').classList.contains('error') && !document.querySelector('#receipt-verify').disabled");
  await check("document.querySelector('#receipt-status').textContent === 'Awaiting receipt' && document.querySelector('#receipt-report').disabled && document.querySelector('#receipt-facts').hidden");
  await browser('eval', 'window.fetch = window.remainRealFetch');
  await browser('click', '#receipt-verify');
  await browser('wait', '--fn', "document.querySelector('#receipt-status').textContent === 'Consistent fixture'");
  stage = 'receipt response race and clear';
  await browser('eval', "window.fetch = async (...args) => { const r = await window.remainRealFetch(...args); if (String(args[0]) === '/api/receipt/verify') await new Promise(resolve => setTimeout(resolve, 500)); return r; }");
  await browser('click', '#receipt-verify'); await browser('click', '#receipt-clear');
  await browser('wait', '700');
  await check("document.querySelector('#receipt-status').textContent === 'Awaiting receipt' && document.querySelector('#receipt-report').disabled && document.querySelector('#receipt-verify').disabled && document.querySelector('#receipt-result').getAttribute('aria-busy') === 'false'");
  await browser('eval', 'window.fetch = window.remainRealFetch');
  stage = 'public integration setup';
  await browser('open', `http://127.0.0.1:${address.port}/#live`);
  await browser('wait', '--fn', "document.querySelector('#live-server').textContent === 'Local setup required' && !document.querySelector('#live-refresh').disabled");
  await check("!document.querySelector('#live-view').hidden && document.querySelector('#fixture-banner').hidden && document.querySelector('#live-inspect').disabled && document.querySelector('#position-read').disabled && document.querySelector('#cash-preview').disabled");
  await browser('click', '#wallet-connect');
  await check("document.querySelector('#live-message').textContent.includes('No browser wallet') && !document.querySelector('#wallet-connect').disabled");
  for (const width of [320, 375, 768, 1024, 1440]) {
    await browser('set', 'viewport', String(width), '1000'); await check('document.documentElement.scrollWidth <= window.innerWidth');
    await browser('screenshot', `evidence/integration-${width}.png`, '--full');
  }
  stage = 'local fixture inspector and controlled wallet';
  await browser('open', `http://127.0.0.1:${inspectionAddress.port}/#live`);
  await browser('wait', '--fn', "document.querySelector('#live-server').textContent === 'Local read-only inspector ready'");
  await browser('eval', "window.fixtureWalletMethods=[]; window.fixtureWalletListeners={}; window.fixtureWalletChain='0x1'; window.ethereum={request:async ({method})=>{window.fixtureWalletMethods.push(method); if(method==='eth_chainId')return window.fixtureWalletChain; if(['eth_requestAccounts','eth_accounts'].includes(method))return ['0x1111111111111111111111111111111111111111']; throw new Error('Forbidden wallet method');},on:(name,listener)=>window.fixtureWalletListeners[name]=listener,removeListener:(name)=>delete window.fixtureWalletListeners[name]}");
  await browser('click', '#wallet-connect');
  await browser('wait', '--fn', "document.querySelector('#wallet-state').textContent.includes('Choose BNB Smart Chain')");
  await check("document.querySelector('#live-inspect').disabled");
  await browser('eval', "window.fixtureWalletChain='0x38'"); await browser('click', '#wallet-connect');
  await browser('wait', '--fn', "document.querySelector('#wallet-state').textContent === 'BSC account selected'");
  stage = 'cash-target estimates from an injected read-only provider';
  await browser('fill', '#live-token', '0x2222222222222222222222222222222222222222');
  await browser('fill', '#cash-preview-target', '1'); await browser('click', '#cash-preview');
  await browser('wait', '--fn', "!document.querySelector('#cash-preview-result').hidden");
  await check("document.querySelector('#cash-preview-label').textContent.includes('TEST_FIXTURE') && document.querySelector('#cash-preview-output').textContent === '1 USDT' && document.querySelector('#cash-preview-sale').textContent === '0.5 FIXon' && document.querySelector('#cash-preview-retained').textContent === '2 FIXon' && document.querySelector('#live-amount').value === '' && document.querySelector('#cash-preview-message').textContent.includes('unverified')");
  stage = 'cash intent change clears the observed candidate';
  await browser('fill', '#cash-preview-target', '2'); await check("document.querySelector('#cash-preview-result').hidden && document.querySelector('#cash-preview-output').textContent === ''");
  await browser('click', '#cash-preview'); await browser('wait', '--fn', "!document.querySelector('#cash-preview-result').hidden");
  await check("document.querySelector('#cash-preview-title').textContent === 'No qualifying candidate observed.'");
  stage = 'cash preview response tampering and retry';
  await browser('fill', '#cash-preview-target', '1');
  await browser('eval', "window.previewFetch=window.fetch;window.fetch=async (...args)=>{const r=await window.previewFetch(...args);if(String(args[0])!=='/api/live/preview')return r;const body=await r.json();body.floorRaw='0';return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})}");
  await browser('click', '#cash-preview'); await browser('wait', '--fn', "document.querySelector('#cash-preview-message').classList.contains('error') && !document.querySelector('#cash-preview').disabled");
  await check("document.querySelector('#cash-preview-result').hidden"); await browser('eval', 'window.fetch=window.previewFetch');
  await browser('click', '#cash-preview'); await browser('wait', '--fn', "!document.querySelector('#cash-preview-result').hidden");
  await browser('screenshot', 'evidence/rehearsal-cash-target-preview.png', '--full');
  stage = 'explicit unsigned cash order review';
  await check("!document.querySelector('#cash-review').disabled && document.querySelector('#cash-review-result').hidden");
  await browser('click', '#cash-review'); await browser('wait', '--fn', "!document.querySelector('#cash-review-result').hidden");
  await check("document.querySelector('#cash-review-sale').textContent === '0.5 FIXon' && document.querySelector('#cash-review-before').textContent === '1 USDT' && document.querySelector('#cash-review-after').textContent === '1 USDT' && document.querySelector('#cash-review-label').textContent.includes('TEST_FIXTURE') && document.querySelector('#cash-review-message').textContent.includes('Trading remains locked') && document.querySelector('#live-amount').value === ''");
  await browser('screenshot', 'evidence/rehearsal-cash-order-review.png', '--full');
  stage = 'unsigned review tampering and recovery';
  await browser('eval', "window.reviewFetch=window.fetch;window.fetch=async (...args)=>{const r=await window.reviewFetch(...args);if(String(args[0])!=='/api/live/review')return r;const body=await r.json();body.rfqReview.signatureSemantics='VERIFIED';return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})}");
  await browser('click', '#cash-review'); await browser('wait', '--fn', "document.querySelector('#cash-review-message').classList.contains('error') && !document.querySelector('#cash-review').disabled");
  await check("document.querySelector('#cash-review-result').hidden && document.querySelector('#cash-review-after').textContent === ''");
  await browser('eval', 'window.fetch=window.reviewFetch'); await browser('click', '#cash-review'); await browser('wait', '--fn', "!document.querySelector('#cash-review-result').hidden");
  await browser('fill', '#cash-preview-target', '2'); await check("document.querySelector('#cash-review-result').hidden && document.querySelector('#cash-review-proof').textContent === ''");
  stage = 'selected position and exact amount preparation';
  await browser('fill', '#live-token', '0x2222222222222222222222222222222222222222'); await browser('click', '#position-read');
  await browser('wait', '--fn', "!document.querySelector('#position-result').hidden");
  await check("document.querySelector('#position-label').textContent.includes('TEST_FIXTURE') && document.querySelector('#position-balance').textContent === '2.5 FIXon'");
  await browser('fill', '#position-units', '2.501'); await browser('click', '#position-use');
  await check("document.querySelector('#live-amount').value === '' && document.querySelector('#live-message').classList.contains('error')");
  await browser('fill', '#position-units', '1.00'); await browser('click', '#position-use');
  await check("document.querySelector('#live-amount').value === '100' && document.querySelector('#live-result').hidden");
  await browser('fill', '#live-token', '0x3333333333333333333333333333333333333333');
  await check("document.querySelector('#position-result').hidden && document.querySelector('#live-amount').value === ''");
  await browser('click', '#position-read'); await browser('wait', '--fn', "!document.querySelector('#position-result').hidden");
  await check("document.querySelector('#position-balance').textContent === '0 FIXon' && document.querySelector('#position-use').disabled");
  await browser('fill', '#live-token', '0x2222222222222222222222222222222222222222'); await browser('fill', '#live-amount', '1');
  await browser('click', '#live-inspect');
  await browser('wait', '--fn', "!document.querySelector('#live-result').hidden && document.querySelector('#live-error').textContent.includes('INSUFFICIENT_POSITION')");
  await check("document.querySelector('#live-result-label').textContent.includes('TEST_FIXTURE') && document.querySelector('#live-checks').children.length === 6");
  await browser('fill', '#live-amount', '100'); await check("document.querySelector('#live-result').hidden"); await browser('click', '#live-inspect');
  await browser('wait', '--fn', "!document.querySelector('#live-result').hidden && document.querySelector('#live-result-title').textContent === 'Read path inspected. Signing locked.'");
  await check("document.querySelector('#live-result-label').textContent.includes('TEST_FIXTURE') && document.querySelector('#live-error').textContent.includes('global live gate remains unverified')");
  stage = 'malformed integration response and recovery';
  await browser('eval', "window.integrationFetch=window.fetch; window.fetch=async (...args)=>{const r=await window.integrationFetch(...args);if(String(args[0])!=='/api/live/inspect')return r;const body=await r.json();body.executionEnabled=true;return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})}");
  await browser('click', '#live-inspect'); await browser('wait', '--fn', "document.querySelector('#live-message').classList.contains('error') && !document.querySelector('#live-inspect').disabled");
  await check("document.querySelector('#live-result').hidden"); await browser('eval', 'window.fetch=window.integrationFetch');
  await browser('click', '#live-inspect'); await browser('wait', '--fn', "!document.querySelector('#live-result').hidden");
  stage = 'account and in-flight input invalidation';
  await browser('eval', "window.fixtureWalletListeners.accountsChanged()");
  await check("document.querySelector('#live-result').hidden && document.querySelector('#live-inspect').disabled && document.querySelector('#wallet-address').textContent === 'No account selected'");
  await browser('click', '#wallet-connect'); await browser('wait', '--fn', "document.querySelector('#wallet-state').textContent === 'BSC account selected'");
  await browser('fill', '#live-amount', '100');
  await browser('eval', "window.fetch=async (...args)=>{const r=await window.integrationFetch(...args);if(String(args[0])==='/api/live/inspect')await new Promise(resolve=>setTimeout(resolve,500));return r}");
  await browser('click', '#live-inspect'); await browser('fill', '#live-amount', '101'); await browser('wait', '700');
  await check("document.querySelector('#live-result').hidden && !document.querySelector('#live-inspect').disabled && document.querySelector('#live-form').getAttribute('aria-busy') === 'false'");
  await browser('eval', 'window.fetch=window.integrationFetch'); await browser('click', '#wallet-forget');
  await check("document.querySelector('#live-token').value === '' && document.querySelector('#live-amount').value === '' && document.querySelector('#cash-preview-target').value === '' && !document.querySelector('#cash-preview-closed').checked && document.querySelector('#live-inspect').disabled && window.fixtureWalletMethods.every(method=>['eth_requestAccounts','eth_accounts','eth_chainId'].includes(method))");
  const errors = await browser('errors');
  assert.deepEqual((errors as { errors?: unknown[] }).errors ?? [], [], 'Unexpected browser errors');
  stage = 'direct dashboard link';
  await browser('open', `http://127.0.0.1:${address.port}/#dashboard`);
  await check("!document.querySelector('#dashboard-view').hidden && document.querySelector('#splash').hidden");
  stage = 'direct receipt link';
  await browser('open', `http://127.0.0.1:${address.port}/#proof`);
  await check("!document.querySelector('#proof-view').hidden && document.querySelector('#splash').hidden && document.querySelector('#receipt-report').disabled");
  stage = 'reduced motion';
  await browser('set', 'media', 'light', 'reduced-motion');
  await browser('eval', "sessionStorage.removeItem('remain-introduced')");
  await browser('open', `http://127.0.0.1:${address.port}`);
  await check("matchMedia('(prefers-reduced-motion: reduce)').matches && document.querySelector('#splash').hidden && !document.querySelector('#site-content').inert");
  console.log('Browser rehearsal passed: landing, splash, keyboard/history/direct routes, planning blocks/download/expiry/races, receipt checks, local position preparation, cash-target RFQ estimates, explicit unsigned candidate review, signature-label tampering/retry, no-candidate state, intent invalidation and all views at five widths. TEST_FIXTURE only.');
} catch (error) {
  console.error(`Browser rehearsal failed during ${stage}.`);
  await mkdir('evidence', { recursive: true });
  try {
    await browser('screenshot', 'evidence/rehearsal-failure.png', '--full');
    console.error(JSON.stringify(await browser('eval', "({ verdict: document.querySelector('#verdict-pill').textContent, message: document.querySelector('#form-message').textContent, details: document.querySelector('#guard-details').textContent, cash: document.querySelector('#cash-target').value, retained: document.querySelector('#retain').value, market: document.querySelector('#market').value, permission: document.querySelector('#closed-permission').checked, submits: window.rehearsalSubmits, events: window.rehearsalEvents })")));
    console.error(JSON.stringify(await browser('errors')));
  } catch { console.error('Could not collect browser failure details.'); }
  throw error;
} finally {
  try { await browser('close'); } catch { console.error('Browser cleanup could not confirm session closure.'); }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => inspectionServer.close(() => resolve()));
}
