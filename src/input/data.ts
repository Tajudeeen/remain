// Inspect descriptors before reading a value. Inputs must be ordinary data,
// never coercion hooks, accessors or prototype-backed configuration objects.
export function dataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('INVALID_DATA');
  const keys = Reflect.ownKeys(value);
  if (keys.length > 128) throw new Error('INVALID_DATA');
  for (const key of keys) {
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('INVALID_DATA');
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('INVALID_DATA');
  }
  return value as Record<string, unknown>;
}
