import { createHash } from 'node:crypto';

export const RECEIPT_MAX_BYTES = 262144;
export class ReceiptError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'ReceiptError'; this.code = code; }
}
function validString(s: string): void {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const next = s.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new ReceiptError('INVALID_UNICODE'); }
    else if (c >= 0xdc00 && c <= 0xdfff) throw new ReceiptError('INVALID_UNICODE');
  }
}
// Deliberately restricted, versioned profile, not a claim of RFC 8785 compliance.
// UTF-16 lexicographic keys, well-formed strings, nonnegative safe integers,
// booleans/null, dense arrays and plain data objects. Monetary units are strings.
export function canonicalJSON(value: unknown): string {
  const ancestors = new Set<object>(); let nodes = 0;
  function visit(v: unknown, depth: number): string {
    if (++nodes > 30000 || depth > 24) throw new ReceiptError('STRUCTURE_LIMIT');
    if (v === null) return 'null';
    if (typeof v === 'string') { validString(v); return JSON.stringify(v); }
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'number') { if (!Number.isSafeInteger(v) || v < 0 || Object.is(v, -0)) throw new ReceiptError('INVALID_NUMBER'); return String(v); }
    if (typeof v !== 'object' || ancestors.has(v)) throw new ReceiptError('INVALID_JSON_VALUE');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new ReceiptError('INVALID_JSON_VALUE');
    ancestors.add(v);
    const keys = Object.keys(v);
    if (Object.getOwnPropertySymbols(v).length || keys.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new ReceiptError('INVALID_KEY');
    for (const k of keys) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, 'value')) throw new ReceiptError('INVALID_JSON_VALUE');
    let result: string;
    if (Array.isArray(v)) {
      if (v.length > 512 || keys.length !== v.length || keys.some((k, i) => k !== String(i))) throw new ReceiptError('ARRAY_LIMIT');
      result = '[' + v.map(child => visit(child, depth + 1)).join(',') + ']';
    } else {
      if (keys.length > 256) throw new ReceiptError('OBJECT_LIMIT');
      result = '{' + keys.sort().map(k => { validString(k); return JSON.stringify(k) + ':' + visit((v as Record<string, unknown>)[k], depth + 1); }).join(',') + '}';
    }
    ancestors.delete(v); return result;
  }
  const text = visit(value, 0);
  if (Buffer.byteLength(text) > RECEIPT_MAX_BYTES) throw new ReceiptError('RECEIPT_TOO_LARGE');
  return text;
}
export function canonicalChecksum(value: unknown): string { return createHash('sha256').update(canonicalJSON(value), 'utf8').digest('hex'); }

// JSON.parse alone accepts duplicate object keys. This small profile parser
// rejects those before any checksum, schema or semantic checks are performed.
export function parseReceiptJSON(text: string): unknown {
  if (typeof text !== 'string' || Buffer.byteLength(text) > RECEIPT_MAX_BYTES) throw new ReceiptError('RECEIPT_TOO_LARGE');
  let i = 0; let nodes = 0;
  const ws = () => { while (/[\t\r\n ]/.test(text[i] ?? '') && i < text.length) i++; };
  function str(): string {
    const start = i++; let escaped = false;
    while (i < text.length) {
      const c = text[i++]!;
      if (c === '"' && !escaped) {
        try { const s: string = JSON.parse(text.slice(start, i)); validString(s); return s; } catch { throw new ReceiptError('INVALID_JSON'); }
      }
      if (c === '\\' && !escaped) escaped = true; else escaped = false;
    }
    throw new ReceiptError('INVALID_JSON');
  }
  function value(depth: number): unknown {
    if (++nodes > 30000 || depth > 24) throw new ReceiptError('STRUCTURE_LIMIT');
    ws(); const c = text[i];
    if (c === '"') return str();
    if (c === '{') {
      i++; ws(); const out: Record<string, unknown> = Object.create(null); let count = 0;
      if (text[i] === '}') { i++; return out; }
      while (i < text.length) {
        if (++count > 256 || text[i] !== '"') throw new ReceiptError('INVALID_JSON');
        const k = str(); if (Object.hasOwn(out, k)) throw new ReceiptError('DUPLICATE_KEY');
        if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new ReceiptError('INVALID_KEY');
        ws(); if (text[i++] !== ':') throw new ReceiptError('INVALID_JSON'); out[k] = value(depth + 1); ws();
        const end = text[i++]; if (end === '}') return out; if (end !== ',') throw new ReceiptError('INVALID_JSON'); ws();
      }
    }
    if (c === '[') {
      i++; ws(); const out: unknown[] = []; if (text[i] === ']') { i++; return out; }
      while (i < text.length) {
        if (out.length >= 512) throw new ReceiptError('ARRAY_LIMIT'); out.push(value(depth + 1)); ws();
        const end = text[i++]; if (end === ']') return out; if (end !== ',') throw new ReceiptError('INVALID_JSON');
      }
    }
    for (const [token, v] of [['true', true], ['false', false], ['null', null]] as const) if (text.slice(i, i + token.length) === token) { i += token.length; return v; }
    const match = /^(0|[1-9][0-9]*)/.exec(text.slice(i));
    if (match) { i += match[0].length; const n = Number(match[0]); if (!Number.isSafeInteger(n)) throw new ReceiptError('INVALID_NUMBER'); return n; }
    throw new ReceiptError('INVALID_JSON');
  }
  const result = value(0); ws(); if (i !== text.length) throw new ReceiptError('INVALID_JSON'); canonicalJSON(result); return result;
}
