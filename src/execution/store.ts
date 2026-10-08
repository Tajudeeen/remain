import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { constants, chmodSync, closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve, parse } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJSON } from '../receipts/canonical.ts';
import { uuid } from '../orders/model.ts';
import { fail, type CashAuthorization } from './cow.ts';
import type { OrderReviewInput } from '../../web/order-review.js';

export type ExecutionState = 'PREPARED' | 'SIGNED' | 'SUBMITTING' | 'UNKNOWN' | 'PENDING' | 'FILLED' | 'FAILED' | 'CANCELLED' | 'RECONCILED' | 'INVALIDATED';
export type ExecutionRecord = {
  id: string; mode: 'TEST_FIXTURE' | 'LIVE_EXECUTION'; revision: number; state: ExecutionState;
  auth: CashAuthorization; quoteId: string; createdAtMs: number; lastAtMs: number; attempts: number;
  intent: OrderReviewInput;
  stockDecimals: number; stockSymbol: string;
  signature: string | null; platformOrderId: string | null; txHash: string | null; result: unknown;
  invalidationTxHash?: string; lockReleased?: boolean; signaturePrompted?: boolean;
};
// A vendor failure or reconciliation mismatch does not revoke a signature.
const terminal = new Set(['CANCELLED', 'RECONCILED']);
const active = (record: ExecutionRecord) => Number(!terminal.has(record.state) && record.lockReleased !== true);
export class ExecutionStore {
  private readonly db: DatabaseSync; private readonly key: Buffer;
  constructor(file: string, encryptionKey: string) {
    if (!/^[a-f0-9]{64}$/.test(encryptionKey)) fail('STORAGE_KEY_INVALID'); this.key = Buffer.from(encryptionKey, 'hex');
    const path = resolve(file), folder = dirname(path); let part = parse(path).root;
    for (const name of folder.slice(part.length).split(/[\\/]/).filter(Boolean)) {
      part = resolve(part, name); try { if (lstatSync(part).isSymbolicLink()) fail('STORAGE_FAILURE'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    mkdirSync(folder, { recursive: true, mode: 0o700 }); chmodSync(folder, 0o700);
    for (const suffix of ['', '-wal', '-shm']) {
      try { const s = lstatSync(path + suffix); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) fail('STORAGE_FAILURE'); chmodSync(path + suffix, 0o600); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    const fd = openSync(path, constants.O_CREAT | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0), 0o600); closeSync(fd);
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS execution_orders (id TEXT PRIMARY KEY, uid TEXT UNIQUE NOT NULL, wallet TEXT NOT NULL, active INTEGER NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS execution_wallet_lock ON execution_orders(wallet) WHERE active=1;`);
  }
  close() { this.db.close(); this.key.fill(0); }
  private index(kind: string, value: string) { return createHmac('sha256', this.key).update(kind + ':' + value).digest('hex'); }
  private encrypt(id: string, data: ExecutionRecord) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv); cipher.setAAD(Buffer.from(id));
    const ciphertext = Buffer.concat([cipher.update(canonicalJSON(data)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }
  private load(id: string): ExecutionRecord {
    const row = this.db.prepare('SELECT * FROM execution_orders WHERE id=?').get(uuid(id)); if (!row) fail('ORDER_NOT_FOUND');
    try {
      const bytes = Buffer.from(String(row.payload), 'base64'), decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(bytes.subarray(12, 28));
      const record = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as ExecutionRecord;
      if (record.id !== id || record.revision !== row.revision || this.index('uid', record.auth.orderUid) !== row.uid || this.index('wallet', record.auth.wallet) !== row.wallet || active(record) !== row.active) fail('STORAGE_CORRUPT');
      return record;
    } catch { fail('STORAGE_CORRUPT'); }
  }
  private transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE'); try { const result = run(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  create(record: ExecutionRecord) {
    return this.transaction(() => {
      if (record.revision !== 0 || record.state !== 'PREPARED') fail('STATE_CONFLICT');
      try { this.db.prepare('INSERT INTO execution_orders VALUES (?, ?, ?, 1, 0, ?)').run(uuid(record.id), this.index('uid', record.auth.orderUid), this.index('wallet', record.auth.wallet), this.encrypt(record.id, record)); }
      catch { fail('ACTIVE_ORDER_EXISTS'); } return this.load(record.id);
    });
  }
  get(id: string, wallet: string) { const record = this.load(id); if (record.auth.wallet !== wallet) fail('ORDER_NOT_FOUND'); return record; }
  change(id: string, wallet: string, revision: number, run: (record: ExecutionRecord) => void) {
    return this.transaction(() => {
      const record = this.get(id, wallet); if (record.revision !== revision) fail('STATE_CONFLICT');
      run(record); record.revision++;
      this.db.prepare('UPDATE execution_orders SET active=?, revision=?, payload=? WHERE id=?').run(active(record), record.revision, this.encrypt(id, record), id);
      return this.load(id);
    });
  }
}
