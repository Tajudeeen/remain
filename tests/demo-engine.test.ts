import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_ASSETS,newDemoState,simulatePlan,assertFreshDemoQuote,executeDemoOrder,createDemoReceipt,verifyDemoReceipt,validDemoState} from '../web/demo-engine.js';
const intent={assetId:'nova',cashTarget:'250',retainPercent:70,maxImpactBps:50,scenario:'regular',allowClosed:false};
test('a minimum-input quote preserves the floor and the cash target',()=>{
 const s=newDemoState(),p=simulatePlan(s,intent,10000);assert.equal(p.status,'READY');if(!p.quote)throw Error('quote missing');
 const q=p.quote;assert.ok(q.minimumCents>=25000);assert.ok(q.remainingMilli>=q.floorMilli);assert.equal(q.balanceMilli,s.positions.nova!);
 assert.equal(q.chainTransaction,null);assert.equal(q.mode,'SIMULATION');
 assert.ok(simulatePlan(s,{...intent,cashTarget:'250',retainPercent:100},10000).status==='BLOCKED');
});
test('BellGuard blocks paused, unapproved closed, volatile, thin and stale scenarios',()=>{
 const s=newDemoState();
 for(const scenario of ['paused','closed','volatile','thin','stale']){
  const p=simulatePlan(s,{...intent,scenario},10000);
  assert.equal(p.status,'BLOCKED',scenario);
 }
 assert.equal(simulatePlan(s,{...intent,scenario:'closed',allowClosed:true},10000).status,'READY');
 assert.equal(simulatePlan(s,{...intent,scenario:'volatile',maxImpactBps:200},10000).status,'READY');
});
test('invalid amounts and malformed intents are rejected',()=>{
 const s=newDemoState();
 for(const cashTarget of ['0','-1','0.001','1e4','50001','Infinity','1.234']){
  assert.equal(simulatePlan(s,{...intent,cashTarget},10000).status,'BLOCKED',cashTarget);
 }
 for(const retainPercent of [-1,101,NaN,0.1]){
  assert.equal(simulatePlan(s,{...intent,retainPercent},10000).status,'BLOCKED');
 }
 assert.equal(simulatePlan(s,{...intent,assetId:'not-listed'},10000).status,'BLOCKED');
});
test('quote expiry, stale epochs and tampering fail closed',()=>{
 const s=newDemoState(),p=simulatePlan(s,intent,10000);
 if(!p.quote)throw Error('no quote');
 assert.throws(()=>assertFreshDemoQuote(s,p.quote!,55000),/DEMO_QUOTE_EXPIRED/);
 assert.throws(()=>assertFreshDemoQuote(s,{...p.quote!,soldMilli:p.quote!.soldMilli+1},11000),/DEMO_QUOTE_CHANGED/);
 const result=executeDemoOrder(s,p.quote,11000);
 assert.throws(()=>executeDemoOrder(result.state,p.quote!,12000),/DEMO_QUOTE_EXPIRED/);
 assert.equal(s.cashCents,35000,'original state remains unmodified');
});
test('simulated settlement updates one asset, USDT accounting and receipt',async()=>{
 const s=newDemoState(),p=simulatePlan(s,intent,10000);if(!p.quote)throw Error('no quote');
 const {state,order}=executeDemoOrder(s,p.quote,11000);
 assert.ok(validDemoState(state));assert.equal(state.epoch,1);
 assert.equal(state.positions.nova,s.positions.nova!-p.quote.soldMilli);
 assert.equal(state.positions.orbit,s.positions.orbit);
 assert.equal(state.cashCents-s.cashCents,order.cashReceivedCents);
 assert.ok(order.cashReceivedCents>=p.quote.minimumCents);
 assert.equal(order.transactionHash,null);assert.equal(order.signature,null);
 const receipt=await createDemoReceipt(order);
 assert.equal(await verifyDemoReceipt(receipt),true);
 assert.equal(await verifyDemoReceipt({...receipt,sha256:'0'.repeat(64)}),false);
 const altered=structuredClone(receipt);altered.payload.order.cashAfterCents+=1;
 assert.equal(await verifyDemoReceipt(altered),false);
 const forged=structuredClone(receipt);Object.assign(forged.payload.order,{transactionHash:'0x'+'a'.repeat(64)});
 assert.equal(await verifyDemoReceipt(forged),false);
});
test('repeated orders cannot release stock below floor',()=>{
 let s=newDemoState();
 for(let i=0;i<7;i++){
  const p=simulatePlan(s,{...intent,cashTarget:'50'},10000+i*100);
  if(!p.quote)break;
  s=executeDemoOrder(s,p.quote,10100+i*100).state;
  assert.ok(s.positions.nova!>=0);
 }
 assert.ok(s.positions.nova!<=DEMO_ASSETS[0]!.startingMilli);
});
