import test from 'node:test';
import assert from 'node:assert/strict';
import { walletSession, type AccountProvider, type WalletState } from '../web/wallet.js';

const address = '0x' + '1'.repeat(40);
function provider(chain = '0x38', selected: unknown = [address]) {
  const methods: string[] = []; const listeners = new Map<string, () => void>();
  const p: AccountProvider = { request: async ({ method }) => { methods.push(method); return method === 'eth_chainId' ? chain : selected; },
    on: (name, listener) => { listeners.set(name, listener); }, removeListener: name => { listeners.delete(name); } };
  return { p, methods, listeners };
}
test('account discovery requests only account and chain reads after an explicit connect', async () => {
  const p = provider(); const states: WalletState[] = []; const session = walletSession(p.p, state => states.push(state));
  assert.deepEqual(p.methods, []); const result = await session.connect();
  assert.equal(result.status, 'CONNECTED'); assert.equal(result.address, address); assert.ok(Object.isFrozen(result));
  assert.deepEqual(p.methods, ['eth_requestAccounts', 'eth_chainId', 'eth_accounts']);
  assert.equal(states.length, 2); session.destroy(); assert.equal(p.listeners.size, 0);
});
test('wrong-chain discovery does not request a chain change', async () => {
  const p = provider('0x1'); const session = walletSession(p.p, () => {}); assert.equal((await session.connect()).status, 'WRONG_CHAIN');
  assert.deepEqual(p.methods, ['eth_requestAccounts', 'eth_chainId', 'eth_accounts']); session.destroy();
});
for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) test(`${event} invalidates the discovered account`, async () => {
  const p = provider(); const session = walletSession(p.p, () => {}); await session.connect(); p.listeners.get(event)!();
  assert.equal(session.state.status, 'CHANGED'); assert.equal(session.state.address, null); session.destroy();
});
test('missing, rejected and malformed providers never produce a connected state', async () => {
  const missing = walletSession(undefined, () => {}); assert.equal((await missing.connect()).error, 'WALLET_UNAVAILABLE');
  const rejected = walletSession({ request: async () => { throw { code: 4001, message: 'private-provider-message' }; } }, () => {});
  assert.equal((await rejected.connect()).error, 'WALLET_REJECTED'); assert.equal(JSON.stringify(rejected.state).includes('private'), false);
  for (const selected of [[], [null], ['0x' + '0'.repeat(40)], address, ['bad']]) {
    const p = provider('0x38', selected); const session = walletSession(p.p, () => {}); assert.equal((await session.connect()).error, 'WALLET_INVALID'); session.destroy();
  }
});
for (const chain of ['56', '0x', '0x' + 'f'.repeat(17), null]) test(`invalid chain ${chain} cannot connect`, async () => {
  const p = provider(); p.p.request = async ({ method }) => method === 'eth_chainId' ? chain : [address];
  const session = walletSession(p.p, () => {}); assert.equal((await session.connect()).error, 'WALLET_INVALID'); session.destroy();
});
test('a changed account between provider responses cannot connect', async () => {
  const p = provider(); p.p.request = async ({ method }) => method === 'eth_chainId' ? '0x38' : method === 'eth_accounts' ? ['0x' + '2'.repeat(40)] : [address];
  const session = walletSession(p.p, () => {}); assert.equal((await session.connect()).error, 'WALLET_CHANGED'); session.destroy();
});
test('timeout recovers even when a wallet never resolves', async () => {
  let calls = 0; const session = walletSession({ request: async ({ method }) => ++calls === 1 ? new Promise(() => {}) : method === 'eth_chainId' ? '0x38' : [address] }, () => {}, { timeoutMs: 20 });
  assert.equal((await session.connect()).error, 'WALLET_TIMEOUT'); assert.equal((await session.connect()).status, 'CONNECTED'); session.destroy();
});
test('clearing or destroying a pending connection ignores late wallet responses', async () => {
  for (const action of ['forget', 'destroy'] as const) {
    let resolve!: (value: unknown) => void; const states: WalletState[] = [];
    const session = walletSession({ request: () => new Promise(r => { resolve = r; }) }, s => states.push(s), { timeoutMs: 100 });
    const pending = session.connect(); await Promise.resolve(); session[action](); resolve([address]); await pending;
    assert.notEqual(session.state.status, 'CONNECTED'); assert.equal(states.some(s => s.status === 'CONNECTED'), false);
  }
});
test('provider events interrupt pending discovery without waiting for the provider', async () => {
  const p = provider(); p.p.request = async () => new Promise(() => {}); const session = walletSession(p.p, () => {});
  const pending = session.connect(); p.listeners.get('chainChanged')!(); await pending; assert.equal(session.state.status, 'CHANGED'); session.destroy();
});
test('reconnection and forget do not revoke or sign wallet permissions', async () => {
  const p = provider(); const session = walletSession(p.p, () => {}); await session.connect(); session.forget();
  assert.equal(session.state.status, 'IDLE'); await session.connect(); assert.equal(p.methods.length, 6); session.destroy();
});
test('invalid timeout configuration fails before requesting any account', () => {
  for (const timeoutMs of [0, -1, 12001, NaN, Infinity, 0.5]) assert.throws(() => walletSession(undefined, () => {}, { timeoutMs }));
});
