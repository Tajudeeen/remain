import { readFixtureJSON } from './response.js';
import { walletSession } from './wallet.js';

const $ = id => document.getElementById(id);
const checks = ['authenticated_bsc_aggregator', 'supported_bsc_stock_identity', 'market_status_read', 'wallet_balance_covers_input', 'matching_stock_to_usdt_rfq', 'inspectable_bsc_eip712_structure'];
const labels = ['Authenticated BSC data', 'Supported stock identity', 'Selected market readable', 'Held stock covers the input', 'Matching stock-to-USDT RFQ', 'Inspectable unsigned structure'];
const errorHelp = {
  INSUFFICIENT_POSITION: 'The address does not hold the requested stock amount. A held stock is required for this sell inspection.',
  CONFIG_MISSING: 'Add working developer credentials to your local configuration, then restart the local server.',
  AUTH_SIGNATURE_INVALID: 'Binance rejected the API signature. Check the local API key and matching secret.',
  AUTH_KEY_INVALID: 'Binance rejected this API key. Check the developer project.',
  RFQ_OPAQUE: 'The unsigned build cannot be inspected. Signing remains locked.',
  RFQ_UNAVAILABLE: 'No matching stock-to-USDT RFQ is available. Try a supported held stock.',
  QUOTE_EXPIRED: 'The quote expired during inspection. Start a fresh read.',
  MARKET_BLOCKED: 'This market is paused or restricted. Wait for an eligible market state.',
  UNSUPPORTED_ASSET: 'This contract is not a supported BSC stock in the current catalog.',
  UPSTREAM_SCHEMA_INVALID: 'The response failed validation. The inspection remains blocked.',
  UPSTREAM_TIMEOUT: 'Binance timed out. No transaction was submitted.',
  RATE_LIMITED: 'Binance rate-limited this read. Wait before retrying.',
  ACCESS_COMPLIANCE_RESTRICTED: 'Binance restricted access. Check developer-project and operator eligibility with support.'
};
const codes = new Set(['CONFIG_MISSING', 'INVALID_INPUT', 'READ_ONLY_VIOLATION', 'REQUEST_CANCELLED', 'AUTH_KEY_INVALID', 'AUTH_SIGNATURE_INVALID', 'AUTH_CLOCK_DRIFT', 'AUTH_PERMISSION_DENIED', 'RATE_LIMITED', 'UPSTREAM_TIMEOUT', 'ACCESS_REGION_RESTRICTED', 'ACCESS_PROXY_REJECTED', 'ACCESS_IP_RESTRICTED', 'ACCESS_COMPLIANCE_RESTRICTED', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_REJECTED', 'UPSTREAM_SCHEMA_INVALID', 'UNSUPPORTED_ASSET', 'INSUFFICIENT_POSITION', 'MARKET_BLOCKED', 'QUOTE_EXPIRED', 'RFQ_UNAVAILABLE', 'RFQ_OPAQUE']);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export function validateReadiness(value) {
  if (!exact(value, ['kind', 'mode', 'inspectionAvailable', 'deployment', 'executionEnabled', 'liveGate', 'signatureSemantics']) || value.kind !== 'REMAIN_INTEGRATION_READINESS' || value.mode !== 'READ_ONLY_SETUP' || typeof value.inspectionAvailable !== 'boolean' || value.deployment !== (value.inspectionAvailable ? 'LOCAL_ONLY' : 'NOT_CONFIGURED') || value.executionEnabled !== false || value.liveGate !== 'UNVERIFIED' || value.signatureSemantics !== 'UNVERIFIED') throw new Error('INVALID_READINESS');
  return value;
}
export function validateInspection(value) {
  if (!exact(value, ['kind', 'mode', 'status', 'checks', 'errorCode', 'executionEnabled', 'liveGate', 'signatureSemantics', 'ownership']) || value.kind !== 'REMAIN_READ_ONLY_INSPECTION' || !['LIVE_READ_ONLY', 'TEST_FIXTURE'].includes(value.mode) || !['INSPECTED', 'BLOCKED'].includes(value.status) || !Array.isArray(value.checks) || value.checks.length > checks.length || value.checks.some((check, i) => check !== checks[i]) || value.executionEnabled !== false || value.liveGate !== 'UNVERIFIED' || value.signatureSemantics !== 'UNVERIFIED' || value.ownership !== 'NOT_AUTHENTICATED' || (value.status === 'INSPECTED' ? value.checks.length !== checks.length || value.errorCode !== null : !codes.has(value.errorCode))) throw new Error('INVALID_INSPECTION');
  return value;
}

if (typeof document !== 'undefined' && $('live-view')) {
  let available = false, statusController, inspectionController, statusVersion = 0, inspectionVersion = 0;
  const message = (text, error = false) => { $('live-message').textContent = text; $('live-message').classList.toggle('error', error); };
  function invalidate() {
    inspectionVersion++; inspectionController?.abort(); inspectionController = undefined;
    $('live-result').hidden = true; $('live-result').setAttribute('aria-busy', 'false');
    $('live-form').setAttribute('aria-busy', 'false');
    $('live-checks').replaceChildren(); $('live-error').textContent = '';
    update();
  }
  function update() {
    $('live-inspect').disabled = !available || session.state.status !== 'CONNECTED' || Boolean(inspectionController);
  }
  function walletChanged(state) {
    invalidate(); $('wallet-address').textContent = state.address ?? 'No account selected';
    $('wallet-state').textContent = { IDLE: 'Not connected', CONNECTING: 'Waiting for wallet', CONNECTED: 'BSC account selected', WRONG_CHAIN: 'Choose BNB Smart Chain in your wallet', CHANGED: 'Wallet changed. Connect again.', ERROR: 'Account unavailable' }[state.status];
    $('wallet-connect').disabled = state.status === 'CONNECTING';
    $('wallet-forget').disabled = state.status === 'IDLE';
    const help = { WALLET_UNAVAILABLE: 'No browser wallet found. Open Remain in a wallet-enabled browser.', WALLET_REJECTED: 'You declined account access. You can try again.', WALLET_TIMEOUT: 'Account discovery timed out. Close the old wallet prompt before retrying.', WALLET_INVALID: 'The wallet returned an invalid account response.', WALLET_CHANGED: 'The selected account changed during discovery. Connect again.' };
    message(state.error ? help[state.error] : state.status === 'CONNECTED' ? 'Account discovery complete. Ownership is unverified. No signature was requested.' : 'No funds move during setup.', Boolean(state.error));
  }
  let provider, session = walletSession(undefined, walletChanged);
  $('wallet-connect').addEventListener('click', () => {
    if (window.ethereum !== provider) { session.destroy(); provider = window.ethereum; session = walletSession(provider, walletChanged); }
    session.connect();
  });
  $('wallet-forget').addEventListener('click', () => { $('live-token').value = ''; $('live-amount').value = ''; session.forget(); message('Account and inputs cleared from this page. Wallet permissions are managed in your wallet.'); });
  async function refresh() {
    statusController?.abort(); const active = new AbortController(); statusController = active; const current = ++statusVersion;
    available = false; invalidate(); $('live-refresh').disabled = true; $('live-server').textContent = 'Checking server…';
    const timer = setTimeout(() => active.abort(), 5000);
    try {
      const response = await fetch('/api/live/status', { signal: active.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
      const result = validateReadiness(await readFixtureJSON(response, active.signal));
      if (current !== statusVersion) return;
      available = result.inspectionAvailable;
      $('live-server').textContent = available ? 'Local read-only inspector ready' : 'Local setup required';
      $('live-server-copy').textContent = available ? 'Your local server can read Binance data. This does not validate the credentials or enable execution.' : 'This deployment has no Binance credentials. Run the local server to inspect a real held position.';
    } catch {
      if (current !== statusVersion) return;
      $('live-server').textContent = 'Server status unavailable';
      $('live-server-copy').textContent = 'No valid readiness response. Retry the server check.';
    } finally { clearTimeout(timer); if (current === statusVersion) { statusController = undefined; $('live-refresh').disabled = false; update(); } }
  }
  $('live-refresh').addEventListener('click', refresh);
  for (const id of ['live-token', 'live-amount']) $(id).addEventListener('input', () => { invalidate(); message('Input changed. Run a fresh inspection.'); });
  $('live-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!available || session.state.status !== 'CONNECTED' || !$('live-form').reportValidity()) return;
    invalidate(); const active = new AbortController(); inspectionController = active; const current = ++inspectionVersion; update();
    const submitted = { wallet: session.state.address, token: $('live-token').value.trim(), amountRaw: $('live-amount').value.trim() };
    const timer = setTimeout(() => active.abort(), 25000); message('Reading stock identity, held balance, RFQ and unsigned build…');
    $('live-form').setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/live/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted), signal: active.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error();
      const result = validateInspection(await readFixtureJSON(response, active.signal));
      if (current !== inspectionVersion) return;
      $('live-result-label').textContent = result.mode === 'TEST_FIXTURE' ? 'TEST_FIXTURE · injected inspection' : 'LIVE_READ_ONLY · inspected now';
      $('live-result-title').textContent = result.status === 'INSPECTED' ? 'Read path inspected. Signing locked.' : 'Inspection blocked. Nothing submitted.';
      for (let i = 0; i < checks.length; i++) { const li = document.createElement('li'); li.textContent = `${result.checks.includes(checks[i]) ? 'Checked' : 'Pending'} · ${labels[i]}`; $('live-checks').append(li); }
      $('live-error').textContent = result.errorCode ? `${result.errorCode}. ${errorHelp[result.errorCode] ?? 'The read-only request was blocked. Check the developer setup and retry when resolved.'}` : 'Structural checks do not establish order enforcement, ownership or settlement. The global live gate remains unverified.';
      $('live-result').hidden = false; message(result.status === 'INSPECTED' ? 'Read-only inspection complete. Execution remains disabled.' : 'Review the blocked check before trying again.', result.status !== 'INSPECTED');
    } catch {
      if (current !== inspectionVersion) return;
      message(active.signal.aborted ? 'Inspection timed out. No transaction was submitted.' : 'No valid inspection result. Check the local server and try again.', true);
    } finally {
      clearTimeout(timer);
      if (current === inspectionVersion) { inspectionController = undefined; $('live-form').setAttribute('aria-busy', 'false'); update(); }
    }
  });
  window.addEventListener('pagehide', () => { statusVersion++; inspectionVersion++; statusController?.abort(); inspectionController?.abort(); session.destroy(); });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    provider = undefined; session = walletSession(undefined, walletChanged); walletChanged(session.state);
    if (location.hash === '#live') refresh();
  });
  window.addEventListener('hashchange', () => { if (location.hash === '#live') refresh(); else { invalidate(); $('live-form').setAttribute('aria-busy', 'false'); } });
  if (location.hash === '#live') refresh();
}
