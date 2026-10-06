import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadOnlyBinanceClient } from '../src/client.ts';
import { RemainError, safeError } from '../src/errors.ts';

const endpoint = '/api/v1/dex/market/rwa/tokens';
const now = 1770000000000;
const ok = (data: unknown = []): Response => Response.json({ code: 0, success: true, timestamp: now, data });
const client = (fetcher: typeof fetch, options = {}) => new ReadOnlyBinanceClient({ apiKey: 'fixture-key', secretKey: 'fixture-secret', now: () => now, fetcher, sleep: async () => {}, ...options });
const expectCode = (code: string) => (e: unknown) => e instanceof RemainError && e.code === code;

test('HTTP wire URL and signed path match, redirects and caches disabled', async () => {
  const c = client(async (url, init) => {
    assert.equal(url, 'https://web3.binance.com/build/api/v1/dex/market/rwa/tokens?binanceChainId=56');
    assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.method, 'GET');
    assert.ok((init?.headers as Record<string, string>)['X-OC-SIGN']);
    return ok();
  });
  const result = await c.get(endpoint, [['binanceChainId', '56']]);
  assert.equal(result.responseHash.length, 64); assert.deepEqual(result.data, []);
  assert.ok(!JSON.stringify(c).includes('fixture-secret'));
});

test('submit and broadcast paths are blocked before HTTP', async () => {
  let calls = 0;
  const c = client(async () => { calls++; return ok(); });
  for (const path of ['/api/v1/dex/aggregator/order/submit', '/api/v1/dex/pre-transaction/broadcast-transaction', 'https://evil.test']) {
    await assert.rejects(c.get(path), expectCode('READ_ONLY_VIOLATION'));
  }
  assert.equal(calls, 0);
});

for (const [status, code, expected] of [[401, 40101, 'AUTH_KEY_INVALID'], [401, 40102, 'AUTH_SIGNATURE_INVALID'], [401, 40103, 'AUTH_CLOCK_DRIFT'], [403, 40104, 'AUTH_PERMISSION_DENIED'], [400, 40401, 'QUOTE_EXPIRED']] as const) {
  test(`maps ${code} without leaking upstream message`, async () => {
    const c = client(async () => Response.json({ code, msg: 'secret-echo-fixture' }, { status }));
    try { await c.get(endpoint); assert.fail('expected failure'); }
    catch (e) { assert.ok(expectCode(expected)(e)); assert.ok(!JSON.stringify(safeError(e)).includes('secret-echo-fixture')); }
  });
}

test('business failure under HTTP 200 still blocks', async () => {
  await assert.rejects(client(async () => Response.json({ code: 40001, data: [], timestamp: now })).get(endpoint), expectCode('UPSTREAM_REJECTED'));
});

for (const [upstreamCode, expected] of [[40301, 'ACCESS_REGION_RESTRICTED'], [40302, 'ACCESS_PROXY_REJECTED'], [40303, 'ACCESS_IP_RESTRICTED'], [40304, 'ACCESS_COMPLIANCE_RESTRICTED']] as const) {
  for (const status of [200, 403, 503]) {
    test(`compliance ${upstreamCode} under HTTP ${status} stops without retry or raw data`, async () => {
      let calls = 0;
      let sleeps = 0;
      const c = client(async () => { calls++; return Response.json({ code: upstreamCode, msg: 'secret-echo-fixture', data: { private: 'secret-echo-fixture' } }, { status }); }, { sleep: async () => { sleeps++; } });
      await assert.rejects(c.get(endpoint), (error) => {
        const safe = safeError(error);
        assert.equal(safe.code, expected);
        assert.equal(safe.upstreamCode, upstreamCode);
        assert.equal(JSON.stringify(safe).includes('secret-echo-fixture'), false);
        return true;
      });
      assert.equal(calls, 1);
      assert.equal(sleeps, 0);
    });
  }
}

test('429 Retry-After is respected with fresh nonce', async () => {
  let calls = 0; const waits: number[] = []; const nonces: string[] = [];
  const c = client(async (_url, init) => {
    nonces.push((init?.headers as Record<string, string>)['X-OC-NONCE']!);
    return ++calls === 1 ? Response.json({ code: 42900 }, { status: 429, headers: { 'Retry-After': '1' } }) : ok();
  }, { sleep: async (ms: number) => { waits.push(ms); } });
  await c.get(endpoint);
  assert.equal(calls, 2); assert.deepEqual(waits, [1000]); assert.notEqual(nonces[0], nonces[1]);
});
test('large Retry-After exits instead of retrying early', async () => {
  let calls = 0;
  const c = client(async () => { calls++; return Response.json({ code: 42900 }, { status: 429, headers: { 'Retry-After': '60' } }); });
  await assert.rejects(c.get(endpoint), expectCode('RATE_LIMITED')); assert.equal(calls, 1);
});
test('temporary reads retry at most three times', async () => {
  let calls = 0;
  const c = client(async () => { calls++; return Response.json({ code: 50001 }, { status: 503 }); });
  await assert.rejects(c.get(endpoint), expectCode('UPSTREAM_UNAVAILABLE')); assert.equal(calls, 3);
});
test('quotes and payload building are never silently retried', async () => {
  let calls = 0;
  const c = client(async () => { calls++; return Response.json({ code: 50001 }, { status: 503 }); });
  await assert.rejects(c.get('/api/v1/dex/aggregator/quote')); await assert.rejects(c.get('/api/v1/dex/aggregator/swap'));
  assert.equal(calls, 2);
});

for (const fixture of [[], { code: 0 }, { code: 0, data: [], timestamp: now, success: false }, { code: '0', data: [], timestamp: now }]) {
  test(`malformed success envelope fails closed: ${JSON.stringify(fixture)}`, async () => {
    await assert.rejects(client(async () => Response.json(fixture)).get(endpoint), expectCode('UPSTREAM_SCHEMA_INVALID'));
  });
}
test('stale envelope blocks', async () => {
  await assert.rejects(client(async () => Response.json({ code: 0, data: [], timestamp: now - 61000 })).get(endpoint), expectCode('AUTH_CLOCK_DRIFT'));
});
test('invalid JSON does not leak body', async () => {
  await assert.rejects(client(async () => new Response('secret-echo-fixture')).get(endpoint), expectCode('UPSTREAM_SCHEMA_INVALID'));
});
test('oversized body is rejected', async () => {
  await assert.rejects(client(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))).get(endpoint), expectCode('UPSTREAM_SCHEMA_INVALID'));
});
test('network failure is safe', async () => {
  const c = client(async () => { throw new Error('fixture-secret in raw transport'); });
  await assert.rejects(c.get(endpoint), expectCode('UPSTREAM_UNAVAILABLE'));
});
test('aborted request becomes timeout', async () => {
  const c = client(async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('abort')));
  }), { timeoutMs: 5 });
  await assert.rejects(c.get(endpoint), expectCode('UPSTREAM_TIMEOUT'));
});
test('unexpected errors never expose their raw message', () => {
  assert.ok(!JSON.stringify(safeError(new Error('fixture-secret'))).includes('fixture-secret'));
});
