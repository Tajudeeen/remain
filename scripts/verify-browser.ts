import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRehearsalServer } from '../src/rehearsal/server.ts';
import { digest } from '../src/validation.ts';

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
  await browser('eval', "window.rehearsalSubmits = 0; window.rehearsalEvents = []; document.querySelector('#plan-form').addEventListener('submit', () => window.rehearsalSubmits++); for (const kind of ['click', 'input', 'submit']) document.addEventListener(kind, event => { window.rehearsalEvents.push({kind, target: event.target.id || event.target.tagName}); if(window.rehearsalEvents.length > 16) window.rehearsalEvents.shift(); }, true)");
  await check("getComputedStyle(document.documentElement).scrollBehavior === 'auto'");
  await browser('press', 'Tab');
  await check("document.activeElement.classList.contains('skip')");
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
  const errors = await browser('errors');
  assert.deepEqual((errors as { errors?: unknown[] }).errors ?? [], [], 'Unexpected browser errors');
  console.log('Browser rehearsal passed: keyboard entry, planning, hard blocks, duplicate input events, changed-input invalidation, checksum download, expiry, request race and five responsive widths. TEST_FIXTURE only.');
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
