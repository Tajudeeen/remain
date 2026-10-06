import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signRequest, wirePath } from '../src/signing.ts';

const credentials = { apiKey: 'test-only-key', secretKey: 'test-only-secret', timestamp: '2026-05-11T10:08:57.715Z', nonce: 'test-nonce' };

test('fixed GET signature includes /build and exact raw query', () => {
  const requestPath = wirePath('/api/v1/dex/market/price', [['chainId', '1'], ['symbol', 'ETH USDT']]);
  assert.equal(requestPath, '/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT');
  const headers = signRequest({ ...credentials, method: 'GET', requestPath });
  assert.equal(headers['X-OC-SIGN'], 'czHR7K0paoQlEV1PUmx+7unAEobkDwMBIsp8RJARSE4=');
  assert.equal(headers['X-OC-TIMESTAMP'], credentials.timestamp);
  assert.equal(headers['X-OC-RECV-WINDOW'], '5000');
});

test('fixed POST signature signs body bytes exactly', () => {
  const h = signRequest({ ...credentials, method: 'POST', requestPath: '/build/api/v1/dex/swap', body: '{"amount":"100"}' });
  assert.equal(h['X-OC-SIGN'], 'oXDkykQCm3iS82KuKfMXsTNX315ZFgOCVDcpCoiDlI4=');
  const spaced = signRequest({ ...credentials, method: 'POST', requestPath: '/build/api/v1/dex/swap', body: '{ "amount": "100" }' });
  assert.notEqual(spaced['X-OC-SIGN'], h['X-OC-SIGN']);
});

test('query order is preserved and reserved characters encoded once', () => {
  assert.equal(wirePath('/api/v1/dex/market/price', [['b', 'a+b/&%'], ['a', '1']]), '/build/api/v1/dex/market/price?b=a%2Bb%2F%26%25&a=1');
});

for (const endpoint of ['https://evil.test', '//evil.test', '/build/api/v1/test', '/api/v1/../secret', '/api/v1//test', '/api/v1/test?x=y', '/api/v1/test#fragment', '/api/v1/test/']) {
  test(`rejects unsafe endpoint ${endpoint}`, () => assert.throws(() => wirePath(endpoint)));
}
test('duplicate query keys are rejected', () => assert.throws(() => wirePath('/api/v1/test', [['a', '1'], ['a', '2']])));
test('missing /build prefix cannot be signed', () => assert.throws(() => signRequest({ ...credentials, method: 'GET', requestPath: '/api/v1/test' })));
test('GET body is forbidden', () => assert.throws(() => signRequest({ ...credentials, method: 'GET', requestPath: '/build/api/v1/test', body: '{}' })));
test('malformed timestamp and nonce are rejected', () => {
  assert.throws(() => signRequest({ ...credentials, method: 'GET', requestPath: '/build/api/v1/test', timestamp: 'invalid' }));
  assert.throws(() => signRequest({ ...credentials, method: 'GET', requestPath: '/build/api/v1/test', nonce: 'x\r\ny' }));
});
test('nonce changes on repeated requests', () => {
  const a = signRequest({ apiKey: 'test-only-key', secretKey: 'test-only-secret', method: 'GET', requestPath: '/build/api/v1/test' });
  const b = signRequest({ apiKey: 'test-only-key', secretKey: 'test-only-secret', method: 'GET', requestPath: '/build/api/v1/test' });
  assert.notEqual(a['X-OC-NONCE'], b['X-OC-NONCE']);
});
test('blank credentials and header injection fail before HTTP', () => {
  assert.throws(() => signRequest({ ...credentials, apiKey: '', method: 'GET', requestPath: '/build/api/v1/test' }));
  assert.throws(() => signRequest({ ...credentials, apiKey: 'key\r\nInjected: yes', method: 'GET', requestPath: '/build/api/v1/test' }));
});
