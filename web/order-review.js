import { previewInput, cashTargetRaw, validatePreview } from './preview.js';

const fail = () => { throw new Error('INVALID_ORDER_REVIEW'); };
function exact(v, keys) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail();
  const own = Reflect.ownKeys(v);
  if (own.length !== keys.length || !keys.every(k => own.includes(k))) fail();
  for (const k of own) { const d = Object.getOwnPropertyDescriptor(v, k); if (!d.enumerable || !Object.hasOwn(d, 'value')) fail(); }
  return v;
}
function positive(v) {
  if (typeof v !== 'string' || !/^[1-9][0-9]{0,77}$/.test(v) || BigInt(v) >= (1n << 256n)) fail();
  return v;
}
export function orderReviewInput(value) {
  const v = exact(value, ['intent', 'amountRaw', 'vendor', 'expectedOutputRaw', 'cashDecimals']);
  const intent = previewInput(v.intent);
  if (!['PcsXRfq', 'InchFusion', 'CowSwap'].includes(v.vendor) || !Number.isInteger(v.cashDecimals) || v.cashDecimals < 0 || v.cashDecimals > 36) fail();
  positive(v.amountRaw); positive(v.expectedOutputRaw);
  if (BigInt(v.expectedOutputRaw) < BigInt(cashTargetRaw(intent.cashTarget, v.cashDecimals))) fail();
  return Object.freeze({ ...v, intent });
}
export function candidateForReview(value, now = Date.now()) {
  const descriptor = value && Object.getOwnPropertyDescriptor(value, 'input');
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail();
  const p = validatePreview(value, descriptor.value, now);
  if (!p.candidate) fail();
  const probe = p.probes[p.candidate.probeIndex], route = probe.routes[p.candidate.routeIndex];
  return orderReviewInput({ intent: p.input, amountRaw: probe.inputRaw, vendor: route.vendor, expectedOutputRaw: route.estimatedOutputRaw, cashDecimals: p.cashDecimals });
}
export function validateOrderReview(value, submitted, now = Date.now()) {
  const v = exact(value, ['kind', 'input', 'preview', 'rfqReview', 'estimateChanged', 'executionEnabled']);
  const expected = orderReviewInput(submitted), input = orderReviewInput(v.input);
  if (v.kind !== 'REMAIN_UNSIGNED_CASH_REVIEW' || v.executionEnabled !== false ||
      Object.keys(input.intent).some(k => input.intent[k] !== expected.intent[k]) ||
      ['amountRaw', 'vendor', 'expectedOutputRaw', 'cashDecimals'].some(k => input[k] !== expected[k])) fail();
  const preview = validatePreview(v.preview, input.intent, now);
  if (preview.probes.length !== 1 || preview.probes[0].routes.length !== 1 || !preview.candidate ||
      preview.candidate.probeIndex !== 0 || preview.candidate.routeIndex !== 0 || preview.stopReason !== 'EXHAUSTED' ||
      preview.probes[0].inputRaw !== input.amountRaw || preview.probes[0].routes[0].vendor !== input.vendor || preview.cashDecimals !== input.cashDecimals ||
      v.estimateChanged !== (preview.probes[0].routes[0].estimatedOutputRaw !== input.expectedOutputRaw)) fail();
  const r = exact(v.rfqReview, ['profile', 'structure', 'unsignedBuild', 'checksumKind', 'artifactChecksum', 'typeCount', 'fieldCount', 'domainTypeDeclared', 'signatureSemantics', 'executionEnabled']);
  if (r.profile !== 'REMAIN_RFQ_REVIEW_V1' || r.structure !== 'VALIDATED' || r.unsignedBuild !== 'MATCHES_SELECTED_QUOTE' ||
      r.checksumKind !== 'SHA256_JSON_NOT_EIP712' || typeof r.artifactChecksum !== 'string' || !/^[a-f0-9]{64}$/.test(r.artifactChecksum) ||
      !Number.isInteger(r.typeCount) || r.typeCount < 1 || r.typeCount > 32 || !Number.isInteger(r.fieldCount) || r.fieldCount < 1 || r.fieldCount > 256 ||
      typeof r.domainTypeDeclared !== 'boolean' || r.signatureSemantics !== 'UNVERIFIED' || r.executionEnabled !== false) fail();
  return Object.freeze({ ...v, input, preview, rfqReview: Object.freeze({ ...r }) });
}
