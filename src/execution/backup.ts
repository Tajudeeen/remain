import { createDecipheriv, createHmac, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, link, lstat, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { parseReceiptJSON } from '../receipts/canonical.ts';
import { uuid } from '../orders/model.ts';
import { noSymlinks } from '../release/private-file.ts';
import { dataRecord } from '../input/data.ts';
import { fail } from './cow.ts';

async function databasePath(file: string) {
  const path = await noSymlinks(file);
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      const s = await lstat(path + suffix);
      if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || (s.mode & 0o077) !== 0 || s.size > 256 * 1024 * 1024) fail('BACKUP_PATH_INVALID');
    } catch (e) { if (suffix === '' || (e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  return path;
}
function audit(db: DatabaseSync, keyText: string) {
  if (!/^[a-f0-9]{64}$/.test(keyText)) fail('STORAGE_KEY_INVALID');
  const key = Buffer.from(keyText, 'hex');
  try {
    db.exec('PRAGMA trusted_schema=OFF');
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== 'ok') fail('STORAGE_CORRUPT');
    const count = db.prepare('SELECT count(*) AS n FROM execution_orders').get()!.n;
    if (typeof count !== 'number' || count > 10000) fail('BACKUP_LIMIT');
    let active = 0, unresolved = 0;
    const index = (kind: string, value: string) => createHmac('sha256', key).update(kind + ':' + value).digest('hex');
    for (const row of db.prepare('SELECT * FROM execution_orders').iterate()) {
      const id = uuid(row.id);
      if (typeof row.payload !== 'string' || row.payload.length > 400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.payload)) fail('STORAGE_CORRUPT');
      const bytes = Buffer.from(row.payload, 'base64'), cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAAD(Buffer.from(id)); cipher.setAuthTag(bytes.subarray(12, 28));
      const r = dataRecord(parseReceiptJSON(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'))), auth = dataRecord(r.auth);
      if (r.id !== id || r.revision !== row.revision || typeof auth.wallet !== 'string' || typeof auth.orderUid !== 'string' ||
          index('uid', auth.orderUid) !== row.uid || index('wallet', auth.wallet) !== row.wallet ||
          !['PREPARED', 'SIGNED', 'SUBMITTING', 'UNKNOWN', 'PENDING', 'FILLED', 'FAILED', 'CANCELLED', 'RECONCILED', 'INVALIDATED'].includes(String(r.state))) fail('STORAGE_CORRUPT');
      const locked = Number(!['CANCELLED', 'RECONCILED'].includes(String(r.state)) && r.lockReleased !== true);
      if (locked !== row.active) fail('STORAGE_CORRUPT');
      active += locked;
      if (['SIGNED', 'SUBMITTING', 'UNKNOWN', 'PENDING', 'FILLED', 'FAILED', 'INVALIDATED'].includes(String(r.state)) || r.state === 'PREPARED' && r.signaturePrompted === true) unresolved++;
    }
    return { records: count, activeLocks: active, unresolvedRecords: unresolved, keyAuthenticated: count > 0 };
  } finally { key.fill(0); }
}

// Offline drill never opens the trading engine or changes order state.
export async function inspectExecutionBackup(file: string, key: string) {
  const path = await databasePath(file), db = new DatabaseSync(path, { readOnly: true });
  try { return { kind: 'REMAIN_JOURNAL_DRILL', status: 'VERIFIED', ...audit(db, key),
    trust: 'DATABASE_AND_ENCRYPTION_INTEGRITY_NOT_LIVE_SETTLEMENT' }; }
  finally { db.close(); }
}
export async function backupExecutionJournal(source: string, destination: string, key: string) {
  const from = await databasePath(source), to = resolve(destination), folder = dirname(to);
  if (from === to) fail('BACKUP_PATH_INVALID');
  // Require an existing, private parent. Never chmod somebody else's directory.
  await noSymlinks(folder);
  if ((await lstat(folder)).mode & 0o077) fail('BACKUP_PATH_INVALID');
  try { await lstat(to); fail('BACKUP_DESTINATION_EXISTS'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const temp = resolve(folder, '.remain-backup-' + randomUUID() + '.sqlite');
  const handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0), 0o600);
  await handle.close();
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(from, { readOnly: true });
    // SQLite's backup API includes committed WAL data. Copying the DB alone can
    // silently lose the last signing/submission marker.
    await backup(db, temp, { rate: 64 });
    await chmod(temp, 0o600);
    const result = await inspectExecutionBackup(temp, key);
    const file = await open(temp, 'r'); try { await file.sync(); } finally { await file.close(); }
    // Atomic, no-clobber publication on the same filesystem.
    await link(temp, to); await unlink(temp);
    const directory = await open(folder, 'r'); try { await directory.sync(); } finally { await directory.close(); }
    return { ...result, kind: 'REMAIN_JOURNAL_BACKUP', status: 'VERIFIED', overwritePerformed: false };
  } finally {
    db?.close(); await unlink(temp).catch(() => {});
  }
}

