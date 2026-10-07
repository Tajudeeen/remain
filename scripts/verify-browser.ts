import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRehearsalServer } from '../src/rehearsal/server.ts';
import { digest } from '../src/validation.ts';
import { inspectFixtureReceipt } from '../src/receipts/inspection.ts';

// Run through npm run test:web after agent-browser install. Uses a dedicated
// empty browser session, fictional data and an ephemeral loopback-only port.
const exec = promisify(execFile); const session = `remain-${randomUUID().slice(0, 8)}`;
const server = createRehearsalServer();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert.ok(address && typeof address === 'object');
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
  stage = 'receipt response race and clear';
  await browser('eval', "window.fetch = async (...args) => { const r = await window.remainRealFetch(...args); if (String(args[0]) === '/api/receipt/verify') await new Promise(resolve => setTimeout(resolve, 500)); return r; }");
  await browser('click', '#receipt-verify'); await browser('click', '#receipt-clear');
  await browser('wait', '700');
  await check("document.querySelector('#receipt-status').textContent === 'Awaiting receipt' && document.querySelector('#receipt-report').disabled && document.querySelector('#receipt-verify').disabled && document.querySelector('#receipt-result').getAttribute('aria-busy') === 'false'");
  await browser('eval', 'window.fetch = window.remainRealFetch');
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
  console.log('Browser rehearsal passed: landing, splash, keyboard/history/direct routes, planning blocks/download/expiry/races, receipt replay/source and report downloads, tampering, duplicate fields, size limits, retry/clear/races, and all three views at five widths. TEST_FIXTURE only.');
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
}
