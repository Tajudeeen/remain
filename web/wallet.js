// Account discovery only. No signing, transaction or chain-changing methods.
const address = /^0x[0-9a-fA-F]{40}$/;
const errors = new Set(['WALLET_UNAVAILABLE', 'WALLET_REJECTED', 'WALLET_TIMEOUT', 'WALLET_CHANGED', 'WALLET_INVALID']);
function failure(code) { const error = new Error(code); error.code = code; return error; }
function account(values) {
  if (!Array.isArray(values) || !values.length || values.length > 100 || !values.every(value => typeof value === 'string' && address.test(value))) throw failure('WALLET_INVALID');
  const value = values[0].toLowerCase();
  if (value === '0x' + '0'.repeat(40)) throw failure('WALLET_INVALID');
  return value;
}
export function walletSession(provider, onChange, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12000) throw failure('WALLET_INVALID');
  let version = 0, destroyed = false, interrupt;
  let state = Object.freeze({ status: 'IDLE', address: null, chain: null, error: null });
  const publish = (status, selected = null, chain = null, error = null) => {
    state = Object.freeze({ status, address: selected, chain, error });
    if (!destroyed) onChange(state);
    return state;
  };
  const invalidate = (status) => { version++; interrupt?.(); interrupt = undefined; publish(status); };
  const listeners = [];
  if (provider && typeof provider.on === 'function' && typeof provider.removeListener === 'function') {
    for (const name of ['accountsChanged', 'chainChanged', 'disconnect']) {
      const listener = () => { if (!destroyed && state.status !== 'IDLE') invalidate('CHANGED'); };
      try { provider.on(name, listener); listeners.push([name, listener]); } catch { /* Reconnection still rechecks accounts. */ }
    }
  }
  return {
    get state() { return state; },
    async connect() {
      if (destroyed) return state;
      version++; interrupt?.(); const current = version;
      if (!provider || typeof provider.request !== 'function') return publish('ERROR', null, null, 'WALLET_UNAVAILABLE');
      publish('CONNECTING');
      let timer;
      const abandoned = new Promise((_, reject) => {
        interrupt = () => reject(failure('WALLET_CHANGED'));
        timer = setTimeout(() => reject(failure('WALLET_TIMEOUT')), timeoutMs);
      });
      const request = method => Promise.race([Promise.resolve().then(() => provider.request({ method })), abandoned]);
      try {
        const selected = account(await request('eth_requestAccounts'));
        const chain = await request('eth_chainId');
        if (typeof chain !== 'string' || !/^0x[0-9a-fA-F]{1,16}$/.test(chain)) throw failure('WALLET_INVALID');
        const confirmed = account(await request('eth_accounts'));
        if (confirmed !== selected) throw failure('WALLET_CHANGED');
        if (current !== version || destroyed) return state;
        return publish(BigInt(chain) === 56n ? 'CONNECTED' : 'WRONG_CHAIN', selected, '0x' + BigInt(chain).toString(16));
      } catch (error) {
        if (current !== version || destroyed) return state;
        const code = error?.code === 4001 ? 'WALLET_REJECTED' : errors.has(error?.code) ? error.code : 'WALLET_INVALID';
        return publish('ERROR', null, null, code);
      } finally { clearTimeout(timer); if (current === version) interrupt = undefined; }
    },
    forget() { if (!destroyed) invalidate('IDLE'); },
    destroy() {
      if (destroyed) return;
      destroyed = true; version++; interrupt?.(); interrupt = undefined;
      publish('IDLE');
      for (const [name, listener] of listeners) { try { provider.removeListener(name, listener); } catch { /* Provider cleanup is best effort. */ } }
      listeners.length = 0;
    }
  };
}
