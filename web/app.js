import './proof.js';

const $ = (id) => document.getElementById(id);
const form = $('plan-form');
const bar = $('position-bar');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function route(focus = false) {
  const hash = location.hash;
  const dashboard = ['#dashboard', '#planner', '#cash-target'].includes(hash);
  const proof = ['#proof', '#receipt'].includes(hash);
  $('landing-view').hidden = dashboard || proof;
  $('dashboard-view').hidden = !dashboard;
  $('proof-view').hidden = !proof;
  document.title = proof ? 'Receipt inspection | Remain' : dashboard ? 'Cash planner | Remain' : 'Remain | Raise cash. Stay invested.';
  for (const link of document.querySelectorAll('nav a')) {
    if (link.getAttribute('href') === (proof ? '#proof' : dashboard ? '#dashboard' : hash)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const target = hash === '#how-it-works' ? $('how-title') : hash === '#about' ? $('trust-title') : proof ? $('proof-title') : dashboard ? $('intro-title') : $('landing-title');
  if (focus) { target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: 'auto', block: 'start' }); }
}
window.addEventListener('hashchange', () => route(true));
// Re-clicking the current route must still focus its heading.
for (const link of document.querySelectorAll('a[href^="#"]')) link.addEventListener('click', () => {
  if (link.getAttribute('href') === location.hash) route(true);
});
route(Boolean(location.hash));
let splashTimer;
function dismissSplash(focus = false) {
  clearTimeout(splashTimer); $('splash').hidden = true; $('site-content').inert = false;
  try { sessionStorage.setItem('remain-introduced', 'yes'); } catch { /* Navigation must work without storage. */ }
  if (focus) route(true);
}
let introduced = false;
try { introduced = sessionStorage.getItem('remain-introduced') === 'yes'; } catch { /* Storage is optional. */ }
if (!introduced && !reducedMotion.matches && !location.hash) {
  $('splash').hidden = false; $('site-content').inert = true;
  splashTimer = setTimeout(() => dismissSplash(), 1800);
}
$('skip-splash').addEventListener('click', () => dismissSplash(true));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('splash').hidden) dismissSplash(true); });
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) dismissSplash(); });
const cells = Array.from({ length: 100 }, () => { const cell = document.createElement('span'); cell.className = 'bar-cell'; cell.setAttribute('aria-hidden', 'true'); bar.append(cell); return cell; });
let version = 0;
let controller;
let record;
let freshnessTimer;
let inputFingerprint = JSON.stringify(input());
const explanations = {
  FLOOR_BREACH: 'The retained floor leaves no stock available to sell.',
  CLOSED_MARKET_PERMISSION_REQUIRED: 'Closed-market planning needs your explicit permission.',
  MARKET_BLOCKED: 'The market is paused or unavailable. Permission cannot override this block.',
  NO_SAFE_QUOTE_IN_SEARCH: 'No quote met every rule within the bounded search.',
  IMPACT_LIMIT: 'The fixture’s 0.20% impact exceeds your chosen cap.',
  CASH_TARGET_SHORTFALL: 'The minimum cash from this candidate is below your target.',
  SURPLUS_LIMIT: 'This candidate would release more extra cash than the one-USDT fixture limit.',
  SLIPPAGE_LIMIT: 'The quoted output bounds exceed the slippage cap.'
};
function input() {
  return { cashTarget: $('cash-target').value, retainPercent: Number($('retain').value),
    maxImpactPercent: $('impact').value, market: $('market').value, allowClosedMarket: $('closed-permission').checked };
}
function message(text, error = false) { $('form-message').textContent = text; $('form-message').classList.toggle('error', error); }
function clearPreview(text = 'Settings changed. Calculate a new plan to inspect the result.') {
  record = undefined; clearInterval(freshnessTimer); $('download').disabled = true;
  $('retained-number').textContent = '—'; $('stock-debit').textContent = '—'; $('minimum-cash').textContent = '—';
  $('verdict-pill').textContent = 'Awaiting plan'; $('verdict-pill').className = 'verdict-pill';
  $('freshness').textContent = 'No result yet'; $('verdict-copy').textContent = text;
  $('guard-details').replaceChildren(); cells.forEach((cell) => { cell.className = 'bar-cell'; });
  bar.setAttribute('aria-label', 'No current sell plan calculated');
}
function invalidate() {
  const fingerprint = JSON.stringify(input());
  // Number fields and browser automation can emit a delayed/duplicate input
  // notification after blur. An unchanged intent must not cancel its plan.
  if (fingerprint === inputFingerprint) return;
  inputFingerprint = fingerprint;
  version++; controller?.abort(); controller = undefined;
  $('plan-button').disabled = false; $('plan-preview').setAttribute('aria-busy', 'false');
  $('retain-value').textContent = `${$('retain').value}%`; $('floor-units').textContent = $('retain').value;
  $('available-units').textContent = String(100 - Number($('retain').value));
  clearPreview(); message('Settings changed. Recalculate before reviewing.');
}
form.addEventListener('input', invalidate);
function cash(raw) {
  // Exact integer formatting. Display strings never feed monetary arithmetic.
  const amount = BigInt(raw); const whole = amount / 10n ** 18n;
  const fraction = (amount % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}.${(fraction || '0').padEnd(2, '0')}`;
}
function detail(text, warning = false) {
  const row = document.createElement('li'); row.textContent = text;
  if (warning) row.classList.add('warning'); $('guard-details').append(row);
}
function render(result) {
  const plan = result.plan;
  if (result.kind !== 'SYNTHETIC_PLANNING_RECORD' || result.mode !== 'TEST_FIXTURE' || result.executionEnabled !== false || plan.mode !== 'TEST_FIXTURE' || plan.executionEnabled !== false) throw new Error('Unexpected rehearsal response');
  if (!['PLANNED_FOR_REVIEW', 'BLOCKED'].includes(plan.status)) throw new Error('Unexpected status');
  const passed = plan.status === 'PLANNED_FOR_REVIEW';
  const pill = $('verdict-pill'); pill.textContent = passed ? 'Plan available' : 'Plan blocked'; pill.className = `verdict-pill ${passed ? 'pass' : 'blocked'}`;
  $('guard-details').replaceChildren();
  if (passed) {
    const amounts = plan.candidate.verdict.amounts;
    const remaining = BigInt(amounts.remainingStockRaw);
    if (remaining < 0n || remaining > 100n) throw new Error('Unexpected retained amount');
    $('retained-number').textContent = remaining.toString();
    $('stock-debit').textContent = amounts.totalStockDebitRaw;
    $('minimum-cash').textContent = cash(amounts.minimumNetCashRaw);
    cells.forEach((cell, index) => { cell.className = `bar-cell ${BigInt(index) < remaining ? 'retained' : 'released'}`; });
    bar.setAttribute('aria-label', `${remaining} demo units retained, ${amounts.totalStockDebitRaw} released from the 100-unit fictional position`);
    $('verdict-copy').textContent = `Sell ${amounts.totalStockDebitRaw} demo units for at least ${cash(amounts.minimumNetCashRaw)} synthetic USDT. ${remaining} units would remain.`;
    detail(`Retained floor met: ${remaining} units remain against a ${amounts.retainedFloorRaw}-unit minimum.`);
    detail(`Cash target met: ${cash(amounts.minimumNetCashRaw)} against ${cash(plan.intent.cashTargetRaw)} USDT.`);
    detail(`Synthetic impact 0.20% is within your ${cashPercent(plan.intent.maxImpactBps)}% cap.`);
    if (!plan.intent.market.openState) detail('Closed-market rehearsal explicitly permitted. This does not authorize a trade.', true);
    detail('Minimum output and zero fees are fixture assumptions. Live enforcement is unverified.', true);
  } else {
    $('retained-number').textContent = '—'; $('stock-debit').textContent = '—'; $('minimum-cash').textContent = '—';
    cells.forEach((cell) => { cell.className = 'bar-cell'; }); bar.setAttribute('aria-label', 'Blocked plan. No sell amount selected');
    $('verdict-copy').textContent = 'Your rules blocked this plan. No sell amount was selected.';
    for (const reason of plan.reasons) detail(explanations[reason] || `Planning check: ${reason}`, true);
    const outcomes = new Set(plan.attempts.flatMap((attempt) => attempt.outcomes.flatMap((outcome) => outcome.verdict.reasons)));
    for (const reason of ['IMPACT_LIMIT', 'CASH_TARGET_SHORTFALL', 'SURPLUS_LIMIT']) if (outcomes.has(reason)) detail(explanations[reason], true);
  }
  detail(`${plan.attempts.length} synthetic quote inputs checked. Smallest safe observed debit, not a global guarantee.`);
  record = result; $('download').disabled = false;
  const updateFreshness = () => {
    const seconds = Math.max(0, Math.ceil((result.reviewUntilMs - Date.now()) / 1000));
    $('freshness').textContent = passed ? seconds ? `Review window · ${seconds}s` : 'Snapshot expired' : 'Blocked snapshot';
    if (passed && !seconds) {
      pill.textContent = 'Snapshot expired'; pill.className = 'verdict-pill';
      message('Snapshot expired. Recalculate for a fresh rehearsal. The downloaded record stays historical.');
      clearInterval(freshnessTimer);
    }
  };
  updateFreshness(); if (passed) freshnessTimer = setInterval(updateFreshness, 250);
}
function cashPercent(bps) { return `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, '0')}`; }
form.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!form.reportValidity()) return;
  const submitted = input(); inputFingerprint = JSON.stringify(submitted);
  controller?.abort(); const active = new AbortController(); controller = active;
  const current = ++version; clearPreview('Checking the synthetic quotes against your rules.');
  $('plan-button').disabled = true; $('plan-preview').setAttribute('aria-busy', 'true'); message('Checking your cash target and retained floor…');
  const timeout = setTimeout(() => active.abort(), 4000);
  try {
    const response = await fetch('/api/rehearse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted), signal: active.signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 429 ? 'Please wait a minute before another rehearsal.' : 'Couldn’t calculate this rehearsal. Check your inputs and try again.');
    const result = await response.json();
    if (current !== version) return;
    render(result); message(result.plan.status === 'PLANNED_FOR_REVIEW' ? 'Synthetic plan checked. Execution remains disabled.' : 'BellGuard blocked this rehearsal. Review the reasons.');
  } catch (error) {
    if (current !== version) return;
    clearPreview('No valid result. Please retry the rehearsal.');
    message(active.signal.aborted ? 'Rehearsal timed out. Please try again.' : error instanceof Error ? error.message : 'Rehearsal unavailable.', true);
  } finally {
    clearTimeout(timeout);
    if (current === version) { $('plan-button').disabled = false; $('plan-preview').setAttribute('aria-busy', 'false'); controller = undefined; }
  }
});
$('download').addEventListener('click', () => {
  if (!record) return;
  const blob = new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `remain-synthetic-plan-${record.plan.planHash.slice(0, 12)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const button of document.querySelectorAll('[data-scenario]')) button.addEventListener('click', () => {
  $('cash-target').value = button.dataset.scenario === 'floor' ? '40' : '25';
  $('retain').value = '70'; $('impact').value = '0.50'; $('market').value = button.dataset.scenario === 'closed' ? 'closed' : 'regular';
  $('closed-permission').checked = false; invalidate(); form.requestSubmit();
});
