import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { canonicalJSON } from '../src/receipts/canonical.ts';
import { uuid } from '../src/orders/model.ts';
import { fail } from '../src/execution/cow.ts';
import type { ExecutionRecord, ExecutionJournal } from '../src/execution/store.ts';

// The SQLite API on a Durable Object is synchronous. Keep these calls behind
// transactionSync: commit the SUBMITTING claim before any vendor fetch.
export type DurableSql = {
  exec(query: string, ...args: (string | number)[]): { toArray(): Record<string, unknown>[] };
};
export type DurableJournalStorage = {
  sql: DurableSql;
  transactionSync<T>(fn: () => T): T;
};

const active = (r: ExecutionRecord) => Number(!['CANCELLED', 'RECONCILED'].includes(r.state) && r.lockReleased !== true);
const LIMIT = 256 * 1024;

export class DurableSqlExecutionJournal implements ExecutionJournal {
  private readonly key: Buffer;
  private readonly storage: DurableJournalStorage;
  constructor(storage: DurableJournalStorage, encryptionKey: string) {
    if (!/^[a-f0-9]{64}$/.test(encryptionKey)) fail('STORAGE_KEY_INVALID');
    this.key = Buffer.from(encryptionKey, 'hex');
    this.storage = storage;
    // A SINGLE named DO contains all wallet locks. Never shard by wallet or
    // order: the unique indexes would cease to be globally authoritative.
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS execution_orders (
      id TEXT PRIMARY KEY, uid TEXT UNIQUE NOT NULL,
      wallet TEXT NOT NULL, active INTEGER NOT NULL,
      revision INTEGER NOT NULL, payload TEXT NOT NULL
    ) STRICT;`);
    this.storage.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS execution_wallet_lock ON execution_orders(wallet) WHERE active=1');
  }
  private index(kind: string, value: string) {
    return createHmac('sha256', this.key).update(kind + ':' + value).digest('hex');
  }
  private encrypt(id: string, record: ExecutionRecord) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(id));
    const ciphertext = Buffer.concat([cipher.update(canonicalJSON(record)), cipher.final()]);
    const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    if (packed.byteLength > LIMIT) fail('STORAGE_FAILURE');
    return packed.toString('base64');
  }
  private load(id: string): ExecutionRecord {
    const rows = this.storage.sql.exec('SELECT id,uid,wallet,active,revision,payload FROM execution_orders WHERE id=?', uuid(id)).toArray();
    if (rows.length !== 1) fail('ORDER_NOT_FOUND');
    const row = rows[0]!;
    try {
      if (typeof row.payload !== 'string' || row.payload.length > LIMIT * 2) throw Error();
      const bytes = Buffer.from(row.payload, 'base64');
      if (bytes.length < 29 || bytes.length > LIMIT || bytes.toString('base64') !== row.payload) throw Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const record = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as ExecutionRecord;
      if (record.id !== id || record.revision !== row.revision ||
          this.index('uid', record.auth.orderUid) !== row.uid ||
          this.index('wallet', record.auth.wallet) !== row.wallet ||
          active(record) !== row.active) throw Error();
      return record;
    } catch { fail('STORAGE_CORRUPT'); }
  }
  create(record: ExecutionRecord) {
    return this.storage.transactionSync(() => {
      if (record.state !== 'PREPARED' || record.revision !== 0 || active(record) !== 1) fail('STATE_CONFLICT');
      const encrypted = this.encrypt(record.id, record);
      try {
        this.storage.sql.exec('INSERT INTO execution_orders(id,uid,wallet,active,revision,payload) VALUES (?,?,?,?,?,?)',
          uuid(record.id), this.index('uid', record.auth.orderUid), this.index('wallet', record.auth.wallet), 1, 0, encrypted);
      } catch { fail('ACTIVE_ORDER_EXISTS'); }
      return this.load(record.id);
    });
  }
  get(id: string, wallet: string) {
    const record = this.load(id);
    if (record.auth.wallet !== wallet) fail('ORDER_NOT_FOUND');
    return record;
  }
  change(id: string, wallet: string, revision: number, mutate: (record: ExecutionRecord) => void) {
    return this.storage.transactionSync(() => {
      const record = this.get(id, wallet);
      if (record.revision !== revision) fail('STATE_CONFLICT');
      mutate(record);
      record.revision++;
      const packed = this.encrypt(id, record);
      // The unique active-wallet index also guards wallet locks in a single DO.
      const rows = this.storage.sql.exec(
        'UPDATE execution_orders SET active=?,revision=?,payload=? WHERE id=? AND revision=? RETURNING id',
        active(record), record.revision, packed, id, revision
      ).toArray();
      if (rows.length !== 1) fail('STATE_CONFLICT');
      return this.load(id);
    });
  }
  probe() {
    return this.storage.sql.exec('SELECT COUNT(*) AS n FROM execution_orders').toArray().length === 1;
  }
}
