import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRehearsalServer } from '../src/rehearsal/server.ts';

// Run through npm run test:web after agent-browser install. Uses a dedicated
// empty browser session, fictional data and an ephemeral loopback-only port.
const exec = promisify(execFile); const session = `remain-${randomUUID().slice(0, 8)}`;
const server = createRehearsalServer();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert.ok(address && typeof address === 'object');
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
  await check("document.body.innerText.includes('TEST_FIXTURE') && document.querySelector('#plan-button') && document.querySelector('#download').disabled");
  await browser('click', '#plan-button');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  await check("document.querySelector('#retained-number').textContent === '75' && document.querySelector('#minimum-cash').textContent === '25.00'");
  await browser('fill', '#cash-target', '40');
  await check("document.querySelector('#retained-number').textContent === '—' && document.querySelector('#download').disabled");
  await browser('click', '#plan-button');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan blocked'");
  await browser('click', '[data-scenario="closed"]');
  await browser('wait', '--fn', "document.querySelector('#guard-details').textContent.includes('explicit permission')");
  await browser('check', '#closed-permission'); await browser('click', '#plan-button');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  await check("document.querySelector('#guard-details').textContent.includes('explicitly permitted')");
  await browser('select', '#market', 'pause'); await browser('click', '#plan-button');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan blocked'");
  await check("document.querySelector('#guard-details').textContent.includes('cannot override')");
  await browser('click', '[data-scenario="safe"]');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  await mkdir('evidence', { recursive: true });
  // Allow deterministic clock advancement without a blocking sleep.
  await browser('eval', "window.remainRealNow = Date.now; Date.now = () => window.remainRealNow() + 16000");
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Snapshot expired'");
  await browser('eval', 'Date.now = window.remainRealNow');
  await browser('click', '[data-scenario="safe"]');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  // An older response must not overwrite settings changed during a request.
  await browser('eval', "window.remainRealFetch = window.fetch; window.fetch = async (...args) => { const response = await window.remainRealFetch(...args); await new Promise(resolve => setTimeout(resolve, 500)); return response; }");
  await browser('click', '#plan-button'); await browser('fill', '#cash-target', '30');
  await browser('wait', '700');
  await check("document.querySelector('#retained-number').textContent === '—' && document.querySelector('#download').disabled && !document.querySelector('#plan-button').disabled");
  await browser('eval', 'window.fetch = window.remainRealFetch');
  await browser('click', '[data-scenario="safe"]');
  await browser('wait', '--fn', "document.querySelector('#verdict-pill').textContent === 'Plan available'");
  for (const width of [320, 375, 768, 1024, 1440]) {
    await browser('set', 'viewport', String(width), '1000');
    await check('document.documentElement.scrollWidth <= window.innerWidth');
    await browser('screenshot', `evidence/rehearsal-${width}.png`, '--full');
  }
  const errors = await browser('errors');
  assert.ok(JSON.stringify(errors) === '{}' || !JSON.stringify(errors).includes('Error'), 'Unexpected browser errors');
  console.log('Browser rehearsal passed: planning, hard blocks, changed-input invalidation, expiry, request race and five responsive widths. TEST_FIXTURE only.');
} finally {
  try { await browser('close'); } catch { console.error('Browser cleanup could not confirm session closure.'); }
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
