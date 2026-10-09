import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { resolve, parse } from 'node:path';
import { parseReceiptJSON } from '../receipts/canonical.ts';

export async function noSymlinks(file: string) {
  const path = resolve(file); let part = parse(path).root;
  for (const name of path.slice(part.length).split(/[\\/]/).filter(Boolean)) {
    part = resolve(part, name);
    const s = await lstat(part); if (s.isSymbolicLink()) throw new Error('PRIVATE_PATH_INVALID');
  }
  return path;
}
export async function privateText(file: string) {
  const path = await noSymlinks(file);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 262144 || (stat.mode & 0o077) !== 0) throw new Error('PRIVATE_FILE_INVALID');
    // Bound the read even if the file grows between stat and read.
    const bytes = Buffer.alloc(262145); let count = 0;
    while (count < bytes.length) {
      const n = await handle.read(bytes, count, bytes.length - count, null); if (!n.bytesRead) break; count += n.bytesRead;
    }
    if (count > 262144) throw new Error('PRIVATE_FILE_INVALID');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { await handle.close(); }
}
export async function privateJSON(file: string) { return parseReceiptJSON(await privateText(file)); }
