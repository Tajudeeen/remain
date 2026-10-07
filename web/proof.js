import { readFixtureText, readFixtureJSON, validateReceiptReport } from './response.js';
const $ = id => document.getElementById(id);
const maxBytes = 262144;
let text;
let report;
let version = 0;
let controller;
const explanations = {
  DUPLICATE_KEY: 'Duplicate fields make this file ambiguous.',
  SUMMARY_MISMATCH: 'The reported totals differ from the recomputed journal.',
  EVENT_HASH: 'An event differs from its recorded checksum.',
  EVENT_CHAIN: 'The event chain is broken.',
  JOURNAL_TAIL: 'The journal tail differs from its recorded checksum.',
  RECEIPT_CHECKSUM: 'The supplied file differs from its receipt checksum.',
  PROVENANCE_MISMATCH: 'This verifier accepts only unauthenticated fixture receipts.'
};
function message(value, error = false) {
  $('receipt-message').textContent = value;
  $('receipt-message').classList.toggle('error', error);
}
function resetResult() {
  report = undefined;
  $('receipt-result').setAttribute('aria-busy', 'false');
  $('receipt-report').disabled = true;
  $('receipt-status').textContent = 'Awaiting receipt';
  $('receipt-status').className = 'verdict-pill';
  $('receipt-headline').textContent = 'Every claim has a trail.';
  $('receipt-copy').textContent = 'Load the demo or choose a fixture receipt. We’ll replay its event chain and check its totals.';
  $('receipt-facts').hidden = true;
  $('receipt-reasons').replaceChildren();
  $('receipt-checksum').textContent = 'No file checked';
}
function invalidate() {
  ++version; controller?.abort(); controller = undefined; text = undefined;
  resetResult(); $('receipt-verify').disabled = true; $('receipt-demo').disabled = false;
  $('receipt-selection').textContent = 'No file selected';
}
async function run(load) {
  const current = ++version; controller?.abort();
  const active = new AbortController(); controller = active;
  resetResult(); $('receipt-result').setAttribute('aria-busy', 'true');
  $('receipt-verify').disabled = true; $('receipt-demo').disabled = true;
  message(load ? 'Loading the fictional receipt…' : 'Checking the supplied fixture…');
  const timeout = setTimeout(() => active.abort(), 6000);
  let failureMessage = 'Inspection unavailable or invalid. Please retry.';
  try {
    if (load) {
      text = undefined; $('receipt-file').value = '';
      const sample = await fetch('/demo-receipt.json', { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: active.signal });
      if (!sample.ok) { failureMessage = 'The demo file is unavailable. Please retry.'; throw new Error(); }
      const loaded = await readFixtureText(sample, active.signal);
      if (current !== version) return;
      text = loaded; $('receipt-selection').textContent = 'Demo receipt · entirely fictional';
    }
    if (!text) throw new Error('Choose a fixture receipt first.');
    const response = await fetch('/api/receipt/verify', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: text, cache: 'no-store',
      credentials: 'omit', redirect: 'error', signal: active.signal });
    if (!response.ok) { failureMessage = response.status === 429 ? 'Please wait a minute, then retry.' : response.status === 413 ? 'The file exceeds 256 KiB.' : failureMessage; throw new Error(); }
    const result = validateReceiptReport(await readFixtureJSON(response, active.signal));
    if (current !== version) return;
    const passed = result.status === 'CONSISTENT_FIXTURE';
    report = result;
    $('receipt-status').textContent = passed ? 'Consistent fixture' : 'Rejected';
    $('receipt-status').className = `verdict-pill ${passed ? 'pass' : 'blocked'}`;
    $('receipt-headline').textContent = passed ? 'The numbers line up.' : 'This trail doesn’t hold.';
    $('receipt-copy').textContent = passed ? 'The supplied plan, event chain and summary agree. The source is unauthenticated, and every chain observation remains a supplied claim.' : 'This file failed a parser, integrity or accounting check. Its reported totals aren’t shown.';
    $('receipt-checksum').textContent = result.receiptChecksum || 'No valid checksum supplied';
    $('receipt-facts').hidden = !passed;
    if (passed) {
      $('receipt-event-count').textContent = String(result.facts.eventCount);
      $('receipt-accounting').textContent = result.facts.settlementStatus === 'MATCHED_FIXTURE' ? 'Matched fixture' : result.facts.settlementStatus === 'NOT_RECONCILED' ? 'Not reconciled' : result.facts.settlementStatus === 'WAITING' ? 'Waiting' : 'Mismatch';
      // Raw units avoid assuming decimals or a ticker for arbitrary uploaded receipts.
      for (const [id, value] of [['receipt-stock', result.facts.stockRemainingRaw], ['receipt-cash', result.facts.netCashReceivedRaw]]) {
        $(id).textContent = value ?? 'Not reconciled';
      }
    }
    for (const reason of result.reasons) {
      const li = document.createElement('li'); li.textContent = explanations[reason] || `Check failed: ${reason}`;
      $('receipt-reasons').append(li);
    }
    $('receipt-report').disabled = false;
    message(passed ? 'Consistency checked. No authenticated trade or settlement is established.' : 'Receipt rejected. Choose another file or inspect it with the terminal verifier.', !passed);
  } catch (error) {
    if (current !== version) return;
    resetResult();
    message(active.signal.aborted ? 'Inspection timed out. Retry when ready.' : failureMessage, true);
  } finally {
    clearTimeout(timeout);
    if (current === version) {
      $('receipt-result').setAttribute('aria-busy', 'false'); $('receipt-demo').disabled = false;
      $('receipt-verify').disabled = !text; controller = undefined;
    }
  }
}
$('receipt-demo').addEventListener('click', () => run(true));
$('receipt-verify').addEventListener('click', () => run(false));
$('receipt-clear').addEventListener('click', () => { invalidate(); $('receipt-file').value = ''; message('Cleared. Choose a fixture receipt to start again.'); });
$('receipt-file').addEventListener('change', async () => {
  invalidate(); const current = version; const file = $('receipt-file').files?.[0];
  if (!file) { message('No file selected.'); return; }
  if (!file.name.toLowerCase().endsWith('.json') || !file.size || file.size > maxBytes) { message('Choose a nonempty .json fixture receipt, up to 256 KiB.', true); return; }
  message('Reading the selected file…');
  try {
    const body = await file.arrayBuffer();
    if (current !== version) return;
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    $('receipt-selection').textContent = 'Selected fixture receipt · ready to check';
    $('receipt-verify').disabled = false;
    message('Ready. Checking sends this file to Remain’s stateless verifier. Upload fixture data only.');
  } catch { if (current === version) message('Couldn’t read UTF-8 JSON from this file. Choose another file.', true); }
});
$('receipt-report').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'remain-fixture-inspection.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
