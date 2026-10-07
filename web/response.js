// Browser-only fixture transport and display contracts. No wallet capability.
// Checks establish bounded, consistent input to the UI, never provenance.
const failure = () => new Error('Unexpected fixture response. Please retry.');
const encoder = new TextEncoder();
const maxBytes = 262144;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const raw = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value);
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const own = Reflect.ownKeys(value);
  if (own.length > 128 || own.some(key => typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value') || !Object.getOwnPropertyDescriptor(value, key).enumerable)) throw failure();
  if (keys && (own.length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))) throw failure();
  return value;
}
function codes(value) {
  if (!Array.isArray(value) || value.length > 64 || value.some(code => typeof code !== 'string' || !/^[A-Z_]{1,64}$/.test(code))) throw failure();
  return value;
}
// Restricted receiver profile matches the fixture wire format: no duplicate
// decoded keys, prototypes, malformed Unicode, fractional/unsafe numbers,
// excessive nesting or unbounded arrays. Money remains an integer string.
export function parseFixtureJSON(text) {
  if (typeof text !== 'string' || encoder.encode(text).length > maxBytes) throw failure();
  let i = 0; let nodes = 0;
  const ws = () => { while (i < text.length && /[\t\r\n ]/.test(text[i])) i++; };
  function string() {
    const start = i++; let escaped = false;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"' && !escaped) {
        const value = JSON.parse(text.slice(start, i));
        if (/[\uD800-\uDFFF]/u.test(value)) throw failure();
        return value;
      }
      escaped = c === '\\' && !escaped;
    }
    throw failure();
  }
  function visit(depth) {
    if (++nodes > 30000 || depth > 24) throw failure();
    ws(); const c = text[i];
    if (c === '"') return string();
    if (c === '{') {
      i++; ws(); const out = Object.create(null); let count = 0;
      if (text[i] === '}') { i++; return out; }
      while (i < text.length) {
        if (++count > 256 || text[i] !== '"') throw failure();
        const key = string();
        if (Object.hasOwn(out, key) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw failure();
        ws(); if (text[i++] !== ':') throw failure(); out[key] = visit(depth + 1); ws();
        const end = text[i++]; if (end === '}') return out; if (end !== ',') throw failure(); ws();
      }
      throw failure();
    }
    if (c === '[') {
      i++; ws(); const out = []; if (text[i] === ']') { i++; return out; }
      while (i < text.length) {
        if (out.length >= 512) throw failure(); out.push(visit(depth + 1)); ws();
        const end = text[i++]; if (end === ']') return out; if (end !== ',') throw failure();
      }
      throw failure();
    }
    for (const [token, value] of [['true', true], ['false', false], ['null', null]]) {
      if (text.slice(i, i + token.length) === token) { i += token.length; return value; }
    }
    const match = /^(0|[1-9][0-9]*)/.exec(text.slice(i));
    if (match) { i += match[0].length; const value = Number(match[0]); if (!Number.isSafeInteger(value)) throw failure(); return value; }
    throw failure();
  }
  try { const value = visit(0); ws(); if (i !== text.length) throw failure(); return value; }
  catch { throw failure(); }
}

export async function readFixtureText(response, signal) {
  let reader; let onAbort; let complete = false;
  try {
    if (signal.aborted || !response.ok || response.redirected ||
        !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') || '')) throw failure();
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || Number(declared) > maxBytes)) throw failure();
    reader = response.body?.getReader(); if (!reader) throw failure();
    const cancelled = new Promise((_, reject) => {
      onAbort = () => reject(failure());
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    const chunks = []; let size = 0;
    for (;;) {
      const part = await Promise.race([reader.read(), cancelled]);
      if (part.done) break;
      size += part.value.byteLength; if (size > maxBytes) throw failure(); chunks.push(part.value);
    }
    if (signal.aborted) throw failure();
    const body = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { body.set(chunk, at); at += chunk.byteLength; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    complete = true; return text;
  } catch { throw failure(); }
  finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
    // A source's cancellation hook can stall. Never await it during recovery.
    if (reader) { if (!complete) void reader.cancel().catch(() => {}); reader.releaseLock(); }
    else if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
  }
}
export async function readFixtureJSON(response, signal) {
  return parseFixtureJSON(await readFixtureText(response, signal));
}

export function validateReceiptReport(value) {
  const r = object(value, ['mode', 'executionEnabled', 'status', 'reasons', 'receiptChecksum', 'canonicalBytes', 'source', 'signature', 'facts']);
  if (r.mode !== 'TEST_FIXTURE' || r.executionEnabled !== false || r.source !== 'UNAUTHENTICATED' ||
      r.signature !== 'NOT_REQUESTED' || !['CONSISTENT_FIXTURE', 'INVALID_RECEIPT'].includes(r.status) ||
      !integer(r.canonicalBytes, maxBytes) || r.receiptChecksum !== null && !hash(r.receiptChecksum)) throw failure();
  codes(r.reasons);
  if (r.status === 'INVALID_RECEIPT') {
    if (r.facts !== null || r.reasons.length === 0 || r.canonicalBytes !== 0) throw failure();
  } else {
    const f = object(r.facts, ['eventCount', 'providerStatus', 'settlementStatus', 'stockRemainingRaw', 'netCashReceivedRaw']);
    if (r.reasons.length || !hash(r.receiptChecksum) || !r.canonicalBytes || !integer(f.eventCount, 64) ||
        f.providerStatus !== null && !['PENDING_VENDOR', 'PENDING_ONCHAIN', 'FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(f.providerStatus) ||
        !['MATCHED_FIXTURE', 'NOT_RECONCILED', 'WAITING', 'MISMATCH'].includes(f.settlementStatus)) throw failure();
    for (const amount of [f.stockRemainingRaw, f.netCashReceivedRaw]) if (amount !== null && !raw(amount)) throw failure();
    if (f.settlementStatus === 'NOT_RECONCILED' && (f.stockRemainingRaw !== null || f.netCashReceivedRaw !== null)) throw failure();
    if (f.settlementStatus !== 'NOT_RECONCILED' && (f.providerStatus !== 'FILLED' || f.stockRemainingRaw === null || f.netCashReceivedRaw === null)) throw failure();
  }
  return r;
}

function units(value, decimals) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value) || value.length > 8) throw failure();
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}
export function validatePlanningRecord(value, submitted) {
  const r = object(value, ['kind', 'mode', 'executionEnabled', 'notice', 'fixture', 'reviewUntilMs', 'plan']);
  const p = object(r.plan); const intent = object(p.intent); const market = object(intent.market);
  if (r.kind !== 'SYNTHETIC_PLANNING_RECORD' || r.mode !== 'TEST_FIXTURE' || r.executionEnabled !== false ||
      p.mode !== 'TEST_FIXTURE' || p.executionEnabled !== false || p.version !== 1 ||
      !['PLANNED_FOR_REVIEW', 'BLOCKED'].includes(p.status) || !hash(p.planHash) ||
      !integer(intent.balanceObservedAtMs, Number.MAX_SAFE_INTEGER) ||
      !integer(p.createdAtMs, Number.MAX_SAFE_INTEGER) || !integer(p.evaluatedAtMs, Number.MAX_SAFE_INTEGER) ||
      p.createdAtMs < intent.balanceObservedAtMs || p.evaluatedAtMs < p.createdAtMs ||
      !integer(r.reviewUntilMs, Number.MAX_SAFE_INTEGER) || r.reviewUntilMs !== intent.balanceObservedAtMs + 15000 ||
      intent.stockBalanceRaw !== '100' || intent.absoluteFloorRaw !== '0' ||
      intent.wallet !== '0x1111111111111111111111111111111111111111' || intent.chain !== '56' ||
      intent.stockToken !== '0x2222222222222222222222222222222222222222' ||
      intent.cashToken !== '0x55d398326f99059ff775485246999027b3197955' ||
      intent.cashTargetRaw !== units(submitted.cashTarget, 18).toString() ||
      intent.retainBps !== submitted.retainPercent * 100 || intent.maxImpactBps !== Number(units(submitted.maxImpactPercent, 2)) ||
      intent.allowClosedMarket !== submitted.allowClosedMarket || market.marketStatus !== submitted.market ||
      market.openState !== (submitted.market === 'regular')) throw failure();
  const fixture = object(r.fixture, ['name', 'symbol', 'balance', 'stockDecimals', 'cashDecimals', 'unitPriceUSDT', 'impactPercent', 'fees']);
  if (fixture.name !== 'Demo Stock' || fixture.symbol !== 'R-DEMO' || fixture.balance !== '100' || fixture.stockDecimals !== 0 ||
      fixture.cashDecimals !== 18 || fixture.unitPriceUSDT !== '1' || fixture.impactPercent !== '0.20' || fixture.fees !== '0') throw failure();
  codes(p.reasons); codes(p.searchStopReasons);
  if (!Array.isArray(p.attempts) || p.attempts.length > 64) throw failure();
  for (const rawAttempt of p.attempts) {
    const attempt = object(rawAttempt);
    if (!raw(attempt.inputRaw) || !Array.isArray(attempt.outcomes) || attempt.outcomes.length > 16) throw failure();
    for (const outcome of attempt.outcomes) { object(outcome); const verdict = object(outcome.verdict); codes(verdict.reasons); }
  }
  if (p.status === 'BLOCKED') {
    if (Object.hasOwn(p, 'candidate') || !p.reasons.length) throw failure();
  } else {
    const candidate = object(p.candidate); const verdict = object(candidate.verdict); const amounts = object(verdict.amounts); const quote = object(candidate.quote);
    codes(verdict.reasons);
    if (p.reasons.length || verdict.status !== 'PASS_FOR_PLANNING' || verdict.executionEnabled !== false || verdict.reasons.length ||
        quote.wallet !== intent.wallet || quote.chain !== intent.chain || quote.stockToken !== intent.stockToken || quote.cashToken !== intent.cashToken ||
        quote.inputFeeRaw !== '0' || quote.outputFeeUpperBoundRaw !== '0' || quote.impactBps !== 20 ||
        quote.inputRaw !== amounts.totalStockDebitRaw || !raw(amounts.totalStockDebitRaw) ||
        !raw(amounts.remainingStockRaw) || !raw(amounts.retainedFloorRaw) || !raw(amounts.minimumNetCashRaw)) throw failure();
    const debit = BigInt(amounts.totalStockDebitRaw); const remaining = BigInt(amounts.remainingStockRaw);
    const cash = BigInt(amounts.minimumNetCashRaw); const target = BigInt(intent.cashTargetRaw);
    if (debit < 1n || debit > 100n || remaining !== 100n - debit || remaining < BigInt(submitted.retainPercent) ||
        amounts.retainedFloorRaw !== String(submitted.retainPercent) || cash !== debit * 10n ** 18n ||
        cash < target || cash > target + 10n ** 18n || intent.maxImpactBps < 20 ||
        submitted.market === 'pause' || submitted.market === 'closed' && !submitted.allowClosedMarket) throw failure();
  }
  return r;
}
