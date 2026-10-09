import { readFixtureJSON, readReadOnlyJSON } from './response.js';
import { walletSession } from './wallet.js';
import { validatePosition, formatPositionUnits, preparePositionAmount } from './position.js';
import { previewInput, validatePreview } from './preview.js';
import { candidateForReview, validateOrderReview } from './order-review.js';

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
  if (!exact(value, ['kind', 'mode', 'inspectionAvailable', 'deployment', 'executionEnabled', 'liveGate', 'signatureSemantics']) || value.kind !== 'REMAIN_INTEGRATION_READINESS' || value.mode !== 'READ_ONLY_SETUP' || typeof value.inspectionAvailable !== 'boolean' || !(value.inspectionAvailable ? ['LOCAL_ONLY', 'HOSTED_READ_ONLY'].includes(value.deployment) : value.deployment === 'NOT_CONFIGURED') || value.executionEnabled !== false || value.liveGate !== 'UNVERIFIED' || value.signatureSemantics !== 'UNVERIFIED') throw new Error('INVALID_READINESS');
  return value;
}
export function validateInspection(value) {
  if (!exact(value, ['kind', 'mode', 'status', 'checks', 'errorCode', 'executionEnabled', 'liveGate', 'signatureSemantics', 'ownership']) || value.kind !== 'REMAIN_READ_ONLY_INSPECTION' || !['LIVE_READ_ONLY', 'TEST_FIXTURE'].includes(value.mode) || !['INSPECTED', 'BLOCKED'].includes(value.status) || !Array.isArray(value.checks) || value.checks.length > checks.length || value.checks.some((check, i) => check !== checks[i]) || value.executionEnabled !== false || value.liveGate !== 'UNVERIFIED' || value.signatureSemantics !== 'UNVERIFIED' || value.ownership !== 'NOT_AUTHENTICATED' || (value.status === 'INSPECTED' ? value.checks.length !== checks.length || value.errorCode !== null : !codes.has(value.errorCode))) throw new Error('INVALID_INSPECTION');
  return value;
}

if (typeof document !== 'undefined' && $('live-view')) {
  let available = false, statusController, inspectionController, statusVersion = 0, inspectionVersion = 0;
  let positionController, positionVersion = 0, positionSnapshot, positionReceived, positionAge, positionTimer;
  let previewController, previewVersion = 0, previewTimer, previewSnapshot, previewReceived, previewAge;
  let reviewController, reviewVersion = 0, reviewTimer;
  function clearReview() {
    reviewVersion++; reviewController?.abort(); reviewController = undefined; clearTimeout(reviewTimer);
    $('cash-review-result').hidden = true;
    for (const id of ['cash-review-label', 'cash-review-sale', 'cash-review-before', 'cash-review-after', 'cash-review-details', 'cash-review-proof']) $(id).textContent = '';
    $('cash-review-message').textContent = 'Choose a fresh cash candidate to review its unsigned order.';
    $('cash-review-message').classList.remove('error');
  }
  function clearPreview() {
    clearReview(); previewSnapshot = undefined; previewReceived = undefined; previewAge = undefined;
    previewVersion++; previewController?.abort(); previewController = undefined; clearTimeout(previewTimer);
    $('cash-preview-result').hidden = true; $('cash-preview-panel').setAttribute('aria-busy', 'false');
    for (const id of ['cash-preview-label', 'cash-preview-title', 'cash-preview-sale', 'cash-preview-retained', 'cash-preview-output', 'cash-preview-details']) $(id).textContent = '';
    $('cash-preview-message').textContent = 'Fresh holding, market and bounded RFQ estimates. Nothing is signed.';
    $('cash-preview-message').classList.remove('error');
  }
  function clearPosition() {
    clearPreview();
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
    const busy = Boolean(inspectionController || previewController || positionController || reviewController);
    $('live-inspect').disabled = !available || session.state.status !== 'CONNECTED' || busy;
    $('position-read').disabled = !available || session.state.status !== 'CONNECTED' || busy;
    $('cash-preview').disabled = !available || session.state.status !== 'CONNECTED' || busy;
    $('cash-preview-cancel').disabled = !previewController;
    $('cash-review').disabled = !available || session.state.status !== 'CONNECTED' || busy || !previewSnapshot?.candidate;
    $('cash-review-cancel').disabled = !reviewController;
    $('cash-trade').disabled = !available || session.state.status !== 'CONNECTED' || busy || !previewSnapshot?.candidate;
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
  $('wallet-forget').addEventListener('click', () => {
    $('live-token').value = ''; $('live-amount').value = ''; $('cash-preview-target').value = '';
    $('cash-preview-retain').value = '70'; $('cash-preview-impact').value = '50'; $('cash-preview-closed').checked = false;
    session.forget(); message('Account and inputs cleared from this page. Wallet permissions are managed in your wallet.');
  });
  async function refresh() {
    statusController?.abort(); const active = new AbortController(); statusController = active; const current = ++statusVersion;
    available = false; clearPosition(); invalidate(); $('live-refresh').disabled = true; $('live-server').textContent = 'Checking server…';
    const timer = setTimeout(() => active.abort(), 5000);
    try {
      const response = await fetch('/api/live/status', { signal: active.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
      const result = validateReadiness(await readFixtureJSON(response, active.signal));
      if (current !== statusVersion) return;
      available = result.inspectionAvailable;
      $('live-server').textContent = available ? (result.deployment === 'HOSTED_READ_ONLY' ? 'Live market service connected' : 'Local read-only inspector ready') : 'Local setup required';
      $('live-server-copy').textContent = available ? (result.deployment === 'HOSTED_READ_ONLY' ? 'Live BSC stock positions, market checks and RFQ estimates are available from the server. Your wallet must hold a supported asset. Trading requires separate execution readiness.' : 'Your local server can read Binance data. This does not validate the credentials or enable execution.') : 'The Binance read-only service is not configured for this deployment. Wallet-native BSC token balance verification is still available.';
    } catch {
      if (current !== statusVersion) return;
      $('live-server').textContent = 'Server status unavailable';
      $('live-server-copy').textContent = 'No valid readiness response. Retry the server check.';
    } finally { clearTimeout(timer); if (current === statusVersion) { statusController = undefined; $('live-refresh').disabled = false; update(); } }
  }
  $('live-refresh').addEventListener('click', refresh);
  $('live-token').addEventListener('input', () => { clearPosition(); $('live-amount').value = ''; invalidate(); message('Stock changed. Read a fresh position or enter a verified raw amount.'); });
  $('live-amount').addEventListener('input', () => { clearPreview(); invalidate(); message('Amount changed. Run a fresh inspection.'); });
  for (const id of ['cash-preview-target', 'cash-preview-retain', 'cash-preview-impact', 'cash-preview-closed']) $(id).addEventListener('input', () => { clearPreview(); update(); });
  $('cash-preview-cancel').addEventListener('click', () => { clearPreview(); $('cash-preview-message').textContent = 'Preview cancelled. Nothing submitted.'; update(); });
  $('cash-preview').addEventListener('click', async () => {
    if (!available || session.state.status !== 'CONNECTED' || previewController || inspectionController || positionController || reviewController || !$('live-token').reportValidity() ||
        !['cash-preview-target', 'cash-preview-retain', 'cash-preview-impact'].every(id => $(id).reportValidity())) return;
    let submitted;
    try { submitted = previewInput({ wallet: session.state.address, token: $('live-token').value.trim(), cashTarget: $('cash-preview-target').value.trim(),
      retainBps: Number($('cash-preview-retain').value) * 100, maxImpactBps: Number($('cash-preview-impact').value), allowClosedMarket: $('cash-preview-closed').checked }); }
    catch { clearPreview(); $('cash-preview-message').textContent = 'Enter a positive plain cash amount and valid exposure and impact limits.'; $('cash-preview-message').classList.add('error'); update(); return; }
    clearPosition(); invalidate(); const active = new AbortController(); previewController = active; const current = ++previewVersion; update();
    const started = performance.now(), startedWall = Date.now(), timer = setTimeout(() => active.abort(), 15000);
    $('cash-preview-panel').setAttribute('aria-busy', 'true'); $('cash-preview-message').textContent = 'Reading a fresh position and market, then sampling up to eight RFQ inputs…';
    try {
      const response = await fetch('/api/live/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted), signal: active.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
      const body = await readReadOnlyJSON(response, active.signal);
      if (current !== previewVersion) return;
      if (!response.ok) {
        const code = exact(body, ['code']) && codes.has(body.code) ? body.code : 'UPSTREAM_SCHEMA_INVALID';
        $('cash-preview-message').textContent = `${code}. ${errorHelp[code] ?? 'The preview was blocked. Check local setup and request a fresh read.'}`;
        $('cash-preview-message').classList.add('error'); return;
      }
      const at = Date.now(), result = validatePreview(body, submitted, at), elapsed = performance.now() - started;
      if (active.signal.aborted || at < startedWall || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 15000) throw new Error();
      const age = at - result.position.observedAtMs;
      previewSnapshot = result; previewReceived = performance.now(); previewAge = age;
      $('cash-preview-label').textContent = `${result.mode} · ESTIMATED OUTPUT`;
      $('cash-preview-title').textContent = result.candidate ? 'A cash candidate. Signing locked.' : 'No qualifying candidate observed.';
      if (result.candidate) {
        const probe = result.probes[result.candidate.probeIndex], route = probe.routes[result.candidate.routeIndex];
        $('cash-preview-sale').textContent = `${formatPositionUnits(probe.inputRaw, result.position.stock.decimals)} ${result.position.stock.symbol}`;
        $('cash-preview-retained').textContent = `${formatPositionUnits((BigInt(result.position.balanceRaw) - BigInt(probe.inputRaw)).toString(), result.position.stock.decimals)} ${result.position.stock.symbol}`;
        $('cash-preview-output').textContent = `${formatPositionUnits(route.estimatedOutputRaw, result.cashDecimals)} USDT`;
        $('cash-preview-details').textContent = `${route.vendor} · reported impact ${route.impactPercent}% · ${result.market.marketStatus}. Smallest qualifying input observed in ${result.probes.length} probes. Global minimum unproven.`;
      } else {
        $('cash-preview-sale').textContent = 'No candidate'; $('cash-preview-retained').textContent = 'No sale proposed'; $('cash-preview-output').textContent = 'No qualifying estimate';
        $('cash-preview-details').textContent = `${result.probes.length} bounded probes · ${result.market.marketStatus}. Missing impact, your limit or the cash target can rule out a quote. Search exhaustion does not prove the target impossible.`;
      }
      $('cash-preview-message').textContent = 'Estimates before unresolved fees. Retained quantity is before any additional stock debit. Minimum payout, total debit, quote expiry and signing semantics remain unverified.';
      $('cash-preview-result').hidden = false;
      previewTimer = setTimeout(() => { if (current !== previewVersion) return; clearPreview(); $('cash-preview-message').textContent = 'Position observation expired. Request a fresh preview.'; update(); }, Math.max(0, 15000 - age));
    } catch {
      if (current !== previewVersion) return;
      const timedOut = active.signal.aborted;
      clearPreview(); $('cash-preview-message').textContent = timedOut ? 'Preview timed out. Nothing submitted.' : 'No valid cash preview. Check the local server and retry.'; $('cash-preview-message').classList.add('error');
    } finally {
      clearTimeout(timer); if (current === previewVersion) { previewController = undefined; $('cash-preview-panel').setAttribute('aria-busy', 'false'); } update();
    }
  });
  $('cash-review-cancel').addEventListener('click', () => { clearReview(); $('cash-review-message').textContent = 'Order review cancelled. Nothing signed or submitted.'; update(); });
  $('cash-trade').addEventListener('click', () => {
    if (!previewSnapshot || session.state.status !== 'CONNECTED') return;
    try {
      const elapsed = performance.now() - previewReceived;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed + previewAge >= 15000) throw new Error('EXPIRED');
      window.dispatchEvent(new CustomEvent('remain-cash-selection', { detail: previewSnapshot }));
    } catch { $('cash-review-message').textContent = 'Request a fresh cash preview before sale review.'; }
  });
  $('cash-review').addEventListener('click', async () => {
    if (!available || session.state.status !== 'CONNECTED' || !previewSnapshot?.candidate || reviewController || previewController || positionController || inspectionController) return;
    let submitted;
    try {
      const elapsed = performance.now() - previewReceived;
      if (!Number.isFinite(elapsed) || elapsed < 0 || previewAge + elapsed > 15000) throw new Error();
      submitted = candidateForReview(previewSnapshot, Date.now());
    } catch { clearPreview(); $('cash-review-message').textContent = 'Candidate expired. Explore a fresh cash target.'; update(); return; }
    clearReview(); const active = new AbortController(); reviewController = active; const current = ++reviewVersion; update();
    const started = performance.now(), startedWall = Date.now(), timer = setTimeout(() => active.abort(), 15000);
    $('cash-review-message').textContent = 'Rereading the holding and market, then refreshing this exact input and venue. No signature requested…';
    try {
      const response = await fetch('/api/live/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted), signal: active.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
      const body = await readReadOnlyJSON(response, active.signal);
      if (current !== reviewVersion) return;
      if (!response.ok) {
        const code = exact(body, ['code']) && codes.has(body.code) ? body.code : 'UPSTREAM_SCHEMA_INVALID';
        $('cash-review-message').textContent = `${code}. ${errorHelp[code] ?? 'The unsigned review was blocked. Explore a fresh candidate.'}`;
        $('cash-review-message').classList.add('error'); return;
      }
      const at = Date.now(), result = validateOrderReview(body, submitted, at), elapsed = performance.now() - started;
      if (active.signal.aborted || at < startedWall || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 15000) throw new Error();
      const p = result.preview, route = p.probes[0].routes[0];
      $('cash-review-label').textContent = `${p.mode} · UNSIGNED STRUCTURE ONLY`;
      $('cash-review-sale').textContent = `${formatPositionUnits(submitted.amountRaw, p.position.stock.decimals)} ${p.position.stock.symbol}`;
      $('cash-review-before').textContent = `${formatPositionUnits(submitted.expectedOutputRaw, p.cashDecimals)} USDT`;
      $('cash-review-after').textContent = `${formatPositionUnits(route.estimatedOutputRaw, p.cashDecimals)} USDT`;
      $('cash-review-details').textContent = `${submitted.vendor} · ${p.market.marketStatus} · reported impact ${route.impactPercent}%. ${result.estimateChanged ? 'The estimate changed. Review the fresh value.' : 'The estimated cash amount is unchanged.'} This is one selected input, not another search.`;
      $('cash-review-proof').textContent = `Unsigned build matches the fresh quote. ${result.rfqReview.typeCount} types, ${result.rfqReview.fieldCount} fields structurally checked. Artifact checksum ${result.rfqReview.artifactChecksum}. This JSON checksum is not an EIP-712 signing hash.`;
      $('cash-review-message').textContent = 'Signed receiver, total debit, minimum payout, fees, spender, nonce and deadline still need vendor verification. Trading remains locked.';
      $('cash-review-result').hidden = false;
      reviewTimer = setTimeout(() => { if (current !== reviewVersion) return; clearReview(); $('cash-review-message').textContent = 'Unsigned review expired. Request a fresh candidate.'; update(); }, Math.max(0, 15000 - (at - p.position.observedAtMs)));
    } catch {
      if (current !== reviewVersion) return;
      const timedOut = active.signal.aborted; clearReview();
      $('cash-review-message').textContent = timedOut ? 'Order review timed out. Nothing submitted.' : 'No valid unsigned review. Check the local server and retry.';
      $('cash-review-message').classList.add('error');
    } finally { clearTimeout(timer); if (current === reviewVersion) reviewController = undefined; update(); }
  });
  $('position-read').addEventListener('click', async () => {
    if (!available || session.state.status !== 'CONNECTED' || inspectionController || positionController || previewController || reviewController || !$('live-token').reportValidity()) return;
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
    event.preventDefault(); if (!available || session.state.status !== 'CONNECTED' || reviewController || previewController || positionController || inspectionController || !$('live-form').reportValidity()) return;
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
