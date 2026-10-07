import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForDeployment } from '../src/release/deployment-wait.ts';

const origin = 'https://remain-fixture.netlify.app/'; const sha = 'a'.repeat(40);
const health = { status: 'ok', service: 'remain-rehearsal', mode: 'TEST_FIXTURE', executionEnabled: false, liveGate: 'BLOCKED', buildSha: sha };
test('deployment gate waits for the exact build and preserves fixture invariants', async () => {
  let calls = 0; const delays: number[] = [];
  await waitForDeployment(origin, sha, { attempts: 3, delayMs: 15, sleep: async ms => { delays.push(ms); }, fetcher: async (url, init) => {
    assert.equal(String(url), origin + 'healthz'); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    return Response.json({ ...health, buildSha: ++calls === 1 ? 'b'.repeat(40) : sha });
  } });
  assert.equal(calls, 2); assert.deepEqual(delays, [15]);
});
for (const patch of [{ executionEnabled: true }, { mode: 'LIVE' }, { liveGate: 'PASSED' }, { status: 'wrong' },
  { service: 'other' }, { buildSha: 'b'.repeat(40) }, { secret: 'never-reflect' }]) {
  test(`unsafe or old health cannot pass: ${Object.keys(patch)[0]}`, async () => {
    await assert.rejects(waitForDeployment(origin, sha, { attempts: 1, fetcher: async () => Response.json({ ...health, ...patch }) }), /DEPLOYMENT_NOT_READY/);
  });
}
test('HTTP, body-size, duplicate-field and UTF-8 failures remain redacted', async () => {
  const duplicates = JSON.stringify(health).replace('"executionEnabled":false', '"executionEnabled":true,"executionEnabled":false');
  for (const create of [() => new Response('private-upstream-text', { status: 503 }),
    () => new Response('x'.repeat(4097), { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(duplicates, { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(new Uint8Array([255]), { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(null, { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('private-upstream-text', { headers: { 'Content-Type': 'text/html' } })]) {
    await assert.rejects(waitForDeployment(origin, sha, { attempts: 1, fetcher: async () => create() }), error => {
      assert.ok(error instanceof Error); assert.equal(error.message, 'DEPLOYMENT_NOT_READY'); return true;
    });
  }
});
test('transient health failure has a fixed polling budget', async () => {
  let calls = 0; let waits = 0;
  await assert.rejects(waitForDeployment(origin, sha, { attempts: 3, delayMs: 0,
    sleep: async () => { waits++; }, fetcher: async () => { calls++; throw new Error('private-transport-text'); } }), /DEPLOYMENT_NOT_READY/);
  assert.equal(calls, 3); assert.equal(waits, 2);
});
test('invalid deployment configuration is rejected before networking', async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; return Response.json(health); };
  for (const url of ['not-a-url', 'http://fixture.test/', 'https://user:password@fixture.test/', 'https://fixture.test/path', 'https://fixture.test/?secret=private', 'https://fixture.test/#private']) {
    await assert.rejects(waitForDeployment(url, sha, { fetcher }), error => error instanceof Error && error.message === 'DEPLOYMENT_CONFIG_INVALID');
  }
  for (const patch of [{ attempts: 0 }, { attempts: 61 }, { attempts: 1.5 }, { delayMs: -1 }, { delayMs: 5001 }]) {
    await assert.rejects(waitForDeployment(origin, sha, { fetcher, ...patch }), /DEPLOYMENT_CONFIG_INVALID/);
  }
  await assert.rejects(waitForDeployment(origin, 'private-input', { fetcher }), /DEPLOYMENT_CONFIG_INVALID/);
  assert.equal(calls, 0);
});
