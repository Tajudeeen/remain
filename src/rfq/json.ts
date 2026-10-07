// Bounded JSON parsing with duplicate-key rejection before values are lost.
// Used on quote/build envelopes and on JSON-string typed data. No logging.
export function parseRfqJSON(text: string, maxBytes = 131072): unknown {
  if (Buffer.byteLength(text) > maxBytes) throw new Error('JSON_LIMIT');
  let i = 0; let nodes = 0;
  const ws = () => { while (i < text.length && /[\t\r\n ]/.test(text[i]!)) i++; };
  function string(): string {
    const start = i++; let escaped = false;
    while (i < text.length) {
      const c = text[i++]!;
      if (c === '"' && !escaped) {
        const result: string = JSON.parse(text.slice(start, i));
        if (/[\uD800-\uDFFF]/u.test(result)) throw new Error('UNICODE');
        return result;
      }
      escaped = c === '\\' && !escaped;
    }
    throw new Error('JSON_STRING');
  }
  function value(depth: number): unknown {
    if (++nodes > 50000 || depth > 24) throw new Error('JSON_LIMIT');
    ws(); const c = text[i];
    if (c === '"') return string();
    if (c === '{') {
      i++; ws(); const out: Record<string, unknown> = Object.create(null); let count = 0;
      if (text[i] === '}') { i++; return out; }
      while (i < text.length) {
        if (++count > 512 || text[i] !== '"') throw new Error('JSON_OBJECT');
        const key = string();
        if (Object.hasOwn(out, key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('JSON_KEY');
        ws(); if (text[i++] !== ':') throw new Error('JSON_COLON');
        out[key] = value(depth + 1); ws();
        const end = text[i++]; if (end === '}') return out;
        if (end !== ',') throw new Error('JSON_OBJECT'); ws();
      }
    }
    if (c === '[') {
      i++; ws(); const out: unknown[] = [];
      if (text[i] === ']') { i++; return out; }
      while (i < text.length) {
        if (out.length >= 2048) throw new Error('JSON_ARRAY');
        out.push(value(depth + 1)); ws();
        const end = text[i++]; if (end === ']') return out;
        if (end !== ',') throw new Error('JSON_ARRAY'); ws();
      }
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.slice(i, i + token.length) === token) { i += token.length; return result; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
    if (match) {
      i += match[0].length; const n = Number(match[0]);
      if (!Number.isFinite(n) || (Number.isInteger(n) && (!Number.isSafeInteger(n) || /[.eE]/.test(match[0])))) throw new Error('JSON_NUMBER');
      return n;
    }
    throw new Error('JSON_VALUE');
  }
  const result = value(0); ws(); if (i !== text.length) throw new Error('JSON_TRAILING'); return result;
}

// Reject executable object properties, sparse arrays and cycles before taking
// a detached JSON snapshot. Trusted callers must supply ordinary data objects.
export function snapshotRfq(value: unknown): unknown {
  const ancestors = new Set<object>(); let nodes = 0; let bytes = 0;
  function visit(v: unknown, depth: number): unknown {
    if (++nodes > 10000 || depth > 24) throw new Error('OBJECT_LIMIT');
    if (typeof v === 'string') {
      bytes += Buffer.byteLength(v); if (bytes > 131072 || /[\uD800-\uDFFF]/u.test(v)) throw new Error('STRING_LIMIT'); return v;
    }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0)) return v;
    if (!v || typeof v !== 'object' || ancestors.has(v)) throw new Error('OBJECT_VALUE');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error('OBJECT_PROTOTYPE');
    const keys = Reflect.ownKeys(v);
    if (keys.some(k => typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('OBJECT_KEY');
    ancestors.add(v);
    if (Array.isArray(v)) {
      if (v.length > 128 || keys.length !== v.length + 1) throw new Error('ARRAY_LIMIT');
      const out: unknown[] = [];
      for (let j = 0; j < v.length; j++) {
        const desc = Object.getOwnPropertyDescriptor(v, String(j));
        if (!desc || !Object.hasOwn(desc, 'value') || !desc.enumerable) throw new Error('OBJECT_ACCESSOR');
        out.push(visit(desc.value, depth + 1));
      }
      ancestors.delete(v); return out;
    }
    if (keys.length > 128) throw new Error('OBJECT_LIMIT');
    const out: Record<string, unknown> = Object.create(null);
    for (const k of keys as string[]) {
      bytes += Buffer.byteLength(k); if (bytes > 131072 || /[\uD800-\uDFFF]/u.test(k)) throw new Error('STRING_LIMIT');
      const desc = Object.getOwnPropertyDescriptor(v, k)!;
      if (!Object.hasOwn(desc, 'value') || !desc.enumerable) throw new Error('OBJECT_ACCESSOR');
      out[k] = visit(desc.value, depth + 1);
    }
    ancestors.delete(v); return out;
  }
  const result = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(result)) > 131072) throw new Error('OBJECT_LIMIT');
  return result;
}
