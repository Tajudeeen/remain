import { constants, chmodSync, closeSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { dirname, resolve, parse } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { digest } from '../validation.ts';
import { timestamp } from '../planning/model.ts';
import { bindingChecksum, exact, hash, identifier, normalizeBinding, OrderError, uuid, type OrderBinding } from './model.ts';
import { normalizeEvidence, reconcileFixture, type SettlementEvidence, type SettlementResult } from './settlement.ts';

export type ProviderStatus = 'PENDING_VENDOR' | 'PENDING_ONCHAIN' | 'FILLED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
export type OrderEvent = { eventId: string; atMs: number } & (
  { type: 'ATTEMPT_REHEARSAL' | 'OUTCOME_UNKNOWN' | 'CANCEL_REQUESTED' } |
  { type: 'OBSERVE'; status: ProviderStatus; platformOrderId: string; txHash: string | null } |
  { type: 'RECONCILE'; evidence: SettlementEvidence }
);
export type OrderSnapshot = {
  mode: 'TEST_FIXTURE'; executionEnabled: false; requestId: string; binding: OrderBinding; revision: number;
  lastAtMs: number; attemptAtMs: number | null; outcomeUnknown: boolean; cancelRequested: boolean;
  providerStatus: ProviderStatus | null; platformOrderId: string | null; txHash: string | null;
  settlement: SettlementResult | null;
};
const terminal = new Set<ProviderStatus>(['FILLED', 'FAILED', 'EXPIRED', 'CANCELLED']);
function event(value: unknown): OrderEvent {
  try {
    const type = (value as { type?: unknown } | null)?.type;
    const keys = ['eventId', 'atMs', 'type', ...(type === 'OBSERVE' ? ['status', 'platformOrderId', 'txHash'] : type === 'RECONCILE' ? ['evidence'] : [])];
    const v = exact(value, keys); const base = { eventId: uuid(v.eventId), atMs: timestamp(v.atMs) };
    if (type === 'ATTEMPT_REHEARSAL' || type === 'OUTCOME_UNKNOWN' || type === 'CANCEL_REQUESTED') return { ...base, type };
    if (type === 'OBSERVE') {
      if (typeof v.status !== 'string' || !['PENDING_VENDOR', 'PENDING_ONCHAIN', 'FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(v.status) || (v.status === 'FILLED' ? v.txHash === null : v.txHash !== null)) throw new Error();
      return { ...base, type, status: v.status as ProviderStatus, platformOrderId: identifier(v.platformOrderId), txHash: v.txHash === null ? null : hash(v.txHash) };
    }
    if (type === 'RECONCILE') return { ...base, type, evidence: normalizeEvidence(v.evidence) };
    throw new Error();
  } catch { throw new OrderError('INVALID_EVENT'); }
}
function reduce(s: OrderSnapshot, e: OrderEvent): void {
  if (e.atMs < s.lastAtMs) throw new OrderError('INVALID_TRANSITION');
  switch (e.type) {
    case 'ATTEMPT_REHEARSAL':
      if (s.attemptAtMs !== null || e.atMs >= s.binding.expiresAtMs) throw new OrderError('INVALID_TRANSITION');
      s.attemptAtMs = e.atMs; s.outcomeUnknown = true; break;
    case 'OUTCOME_UNKNOWN':
      if (s.attemptAtMs === null || s.providerStatus && terminal.has(s.providerStatus)) throw new OrderError('INVALID_TRANSITION');
      s.outcomeUnknown = true; break;
    case 'CANCEL_REQUESTED':
      if (s.attemptAtMs === null || s.providerStatus && terminal.has(s.providerStatus)) throw new OrderError('INVALID_TRANSITION');
      s.cancelRequested = true; break;
    case 'OBSERVE':
      if (s.attemptAtMs === null || s.platformOrderId !== null && s.platformOrderId !== e.platformOrderId || s.txHash !== null && s.txHash !== e.txHash || s.providerStatus !== null && terminal.has(s.providerStatus) && s.providerStatus !== e.status || s.providerStatus === 'PENDING_ONCHAIN' && e.status === 'PENDING_VENDOR') throw new OrderError('INVALID_TRANSITION');
      s.providerStatus = e.status; s.platformOrderId = e.platformOrderId; s.txHash = e.txHash; s.outcomeUnknown = false; break;
    case 'RECONCILE':
      if (s.providerStatus !== 'FILLED' || !s.platformOrderId || !s.txHash) throw new OrderError('INVALID_TRANSITION');
      s.settlement = reconcileFixture(s.binding, s.platformOrderId, s.txHash, e.evidence); break;
  }
  s.revision++; s.lastAtMs = e.atMs;
}
export function recoveryAdvice(s: OrderSnapshot, nowMs: number): { action: string; executionEnabled: false; requestId: string } {
  timestamp(nowMs);
  if (nowMs < s.lastAtMs) throw new OrderError('INVALID_ORDER');
  const action = s.providerStatus === 'FILLED' ? s.settlement?.status === 'MATCHED_FIXTURE' ? 'RECHECK_CANONICAL_SETTLEMENT' : 'RECONCILE_OR_INVESTIGATE'
    : s.providerStatus && terminal.has(s.providerStatus) ? 'RETAIN_TERMINAL_RECORD'
    : s.attemptAtMs === null ? 'NO_SUBMISSION_ENABLED'
    : nowMs - s.attemptAtMs >= 30 * 60 * 1000 ? 'INVESTIGATE_DEDUPLICATION_WINDOW_ELAPSED'
    : 'RECOVER_STATUS_WITH_EXISTING_ID';
  return { action, executionEnabled: false, requestId: s.requestId };
}

export class FixtureOrderJournal {
  private readonly db: DatabaseSync;
  constructor(file: string) {
    let db: DatabaseSync | undefined;
    try {
      const path = resolve(file); const folder = dirname(path);
      // Reject observed symlinks, including parents. The directory must still be
      // trusted: these checks do not defend against a malicious concurrent owner.
      let part = parse(path).root;
      for (const name of folder.slice(part.length).split(/[\\/]/).filter(Boolean)) {
        part = resolve(part, name);
        try { if (lstatSync(part).isSymbolicLink()) throw new OrderError('STORAGE_FAILURE'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      mkdirSync(folder, { recursive: true, mode: 0o700 }); chmodSync(folder, 0o700);
      for (const suffix of ['', '-wal', '-shm']) {
        try { const stat = lstatSync(path + suffix); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new OrderError('STORAGE_FAILURE'); chmodSync(path + suffix, 0o600); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      const fd = openSync(path, constants.O_CREAT | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0), 0o600); closeSync(fd);
      db = new DatabaseSync(path); db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      const version = db.prepare('PRAGMA user_version').get()?.user_version;
      if (version !== 0 && version !== 1) throw new OrderError('STORAGE_FAILURE');
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS orders (request_id TEXT PRIMARY KEY, plan_hash TEXT NOT NULL UNIQUE, binding_json TEXT NOT NULL, binding_hash TEXT NOT NULL, revision INTEGER NOT NULL, tail_hash TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS events (request_id TEXT NOT NULL REFERENCES orders(request_id), sequence INTEGER NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL, previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL, PRIMARY KEY(request_id, sequence), UNIQUE(request_id, event_id)) STRICT;
        PRAGMA user_version=1; COMMIT;`);
      this.db = db;
    } catch { try { db?.close(); } catch {} throw new OrderError('STORAGE_FAILURE'); }
  }
  close(): void { this.db.close(); }
  private transaction<T>(write: boolean, run: () => T): T {
    try {
      this.db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
      const result = run(); this.db.exec('COMMIT'); return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      if (error instanceof OrderError) throw error;
      throw new OrderError('STORAGE_FAILURE');
    }
  }
  private load(requestId: string): { snapshot: OrderSnapshot; tail: string } {
    const row = this.db.prepare('SELECT * FROM orders WHERE request_id=?').get(requestId);
    if (!row) throw new OrderError('ORDER_MISSING');
    try {
      const binding = normalizeBinding(JSON.parse(String(row.binding_json)));
      if (bindingChecksum(binding) !== row.binding_hash || binding.planHash !== row.plan_hash) throw new Error();
      const s: OrderSnapshot = { mode: 'TEST_FIXTURE', executionEnabled: false, requestId, binding, revision: 0, lastAtMs: binding.createdAtMs, attemptAtMs: null, outcomeUnknown: false, cancelRequested: false, providerStatus: null, platformOrderId: null, txHash: null, settlement: null };
      let tail = digest({ requestId, binding });
      for (const row of this.db.prepare('SELECT * FROM events WHERE request_id=? ORDER BY sequence').all(requestId)) {
        const e = event(JSON.parse(String(row.payload)));
        const next = digest({ requestId, sequence: s.revision + 1, previousHash: tail, event: e });
        if (row.sequence !== s.revision + 1 || row.event_id !== e.eventId || row.previous_hash !== tail || row.event_hash !== next) throw new Error();
        reduce(s, e); tail = next;
      }
      if (row.revision !== s.revision || row.tail_hash !== tail) throw new Error();
      return { snapshot: s, tail };
    } catch { throw new OrderError('JOURNAL_CORRUPT'); }
  }
  reserve(requestId: string, value: OrderBinding): OrderSnapshot {
    uuid(requestId); const binding = normalizeBinding(value); const checksum = bindingChecksum(binding);
    return this.transaction(true, () => {
      const old = this.db.prepare('SELECT request_id, binding_hash FROM orders WHERE request_id=? OR plan_hash=?').all(requestId, binding.planHash);
      if (old.length) {
        if (old.length !== 1 || old[0]!.request_id !== requestId || old[0]!.binding_hash !== checksum) throw new OrderError('REQUEST_CONFLICT');
        return this.load(requestId).snapshot;
      }
      this.db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, 0, ?)').run(requestId, binding.planHash, JSON.stringify(binding), checksum, digest({ requestId, binding }));
      return this.load(requestId).snapshot;
    });
  }
  get(requestId: string): OrderSnapshot { uuid(requestId); return this.transaction(false, () => this.load(requestId).snapshot); }
  append(requestId: string, expectedRevision: number, value: OrderEvent): OrderSnapshot {
    uuid(requestId); const e = event(value);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new OrderError('INVALID_EVENT');
    return this.transaction(true, () => {
      const { snapshot: s, tail } = this.load(requestId);
      const old = this.db.prepare('SELECT payload FROM events WHERE request_id=? AND event_id=?').get(requestId, e.eventId);
      if (old) {
        if (old.payload !== JSON.stringify(e)) throw new OrderError('REQUEST_CONFLICT');
        return s;
      }
      if (s.revision !== expectedRevision) throw new OrderError('REVISION_CONFLICT');
      reduce(s, e);
      const next = digest({ requestId, sequence: s.revision, previousHash: tail, event: e });
      this.db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').run(requestId, s.revision, e.eventId, JSON.stringify(e), tail, next);
      this.db.prepare('UPDATE orders SET revision=?, tail_hash=? WHERE request_id=?').run(s.revision, next, requestId);
      return s;
    });
  }
}
