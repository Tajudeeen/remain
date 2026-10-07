import { createHash } from 'node:crypto';
import { RemainError } from '../errors.ts';
import { parseRfqJSON, snapshotRfq } from './json.ts';

type Field = { name: string; type: string };
type Type = { base: string; dimensions: (number | null)[] };
export type TypedReview = { typedDataHash: string; verifyingContract: string; typeCount: number; fieldCount: number; domainTypeDeclared: boolean };
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const forbidden = ['__proto__', 'constructor', 'prototype'];
function fail(): never { throw new RemainError('RFQ_OPAQUE'); }
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(); return v as Record<string, unknown>; }
function exact(v: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function atom(base: string): boolean {
  if (['address', 'bool', 'bytes', 'string'].includes(base)) return true;
  const bytes = /^bytes([1-9][0-9]*)$/.exec(base);
  if (bytes) return Number(bytes[1]) <= 32;
  const integer = /^(?:uint|int)([1-9][0-9]*)$/.exec(base);
  return !!integer && Number(integer[1]) <= 256 && Number(integer[1]) % 8 === 0;
}
function type(s: unknown): Type {
  if (typeof s !== 'string' || s.length > 100 || !/^[A-Za-z_][A-Za-z0-9_]*(?:\[(?:[1-9][0-9]*)?\])*$/.test(s)) fail();
  const base = s.split('[')[0]!;
  if (!identifier.test(base) || forbidden.includes(base) || /^(?:u?int|bytes)[0-9]*$/.test(base) && !atom(base)) fail();
  const dimensions = [...s.matchAll(/\[([0-9]*)\]/g)].map(m => m[1] ? Number(m[1]) : null);
  if (dimensions.length > 3 || dimensions.some(n => n !== null && n > 128)) fail();
  return { base, dimensions };
}
function integer(v: unknown, signed: boolean, bits: number): void {
  let n: bigint;
  if (typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0)) n = BigInt(v);
  else if (typeof v === 'string' && v.length <= 80 && (/^(?:0|-?[1-9][0-9]*)$/.test(v) || /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(v))) n = BigInt(v);
  else fail();
  const limit = 1n << BigInt(signed ? bits - 1 : bits);
  if (n < (signed ? -limit : 0n) || n >= limit) fail();
}

// Conservative inspection profile, not a wallet encoder or signing approval.
// Recursive type definitions and extended domains deliberately fail closed.
export function reviewTypedData(input: unknown): TypedReview {
  try {
    const detached = snapshotRfq(typeof input === 'string' ? parseRfqJSON(input) : input);
    const root = object(detached); exact(root, ['domain', 'types', 'primaryType', 'message']);
    const domain = object(root.domain); const rawTypes = object(root.types);
    if (typeof root.primaryType !== 'string' || root.primaryType === 'EIP712Domain' || !Object.hasOwn(rawTypes, root.primaryType)) fail();
    const types = new Map<string, Field[]>(); let fieldCount = 0;
    if (!Object.keys(rawTypes).length || Object.keys(rawTypes).length > 32) fail();
    for (const [name, fields] of Object.entries(rawTypes)) {
      if (!identifier.test(name) || forbidden.includes(name) || atom(name) || /^(?:u?int|bytes)[0-9]*$/.test(name) || !Array.isArray(fields) || fields.length > 64 || !fields.length) fail();
      const names = new Set<string>(); const declared: Field[] = [];
      for (const raw of fields) {
        const field = object(raw); exact(field, ['name', 'type']);
        if (typeof field.name !== 'string' || !identifier.test(field.name) || forbidden.includes(field.name) || names.has(field.name)) fail();
        type(field.type); names.add(field.name); declared.push({ name: field.name, type: field.type as string });
      }
      fieldCount += declared.length; if (fieldCount > 256) fail(); types.set(name, declared);
    }
    const visited = new Set<string>(); const visiting = new Set<string>();
    function graph(name: string): void {
      if (visiting.has(name)) fail(); if (visited.has(name)) return;
      visiting.add(name);
      for (const field of types.get(name)!) {
        const base = type(field.type).base;
        if (!atom(base)) { if (!types.has(base) || base === 'EIP712Domain') fail(); graph(base); }
      }
      visiting.delete(name); visited.add(name);
    }
    for (const name of types.keys()) graph(name);
    function check(t: Type, v: unknown, depth = 0): void {
      if (depth > 24) fail();
      if (t.dimensions.length) {
        const length = t.dimensions.at(-1);
        if (!Array.isArray(v) || v.length > 128 || length !== null && v.length !== length) fail();
        for (const child of v) check({ base: t.base, dimensions: t.dimensions.slice(0, -1) }, child, depth + 1);
      } else if (types.has(t.base)) {
        const data = object(v); const fields = types.get(t.base)!; exact(data, fields.map(f => f.name));
        for (const f of fields) check(type(f.type), data[f.name], depth + 1);
      } else if (t.base === 'address') { if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(v)) fail(); }
      else if (t.base === 'bool') { if (typeof v !== 'boolean') fail(); }
      else if (t.base === 'string') { if (typeof v !== 'string' || Buffer.byteLength(v) > 32768) fail(); }
      else if (t.base.startsWith('bytes')) {
        if (typeof v !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(v) || v.length > 65538 || t.base !== 'bytes' && v.length !== 2 + 2 * Number(t.base.slice(5))) fail();
      } else if (/^(?:uint|int)[0-9]+$/.test(t.base)) integer(v, t.base.startsWith('int'), Number(t.base.replace(/\D/g, '')));
      else fail();
    }
    const domainFields: Record<string, string> = { name: 'string', version: 'string', chainId: 'uint256', verifyingContract: 'address', salt: 'bytes32' };
    if (!Object.hasOwn(domain, 'chainId') || !Object.hasOwn(domain, 'verifyingContract')) fail();
    for (const [name, value] of Object.entries(domain)) { if (!Object.hasOwn(domainFields, name)) fail(); check(type(domainFields[name]), value); }
    if (!(domain.chainId === 56 || domain.chainId === '56' || domain.chainId === '0x38') || /^0x0{40}$/.test(domain.verifyingContract as string)) fail();
    if (types.has('EIP712Domain')) {
      for (const field of types.get('EIP712Domain')!) if (domainFields[field.name] !== field.type) fail();
      check(type('EIP712Domain'), domain);
    }
    check(type(root.primaryType), root.message);
    return { typedDataHash: createHash('sha256').update(JSON.stringify(detached)).digest('hex'),
      verifyingContract: (domain.verifyingContract as string).toLowerCase(), typeCount: types.size, fieldCount, domainTypeDeclared: types.has('EIP712Domain') };
  } catch { throw new RemainError('RFQ_OPAQUE'); }
}
