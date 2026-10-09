import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DurableSqlExecutionJournal } from '../cloudflare/journal.ts';
import { sealEncryptedBackup, openEncryptedBackup } from '../cloudflare/backup.ts';
import { ExecutionEngine } from '../src/execution/engine-core.ts';
import { executionFixture, time } from './fixtures/execution.ts';

function storage() {
  const db=new DatabaseSync(':memory:');
  const adapter={
    sql:{exec(query:string,...args:(string|number)[]) {
      const statement=db.prepare(query);
      const rows=statement.columns().length ?
        statement.all(...args) as Record<string,unknown>[] :
        (statement.run(...args),[]);
      return {toArray:()=>rows};
    }},
    transactionSync<T>(callback:()=>T):T {
      db.exec('BEGIN IMMEDIATE');
      try {const value=callback();db.exec('COMMIT');return value;}
      catch(e){db.exec('ROLLBACK');throw e;}
    }
  };
  return {db,adapter};
}
async function fixture(t:import('node:test').TestContext) {
  const s=storage();t.after(()=>s.db.close());
  const key=randomBytes(32).toString('hex'), journal=new DurableSqlExecutionJournal(s.adapter,key);
  const f=executionFixture(time);
  const engine=new ExecutionEngine({
    reader:f.reader,vendor:{
      async submit() {throw Error('NO_TRADE_ALLOWED');},
      async status() {throw Error('NO_TRADE_ALLOWED');}
    },
    rpcs:[f.rpc,f.rpc],store:journal,pins:f.pins,maximumStockFeeRaw:'3',
    mode:'TEST_FIXTURE',now:()=>time
  });
  const order=await engine.prepare(f.wallet,f.input);
  return {s,key,journal,f,engine,order};
}
test('sealed snapshot contains no wallet, order UID, token or user signature',async t=>{
  const s=await fixture(t);
  const plain=s.journal.exportRows();
  const sealed=sealEncryptedBackup(plain,s.key,time);
  assert.equal(Buffer.from(sealed).includes(Buffer.from(s.f.wallet)),false);
  assert.equal(Buffer.from(sealed).includes(Buffer.from('typedData')),false);
  assert.equal(Buffer.from(sealed).includes(Buffer.from(s.order.auth.orderUid)),false);
  const recovered=openEncryptedBackup(sealed,s.key);
  assert.equal(recovered.kind,'REMAIN_CLOUDFLARE_LEDGER_BACKUP_V1');
  assert.equal(recovered.createdAtMs,time);
  assert.equal(recovered.count,1);
  assert.deepEqual(recovered.rows,plain);
});
test('restore recreates exact persisted revision and enforces active-wallet lock',async t=>{
  const s=await fixture(t);
  const next=s.journal.change(s.order.id,s.f.wallet,0,r=>{r.signaturePrompted=true;r.lastAtMs=time;});
  assert.equal(next.revision,1);
  const blob=sealEncryptedBackup(s.journal.exportRows(),s.key,time);
  const fresh=storage();t.after(()=>fresh.db.close());
  const target=new DurableSqlExecutionJournal(fresh.adapter,s.key);
  assert.equal(target.restoreRows(openEncryptedBackup(blob,s.key).rows),1);
  assert.equal(target.get(s.order.id,s.f.wallet).revision,1);
  assert.equal(target.get(s.order.id,s.f.wallet).signaturePrompted,true);
  assert.throws(()=>target.restoreRows(openEncryptedBackup(blob,s.key).rows),/RESTORE_REQUIRES_EMPTY_JOURNAL/);
  assert.throws(()=>target.create({...s.journal.get(s.order.id,s.f.wallet),id:'00000000-0000-4000-8000-000000000001',revision:0,
    auth:{...s.journal.get(s.order.id,s.f.wallet).auth,orderUid:('0x'+'a'.repeat(112)) as `0x${string}`}}),/ACTIVE_ORDER_EXISTS/);
});
test('wrong secret, any altered byte and truncated snapshot fail authentication',async t=>{
  const s=await fixture(t);
  const encrypted=sealEncryptedBackup(s.journal.exportRows(),s.key,time);
  assert.throws(()=>openEncryptedBackup(encrypted,randomBytes(32).toString('hex')),/STORAGE_CORRUPT/);
  const changed=Uint8Array.from(encrypted);changed[changed.length-1]!^=1;
  assert.throws(()=>openEncryptedBackup(changed,s.key),/STORAGE_CORRUPT/);
  assert.throws(()=>openEncryptedBackup(encrypted.subarray(0,10),s.key),/STORAGE_CORRUPT/);
});
test('corrupt source never produces a sealed snapshot and failed restores leave fresh storage empty',async t=>{
  const s=await fixture(t);
  const snapshot=s.journal.exportRows();
  const fresh=storage();t.after(()=>fresh.db.close());
  const journal=new DurableSqlExecutionJournal(fresh.adapter,s.key);
  const malformed={...snapshot[0]!,revision:99};
  assert.throws(()=>journal.restoreRows([malformed]),/STORAGE_CORRUPT/);
  assert.equal(journal.exportRows().length,0);
  s.s.db.prepare('UPDATE execution_orders SET revision=100').run();
  assert.throws(()=>s.journal.exportRows(),/STORAGE_CORRUPT/);
});
