import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DurableSqlExecutionJournal } from '../cloudflare/journal.ts';
import { ExecutionEngine } from '../src/execution/engine-core.ts';
import { executionFixture, time } from './fixtures/execution.ts';

function mockDurableStore() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: {exec(query: string, ...values: (string | number)[]) {
      const statement = db.prepare(query);
      const rows: Record<string, unknown>[] = statement.columns().length ? statement.all(...values) as Record<string,unknown>[] :
        (statement.run(...values), []);
      return {toArray:()=>rows};
    }},
    transactionSync<T>(fn:()=>T):T {
      db.exec('BEGIN IMMEDIATE');
      try {const output=fn();db.exec('COMMIT');return output;}
      catch(e){db.exec('ROLLBACK');throw e;}
    }
  };
  return { db, storage };
}
async function prepared() {
  const {db,storage}=mockDurableStore();
  const key=randomBytes(32).toString('hex');
  const store=new DurableSqlExecutionJournal(storage,key);
  const f=executionFixture(time);
  const engine=new ExecutionEngine({
    reader:f.reader, vendor:{ async submit() {throw Error('TEST_MUST_NOT_SUBMIT');}, async status(){throw Error('TEST_MUST_NOT_POLL');}},
    rpcs:[f.rpc,f.rpc], store, pins:f.pins, maximumStockFeeRaw:'3', mode:'TEST_FIXTURE',now:()=>time
  });
  const order=await engine.prepare(f.wallet,f.input);
  return {db,storage,key,store,f,engine,order};
}
test('Cloudflare SQLite journal persists encrypted order across object restart',async t=>{
  const s=await prepared();t.after(()=>s.db.close());
  assert.equal(s.store.probe(),true);
  const rows=s.db.prepare('SELECT payload,uid,wallet,revision FROM execution_orders').all() as {payload:string;uid:string;wallet:string;revision:number}[];
  assert.equal(rows.length,1);
  assert.ok(!rows[0]!.payload.includes(s.f.wallet));
  assert.ok(!rows[0]!.payload.includes('typedData'));
  assert.notEqual(rows[0]!.uid,s.order.auth.orderUid);
  assert.notEqual(rows[0]!.wallet,s.f.wallet);
  const reopened=new DurableSqlExecutionJournal(s.storage,s.key);
  assert.equal(reopened.get(s.order.id,s.f.wallet).state,'PREPARED');
  assert.equal(reopened.get(s.order.id,s.f.wallet).revision,0);
});
test('Cloudflare SQLite CAS and active-wallet lock survive object re-instantiation',async t=>{
  const s=await prepared();t.after(()=>s.db.close());
  const original=s.store.get(s.order.id,s.f.wallet);
  assert.throws(()=>s.store.create({...original,id:randomUUID()}),/ACTIVE_ORDER_EXISTS/);
  const change=s.store.change(s.order.id,s.f.wallet,0,r=>{r.signaturePrompted=true;r.lastAtMs=time;});
  assert.equal(change.revision,1);
  assert.throws(()=>s.store.change(s.order.id,s.f.wallet,0,()=>{}),/STATE_CONFLICT/);
  const reopened=new DurableSqlExecutionJournal(s.storage,s.key);
  assert.equal(reopened.get(s.order.id,s.f.wallet).signaturePrompted,true);
  assert.equal(reopened.get(s.order.id,s.f.wallet).revision,1);
  assert.throws(()=>reopened.get(s.order.id,'0x3333333333333333333333333333333333333333'),/ORDER_NOT_FOUND/);
});
test('Cloudflare journal rejects key changes, payload tampering and rolled-back revision',async t=>{
  const s=await prepared();t.after(()=>s.db.close());
  const wrong=new DurableSqlExecutionJournal(s.storage,randomBytes(32).toString('hex'));
  assert.throws(()=>wrong.get(s.order.id,s.f.wallet),/STORAGE_CORRUPT/);
  s.db.prepare('UPDATE execution_orders SET revision=4').run();
  assert.throws(()=>s.store.get(s.order.id,s.f.wallet),/STORAGE_CORRUPT/);
});
test('Cloudflare journal reclaims wallet lock only for unsigned cancelled order',async t=>{
  const s=await prepared();t.after(()=>s.db.close());
  const original=s.store.get(s.order.id,s.f.wallet);
  const cancelled=s.store.change(s.order.id,s.f.wallet,0,r=>{r.state='CANCELLED';r.lastAtMs=time;});
  assert.equal(cancelled.state,'CANCELLED');
  const next=s.store.create({...original,id:randomUUID(),auth:{...original.auth,orderUid:'0x'+'9'.repeat(112)}});
  assert.equal(next.state,'PREPARED');
  assert.throws(()=>s.store.create({...original,id:randomUUID(),auth:{...original.auth,orderUid:'0x'+'8'.repeat(112)}}),/ACTIVE_ORDER_EXISTS/);
});
test('Cloudflare journal refuses invalid encryption keys',()=>{
  const {db,storage}=mockDurableStore();
  try {assert.throws(()=>new DurableSqlExecutionJournal(storage,'invalid'),/STORAGE_KEY_INVALID/);}
  finally{db.close();}
});
