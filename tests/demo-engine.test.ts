import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_ASSETS,newDemoState,simulatePlan,assertFreshDemoQuote,executeDemoOrder,createDemoReceipt,verifyDemoReceipt,validDemoState,demoGuardReport} from '../web/demo-engine.js';
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
 assert.throws(()=>assertFreshDemoQuote(s,p.quote!,130000),/DEMO_QUOTE_EXPIRED/);
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

test('reloaded browser journal rejects forged cash, order events and position history',()=>{
 const original=newDemoState(),plan=simulatePlan(original,intent,10000);
 if(!plan.quote)throw Error('missing quote');
 const first=executeDemoOrder(original,plan.quote,10100).state;
 const nextPlan=simulatePlan(first,{...intent,cashTarget:'50'},11000);
 if(!nextPlan.quote)throw Error('missing second quote');
 const second=executeDemoOrder(first,nextPlan.quote,11100).state;
 assert.equal(validDemoState(second),true);
 const poisoned=[
  (s:typeof second)=>{s.cashCents+=100;},
  (s:typeof second)=>{s.positions.nova!+=1;},
  (s:typeof second)=>{s.orders[0]!.cashReceivedCents+=1;},
  (s:typeof second)=>{s.orders[0]!.afterMilli+=1;},
  (s:typeof second)=>{s.orders[0]!.events[2]!.type='SIMULATED_FILL';},
  (s:typeof second)=>{s.orders[1]!.cashAfterCents+=1;},
  (s:typeof second)=>{Object.assign(s.orders[1]!,{transactionHash:'0x'+'a'.repeat(64)});},
  (s:typeof second)=>{s.orders.push(s.orders[0]!);}
 ];
 for(const poison of poisoned){
  const copied=structuredClone(second);
  poison(copied);
  assert.equal(validDemoState(copied),false,'inconsistent fictional journal must be rejected before display');
 }
});
test('bounded synthetic quote search matches an independent exact-size oracle',()=>{
 const ceil=(n:number,b:number)=>Math.floor((n*b+9999)/10000);
 const minimum=(priceCents:number,m:number,impact:number)=>{
  const gross=Math.floor(m*priceCents/1000);
  return Math.max(0,gross-ceil(gross,15)-ceil(gross,impact)-ceil(gross,35));
 };
 for(const asset of DEMO_ASSETS){
  for(const retainPercent of [0,40,70,95]){
   for(const cashTarget of ['1','50','250','700','1500']){
    const plan=simulatePlan(newDemoState(),{...intent,assetId:asset.id,retainPercent,cashTarget},50000);
    if(plan.status==='BLOCKED')continue;
    const q=plan.quote!;const before=minimum(asset.priceCents,q.soldMilli-1,q.impactBps);
    assert.ok(q.minimumCents>=q.targetCents,asset.ticker);
    assert.ok(before<q.targetCents,asset.ticker+' must use minimal integer debit within synthetic model');
    assert.ok(q.remainingMilli>=q.floorMilli,asset.ticker);
    assert.equal(q.minimumCents,minimum(asset.priceCents,q.soldMilli,q.impactBps));
   }
  }
 }
});
test('simulation quote expiry cannot be extended by changing client-side quote fields',()=>{
 const s=newDemoState(),q=simulatePlan(s,intent,10000).quote;
 if(!q)throw Error('missing quote');
 assert.throws(()=>assertFreshDemoQuote(s,{...q,expiresAtMs:q.expiresAtMs+10000},11000),/DEMO_QUOTE_CHANGED/);
 assert.throws(()=>assertFreshDemoQuote(s,{...q,minimumCents:q.minimumCents-100},11000),/DEMO_QUOTE_CHANGED/);
});

test('guard report matches exact synthetic impact, stock floor and payout limits',()=>{
 const state=newDemoState(),plan=simulatePlan(state,intent,10000);
 const checks=demoGuardReport(state,intent,plan);
 assert.deepEqual(checks.map(x=>x.code),['MARKET','IMPACT','FLOOR','COVERAGE','QUOTE']);
 assert.ok(checks.every(c=>c.status==='pass'));
 assert.equal(checks.find(c=>c.code==='IMPACT')!.observed,'0.20%');
 assert.equal(checks.find(c=>c.code==='IMPACT')!.limit,'Your cap: 0.50%');
 assert.match(checks.find(c=>c.code==='FLOOR')!.limit,/9\.8 must remain/);
 assert.equal(checks.find(c=>c.code==='COVERAGE')!.limit,'250.00 demo USDT requested');
 assert.equal(checks.find(c=>c.code==='QUOTE')!.observed,plan.quote?.minimumCents!==undefined?(plan.quote.minimumCents/100).toFixed(2)+' USDT minimum':'');
});
test('risk explanations never suggest waiving a market halt or invent live quotes',()=>{
 const state=newDemoState();
 for(const [scenario,code] of [['paused','MARKET'],['stale','MARKET'],['volatile','IMPACT'],['thin','COVERAGE']] as const){
  const input={...intent,scenario},p=simulatePlan(state,input,10000);
  assert.equal(p.status,'BLOCKED');
  const report=demoGuardReport(state,input,p),reason=report.find(r=>r.code===code)!;
  assert.equal(reason.status,'blocked',scenario);
  assert.ok(reason.observed.length>0&&reason.limit.length>0&&reason.action.length>0);
 }
 const halted=demoGuardReport(state,{...intent,scenario:'paused',allowClosed:true},simulatePlan(state,{...intent,scenario:'paused',allowClosed:true},10000));
 assert.equal(halted.find(x=>x.code==='MARKET')?.status,'blocked');
 const closed={...intent,scenario:'closed',allowClosed:true};
 assert.equal(demoGuardReport(state,closed,simulatePlan(state,closed,10000)).find(x=>x.code==='MARKET')?.status,'caution');
 const invalid={...intent,cashTarget:'not-valid'};
 assert.equal(demoGuardReport(state,invalid,simulatePlan(state,invalid,10000))[0]?.code,'TARGET_FORMAT');
});
test('risk explanations preserve integer rounding at liquidity boundary',()=>{
 const state=newDemoState();
 const input={...intent,scenario:'thin',cashTarget:'250'};
 const p=simulatePlan(state,input,10000);
 assert.equal(p.status,'BLOCKED');
 const check=demoGuardReport(state,input,p).find(c=>c.code==='COVERAGE')!;
 assert.equal(check.status,'blocked');
 assert.match(check.action,/Reduce the target/);
 const actual=Number(check.observed.split(' ')[0]);
 assert.ok(actual>0&&actual<250);
});
