import { readFixtureJSON } from './response.js';
import { walletSession } from './wallet.js';
import { validatePosition, formatPositionUnits, preparePositionAmount } from './position.js';

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
  let positionController, positionVersion = 0, positionSnapshot, positionReceived, positionAge, positionTimer;
  function clearPosition() {
    positionVersion++; positionController?.abort(); positionController = undefined; clearTimeout(positionTimer);
    positionSnapshot = undefined; positionReceived = undefined; positionAge = undefined;
    $('position-result').hidden = true; $('position-panel').setAttribute('aria-busy', 'false');
    for (const id of ['position-label', 'position-stock', 'position-balance', 'position-details']) $(id).textContent = '';
    $('position-units').value = ''; $('position-units').disabled = true; $('position-use').disabled = true;
    $('position-message').textContent = 'Read a fresh selected position locally. Missing data stays unknown.';
    $('position-message').classList.remove('error');
  }
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
    $('position-read').disabled = !available || session.state.status !== 'CONNECTED' || Boolean(positionController);
  }
  function walletChanged(state) {
    clearPosition(); $('live-amount').value = '';
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
    available = false; clearPosition(); invalidate(); $('live-refresh').disabled = true; $('live-server').textContent = 'Checking server…';
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
  $('live-token').addEventListener('input', () => { clearPosition(); $('live-amount').value = ''; invalidate(); message('Stock changed. Read a fresh position or enter a verified raw amount.'); });
  $('live-amount').addEventListener('input', () => { invalidate(); message('Amount changed. Run a fresh inspection.'); });
  $('position-read').addEventListener('click', async () => {
    if (!available || session.state.status !== 'CONNECTED' || !$('live-token').reportValidity()) return;
    clearPosition(); invalidate(); const active = new AbortController(); positionController = active; const current = ++positionVersion; update();
    const submitted = { wallet: session.state.address, token: $('live-token').value.trim() };
    const started = performance.now(); const timer = setTimeout(() => active.abort(), 25000);
    $('position-panel').setAttribute('aria-busy', 'true'); $('position-message').textContent = 'Reading stock identity and reported position. No quote or build is requested…';
    try {
      const response = await fetch('/api/live/position', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted), signal: active.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
      if (!response.ok) throw new Error();
      const body = await readFixtureJSON(response, active.signal);
      if (current !== positionVersion) return;
      const receivedAt = Date.now(); const result = validatePosition(body, submitted, receivedAt);
      // Independent elapsed time prevents a wall-clock rollback from extending this read.
      const elapsed = performance.now() - started;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 25000) throw new Error();
      positionSnapshot = result; positionReceived = performance.now(); positionAge = receivedAt - result.observedAtMs;
      $('position-label').textContent = `${result.mode} · API observation`;
      $('position-stock').textContent = `${result.stock.symbol} / ${result.stock.ticker}`;
      $('position-balance').textContent = result.balanceRaw === null ? 'Balance unknown' : `${formatPositionUnits(result.balanceRaw, result.stock.decimals)} ${result.stock.symbol}`;
      $('position-details').textContent = `${result.stock.issuer} · ${result.stock.decimals} decimals · ${result.pagesRead} balance page${result.pagesRead === 1 ? '' : 's'} read. Ownership and live feasibility remain unverified.`;
      $('position-message').textContent = { HELD_OBSERVED: 'Positive raw holding reported. You can prepare an exact inspection amount.', ZERO_OBSERVED: 'An explicit zero balance was reported. A held stock is needed for RFQ inspection.', RAW_UNAVAILABLE: 'The stock was reported without a raw balance. Amount preparation is unavailable.', NOT_REPORTED: 'The selected stock was not reported in the returned pages. Its balance is unknown.', INCOMPLETE: 'The ten-page read limit was reached. The selected balance remains unknown.' }[result.status];
      $('position-units').disabled = result.status !== 'HELD_OBSERVED'; $('position-use').disabled = result.status !== 'HELD_OBSERVED';
      $('position-result').hidden = false;
      positionTimer = setTimeout(() => {
        if (current !== positionVersion) return;
        positionSnapshot = undefined; $('position-units').disabled = true; $('position-use').disabled = true;
        $('position-message').textContent = 'Position observation expired. Read again before preparing an amount.';
      }, Math.max(0, 15000 - positionAge));
    } catch {
      if (current !== positionVersion) return;
      clearPosition(); $('position-message').textContent = active.signal.aborted ? 'Position read timed out. Nothing submitted.' : 'No valid selected-position response. Read again after checking the local server.'; $('position-message').classList.add('error');
    } finally {
      clearTimeout(timer); if (current === positionVersion) { positionController = undefined; $('position-panel').setAttribute('aria-busy', 'false'); update(); }
      else update();
    }
  });
  $('position-use').addEventListener('click', () => {
    if (!positionSnapshot || !available || session.state.status !== 'CONNECTED') return;
    try {
      const raw = preparePositionAmount($('position-units').value.trim(), positionSnapshot, { wallet: session.state.address, token: $('live-token').value.trim() }, Date.now(), positionAge + performance.now() - positionReceived);
      invalidate(); $('live-amount').value = raw; message('Exact raw amount set. Press Inspect held-stock RFQ to request a fresh read.');
    } catch (error) {
      const help = { AMOUNT_PRECISION: 'This amount has more decimal places than the selected stock supports.', AMOUNT_EXCEEDS_BALANCE: 'The amount exceeds the reported raw holding.', AMOUNT_INVALID: 'Enter a positive plain decimal amount. No signs, exponents or leading zeroes.', POSITION_UNKNOWN: 'A positive raw holding is required.', INVALID_POSITION: 'The position is stale or no longer matches this account and stock. Read again.', POSITION_EXPIRED: 'The position expired. Read again before preparing an amount.' };
      message(help[error.message] ?? 'The amount cannot be represented as a positive uint256 value.', true);
    }
  });
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
  window.addEventListener('pagehide', () => { clearPosition(); statusVersion++; inspectionVersion++; statusController?.abort(); inspectionController?.abort(); session.destroy(); });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    provider = undefined; session = walletSession(undefined, walletChanged); walletChanged(session.state);
    if (location.hash === '#live') refresh();
  });
  window.addEventListener('hashchange', () => { if (location.hash === '#live') refresh(); else { clearPosition(); invalidate(); $('live-form').setAttribute('aria-busy', 'false'); } });
  if (location.hash === '#live') refresh();
}
