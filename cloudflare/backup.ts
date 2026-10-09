import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { canonicalJSON } from '../src/receipts/canonical.ts';
import { fail } from '../src/execution/cow.ts';
import type { EncryptedJournalRow } from './journal.ts';

// R2 should never hold plaintext order data. Rows are encrypted already;
// this envelope additionally hides wallet/UID lookup indexes and authenticates
// the complete snapshot, record count and timestamp.
const label = Buffer.from('REMAIN_CLOUDFLARE_ENCRYPTED_BACKUP_V1');
const magic = Buffer.from('RMB1');
const maxBytes = 3 * 1024 * 1024;
const maxRows = 512;
const parseKey = (value: string) => {
  if (!/^[a-f0-9]{64}$/.test(value)) fail('STORAGE_KEY_INVALID');
  return Buffer.from(value,'hex');
};
export function sealEncryptedBackup(rows: EncryptedJournalRow[], key: string, atMs: number): Uint8Array {
  const k=parseKey(key);
  if(!Array.isArray(rows)||rows.length>maxRows||!Number.isSafeInteger(atMs)||atMs<=0) fail('STORAGE_FAILURE');
  const plaintext=Buffer.from(canonicalJSON({
    kind:'REMAIN_CLOUDFLARE_LEDGER_BACKUP_V1',
    createdAtMs:atMs,
    count:rows.length,
    rows
  }),'utf8');
  if (plaintext.byteLength>maxBytes-32) fail('STORAGE_FAILURE');
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',k,iv);
  cipher.setAAD(label);
  const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return Buffer.concat([magic,iv,cipher.getAuthTag(),encrypted]);
}
export function openEncryptedBackup(contents: Uint8Array, key: string): {
  kind:'REMAIN_CLOUDFLARE_LEDGER_BACKUP_V1';
  createdAtMs:number; count:number; rows:EncryptedJournalRow[]
} {
  const k=parseKey(key);
  if(!(contents instanceof Uint8Array)||contents.byteLength<33||contents.byteLength>maxBytes) fail('STORAGE_CORRUPT');
  try {
    const bytes=Buffer.from(contents);
    if(!bytes.subarray(0,4).equals(magic)) throw Error('BAD_BACKUP_MAGIC');
    const decipher=createDecipheriv('aes-256-gcm',k,bytes.subarray(4,16));
    decipher.setAAD(label);
    decipher.setAuthTag(bytes.subarray(16,32));
    const data=Buffer.concat([decipher.update(bytes.subarray(32)),decipher.final()]).toString('utf8');
    const decoded:unknown=JSON.parse(data);
    if(!decoded || typeof decoded!=='object'||Array.isArray(decoded))throw Error('BAD_BACKUP');
    const result=decoded as Record<string,unknown>;
    if(Object.keys(result).sort().join()!=='count,createdAtMs,kind,rows'||
      result.kind!=='REMAIN_CLOUDFLARE_LEDGER_BACKUP_V1'||
      !Number.isSafeInteger(result.createdAtMs)||Number(result.createdAtMs)<=0||
      !Array.isArray(result.rows)||result.rows.length>maxRows||
      !Number.isSafeInteger(result.count)||result.count!==result.rows.length||
      canonicalJSON(result)!==data)throw Error('BAD_BACKUP');
    return result as ReturnType<typeof openEncryptedBackup>;
  } catch {fail('STORAGE_CORRUPT');}
}
