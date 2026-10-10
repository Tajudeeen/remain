// Remain Paper Studio. This module has NO wallet, fetch, RPC, or signing imports.
// All amounts are integer cents (USDT) or thousandths of a fictional share.
export const DEMO_ASSETS = Object.freeze([
  Object.freeze({id:'nova',name:'Nova Systems',ticker:'NOVA-SIM',sector:'AI infrastructure',priceCents:18750,startingMilli:14000,accent:'#E5BD55'}),
  Object.freeze({id:'orbit',name:'Orbit Industries',ticker:'ORBT-SIM',sector:'Industrial technology',priceCents:26000,startingMilli:9000,accent:'#ACCBBA'}),
  Object.freeze({id:'vector',name:'Vector Labs',ticker:'VCTR-SIM',sector:'Semiconductors',priceCents:8600,startingMilli:18000,accent:'#AFA6DB'})
]);
export const DEMO_NOTICE='SIMULATED · fictional assets, prices, USDT and fills. No wallet, Binance quote, signature or blockchain transaction.';
const quoteLifetimeMs=120000;
const scenarios=Object.freeze({
  regular:{label:'Regular market',impactBps:20,liquidityMilli:50000,open:true},
  closed:{label:'Underlying market closed',impactBps:35,liquidityMilli:50000,open:false},
  paused:{label:'Market halted',impactBps:20,liquidityMilli:50000,open:false},
  volatile:{label:'High volatility',impactBps:195,liquidityMilli:50000,open:true},
  thin:{label:'Thin liquidity',impactBps:65,liquidityMilli:900,open:true},
  stale:{label:'Stale market snapshot',impactBps:20,liquidityMilli:50000,open:true}
});
const isInt=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const money=(x)=>{if(typeof x!=='string'||!/^(0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(x))throw Error('INVALID_CASH_TARGET');const [a,b='']=x.split('.');const cents=Number(a)*100+Number((b+'00').slice(0,2));if(!isInt(cents,1,5000000))throw Error('INVALID_CASH_TARGET');return cents;};
const ceilBps=(n,bps)=>Math.floor((n*bps+9999)/10000);
const asAsset=id=>DEMO_ASSETS.find(a=>a.id===id);
export const demoMoney=cents=>(cents/100).toFixed(2);
export const demoUnits=milli=>(milli/1000).toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
export function newDemoState(){
  return {version:1,epoch:0,cashCents:35000,positions:Object.fromEntries(DEMO_ASSETS.map(a=>[a.id,a.startingMilli])),orders:[]};
}
export function validDemoState(value){
  if(!value||typeof value!=='object'||value.version!==1||!isInt(value.epoch,0,9999)||!isInt(value.cashCents,0,200000000)||
    !value.positions||typeof value.positions!=='object'||!Array.isArray(value.orders)||value.orders.length>16)return false;
  if(!DEMO_ASSETS.every(a=>isInt(value.positions[a.id],0,a.startingMilli)))return false;
  if(Object.keys(value.positions).length!==DEMO_ASSETS.length)return false;
  // Browser storage is not authenticated, but even a fictional journal must
  // reconcile across transactions. The newest event balances equal current
  // state; walking backwards must reconstruct all retained local history.
  if(value.epoch<value.orders.length)return false;
  let cash=value.cashCents;
  const balances={...value.positions},seen=new Set();
  const stages=['INTENT_ACCEPTED','BELLGUARD_PASSED','USER_CONFIRMED','SIMULATED_FILL','ACCOUNTING_RECONCILED'];
  for(const o of value.orders){
    const asset=asAsset(o?.assetId);
    if(!asset||o.kind!=='REMAIN_SIMULATED_ORDER_V1'||o.mode!=='SIMULATION'||
      o.status!=='SETTLED_SIMULATION'||o.ticker!==asset.ticker||
      typeof o.id!=='string'||!/^SIM-[0-9]+-[0-9]+-(?:nova|orbit|vector)$/.test(o.id)||
      seen.has(o.id)||!isInt(o.createdAtMs,0,9999999999999)||
      !isInt(o.soldMilli,1,50000)||!isInt(o.beforeMilli,0,asset.startingMilli)||
      !isInt(o.afterMilli,0,asset.startingMilli)||!isInt(o.floorMilli,0,asset.startingMilli)||
      o.beforeMilli-o.soldMilli!==o.afterMilli||o.afterMilli<o.floorMilli||
      !isInt(o.cashBeforeCents,0,200000000)||!isInt(o.cashAfterCents,0,200000000)||
      !isInt(o.cashReceivedCents,1,10000000)||o.cashAfterCents!==o.cashBeforeCents+o.cashReceivedCents||
      !isInt(o.minimumCents,1,10000000)||!isInt(o.targetCents,1,10000000)||
      o.cashReceivedCents<o.minimumCents||o.minimumCents<o.targetCents||
      !isInt(o.impactBps,0,500)||o.signature!==null||
      o.transactionHash!==null||o.blockNumber!==null||
      !Array.isArray(o.events)||o.events.length!==5||
      o.events.some((e,i)=>!e||e.sequence!==i+1||e.type!==stages[i]||e.atMs!==o.createdAtMs)||
      cash!==o.cashAfterCents||balances[o.assetId]!==o.afterMilli)return false;
    seen.add(o.id);
    cash=o.cashBeforeCents;
    balances[o.assetId]=o.beforeMilli;
  }
  return true;
}
export function simulatePlan(state,intent,now=Date.now()){
  const blocked=reasons=>({status:'BLOCKED',reasons,quote:null});
  if(!validDemoState(state)||!isInt(now,0,9999999999999)||!intent||typeof intent!=='object')return blocked(['Invalid simulation state or request.']);
  const asset=asAsset(intent.assetId),scenario=scenarios[intent.scenario];
  if(!asset||!scenario||!isInt(intent.retainPercent,0,100)||!isInt(intent.maxImpactBps,0,500)||
    typeof intent.allowClosed!=='boolean')return blocked(['Choose a valid demo stock and safety limits.']);
  let targetCents;try{targetCents=money(intent.cashTarget);}catch{return blocked(['Enter a cash target between 0.01 and 50,000.00 USDT.']);}
  const reasons=[],balance=state.positions[asset.id];
  const floorMilli=Math.ceil(balance*intent.retainPercent/100);
  const maxStockMilli=balance-floorMilli;
  if(intent.scenario==='paused')reasons.push('BellGuard: market halted. Permission cannot override a halt.');
  if(intent.scenario==='stale')reasons.push('BellGuard: market snapshot stale. Refresh data before planning.');
  if(!scenario.open && intent.scenario==='closed' && !intent.allowClosed)reasons.push('BellGuard: explicitly allow closed-market planning.');
  if(scenario.impactBps>intent.maxImpactBps)reasons.push('BellGuard: simulated price impact exceeds your cap.');
  if(maxStockMilli<=0)reasons.push('BellGuard: retained floor leaves no stock available.');
  if(reasons.length)return blocked(reasons);
  const feeBps=15,slippageBps=35,impactBps=scenario.impactBps;
  const bound=m=>{const gross=Math.floor(m*asset.priceCents/1000);
    const fee=ceilBps(gross,feeBps),impact=ceilBps(gross,impactBps),slippage=ceilBps(gross,slippageBps);
    return {grossCents:gross,feeCents:fee,impactCents:impact,slippageCents:slippage,
      expectedCents:Math.max(0,gross-fee-impact),minimumCents:Math.max(0,gross-fee-impact-slippage)};};
  const limit=Math.min(maxStockMilli,scenario.liquidityMilli);
  if(bound(limit).minimumCents<targetCents){
    return blocked([scenario.liquidityMilli<maxStockMilli?'BellGuard: demo liquidity cannot cover this target.':'BellGuard: cash target exceeds the sale permitted by your retained floor.']);
  }
  let lo=1,hi=limit;
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(bound(mid).minimumCents>=targetCents)hi=mid;else lo=mid+1;}
  const amounts=bound(lo);
  const quote={
    id:'SIM-'+state.epoch+'-'+now+'-'+asset.id,epoch:state.epoch,assetId:asset.id,ticker:asset.ticker,
    input:{assetId:asset.id,cashTarget:intent.cashTarget,retainPercent:intent.retainPercent,maxImpactBps:intent.maxImpactBps,
      scenario:intent.scenario,allowClosed:intent.allowClosed},
    targetCents,balanceMilli:balance,floorMilli,soldMilli:lo,remainingMilli:balance-lo,
    ...amounts,impactBps,feeBps,slippageBps,issuedAtMs:now,expiresAtMs:now+quoteLifetimeMs,
    venue:'Remain simulated RFQ',mode:'SIMULATION',chainTransaction:null
  };
  return {status:'READY',reasons:[],quote};
}
// All diagnostics are derived from the same synthetic price/impact/floor model
// as simulatePlan. No diagnosis can authorize execution or waive a failed guard.
export function demoGuardReport(state,intent,result){
 const row=(code,status,label,observed,limit,action)=>({code,status,label,observed,limit,action});
 if(!validDemoState(state)||!intent||!result||!['READY','BLOCKED'].includes(result.status))
  return [row('INVALID','blocked','Simulation inputs','Invalid demo request','Valid fictional portfolio and limits','Reset and re-enter values.')];
 const asset=asAsset(intent.assetId),scenario=scenarios[intent.scenario];
 if(!asset||!scenario||!isInt(intent.retainPercent,0,100)||!isInt(intent.maxImpactBps,0,500)||typeof intent.allowClosed!=='boolean')
  return [row('INVALID','blocked','Simulation inputs','Invalid stock, scenario or limits','A fictional stock and valid risk limits','Choose a stock and restore valid limits.')];
 let target;try{target=money(intent.cashTarget);}catch{
  return [row('TARGET_FORMAT','blocked','Cash target','Invalid amount','0.01–50,000.00 demo USDT','Enter a positive amount with at most two decimals.')];
 }
 const balance=state.positions[asset.id],floor=Math.ceil(balance*intent.retainPercent/100);
 const sellable=balance-floor,limit=Math.max(0,Math.min(sellable,scenario.liquidityMilli));
 const feeBps=15,slippageBps=35,netMax=m=>{
  const gross=Math.floor(m*asset.priceCents/1000);
  return Math.max(0,gross-ceilBps(gross,feeBps)-ceilBps(gross,scenario.impactBps)-ceilBps(gross,slippageBps));
 };
 const pct=bps=>(bps/100).toFixed(2)+'%';
 let marketStatus='pass',marketAction='This fictional market state permits planning.';
 if(intent.scenario==='paused'){
  marketStatus='blocked';marketAction='A halt cannot be overridden. Try the regular-market scenario to compare behavior.';
 }else if(intent.scenario==='stale'){
  marketStatus='blocked';marketAction='Stale observations must block planning. Select the fresh regular-market test scenario.';
 }else if(intent.scenario==='closed'){
  marketStatus=intent.allowClosed?'caution':'blocked';
  marketAction=intent.allowClosed?'Closed-market planning is explicitly permitted; the reference price remains fictional.':'Tick Allow closed-market planning to explore this case. Never override a halt.';
 }
 const impactBlocked=scenario.impactBps>intent.maxImpactBps;
 const floorBlocked=sellable<=0,coverageBlocked=netMax(limit)<target;
 const checks=[
  row('MARKET',marketStatus,'Market state',scenario.label,intent.scenario==='closed'?'Explicit closed-market permission':'No halt, stale data or unapproved closure',marketAction),
  row('IMPACT',impactBlocked?'blocked':'pass','Price impact',pct(scenario.impactBps),'Your cap: '+pct(intent.maxImpactBps),impactBlocked?'Synthetic impact exceeds the selected cap. Try regular market, or deliberately choose a different risk limit.':'Synthetic impact is within the selected cap.'),
  row('FLOOR',floorBlocked?'blocked':'pass','Retained exposure',demoUnits(balance)+' '+asset.ticker+' held',demoUnits(floor)+' must remain · '+demoUnits(Math.max(0,sellable))+' sellable',floorBlocked?'Lower the retained percentage only if you want to release more fictional shares.':'Any proposed debit must leave the retained floor intact.'),
  row('COVERAGE',coverageBlocked?'blocked':'pass','Net cash coverage',demoMoney(netMax(limit))+' demo USDT maximum',demoMoney(target)+' demo USDT requested',coverageBlocked?(scenario.liquidityMilli<sellable?'Fictional liquidity is too thin. Reduce the target or use a different scenario.':'The retained floor limits your sale. Reduce the target or deliberately change the floor.'):'Maximum synthetic net proceeds cover the target.')
 ];
 if(result.status==='READY'&&result.quote){
  checks.push(row('QUOTE','pass','Guarded output',demoMoney(result.quote.minimumCents)+' USDT minimum','At least '+demoMoney(target)+' demo USDT','This synthetic quote expires in 45 seconds. It is not a live trading price.'));
 }
 return checks;
}
export function assertFreshDemoQuote(state,quote,now=Date.now()){
  if(!quote||quote.mode!=='SIMULATION'||!isInt(now,0,9999999999999)||
     now<quote.issuedAtMs||now>=quote.expiresAtMs||quote.epoch!==state.epoch)throw Error('DEMO_QUOTE_EXPIRED');
  const rebuilt=simulatePlan(state,quote.input,quote.issuedAtMs);
  if(rebuilt.status!=='READY'||!rebuilt.quote||
    !['id','assetId','balanceMilli','floorMilli','soldMilli','remainingMilli','grossCents','feeCents',
      'impactCents','slippageCents','expectedCents','minimumCents','targetCents','issuedAtMs','expiresAtMs','mode','feeBps','slippageBps'].every(k=>quote[k]===rebuilt.quote[k]))
    throw Error('DEMO_QUOTE_CHANGED');
  if(state.orders.some(o=>o.id===quote.id))throw Error('DEMO_ORDER_ALREADY_PROCESSED');
  return true;
}
export function executeDemoOrder(state,quote,now=Date.now()){
  assertFreshDemoQuote(state,quote,now);
  const actualCents=quote.expectedCents;
  if(actualCents<quote.minimumCents||actualCents<quote.targetCents)throw Error('DEMO_MINIMUM_NOT_MET');
  const before=state.positions[quote.assetId],cashBefore=state.cashCents;
  const after=before-quote.soldMilli;
  if(after<quote.floorMilli)throw Error('DEMO_FLOOR_BREACH');
  const eventTypes=['INTENT_ACCEPTED','BELLGUARD_PASSED','USER_CONFIRMED','SIMULATED_FILL','ACCOUNTING_RECONCILED'];
  const order={
    kind:'REMAIN_SIMULATED_ORDER_V1',id:quote.id,mode:'SIMULATION',assetId:quote.assetId,ticker:quote.ticker,
    createdAtMs:now,soldMilli:quote.soldMilli,beforeMilli:before,afterMilli:after,floorMilli:quote.floorMilli,
    cashBeforeCents:cashBefore,cashAfterCents:cashBefore+actualCents,cashReceivedCents:actualCents,
    minimumCents:quote.minimumCents,targetCents:quote.targetCents,impactBps:quote.impactBps,
    events:eventTypes.map((type,index)=>({sequence:index+1,type,atMs:now})),
    status:'SETTLED_SIMULATION',transactionHash:null,blockNumber:null,signature:null
  };
  const next={version:1,epoch:state.epoch+1,cashCents:cashBefore+actualCents,
    positions:{...state.positions,[quote.assetId]:after},
    orders:[order,...state.orders].slice(0,16)};
  if(!validDemoState(next))throw Error('INVALID_DEMO_STATE');
  return {state:next,order};
}
export function demoReceiptPayload(order){
  return {kind:'REMAIN_DEMO_RECEIPT_V1',mode:'SIMULATION',authenticity:'NONE',notice:DEMO_NOTICE,order};
}
export async function digestDemoPayload(payload){
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const buffer=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function createDemoReceipt(order){
  const payload=demoReceiptPayload(order);
  return {payload,sha256:await digestDemoPayload(payload)};
}
export async function verifyDemoReceipt(receipt){
  try{
    if(!receipt||!receipt.payload||typeof receipt.sha256!=='string'||!/^[a-f0-9]{64}$/.test(receipt.sha256))return false;
    const p=receipt.payload,o=p.order;
    if(p.kind!=='REMAIN_DEMO_RECEIPT_V1'||p.mode!=='SIMULATION'||p.authenticity!=='NONE'||p.notice!==DEMO_NOTICE||
      !o||o.kind!=='REMAIN_SIMULATED_ORDER_V1'||o.mode!=='SIMULATION'||o.status!=='SETTLED_SIMULATION'||
      o.signature!==null||o.transactionHash!==null||o.blockNumber!==null||!asAsset(o.assetId)||o.ticker!==asAsset(o.assetId).ticker||
      !isInt(o.beforeMilli,0,50000)||!isInt(o.soldMilli,1,50000)||!isInt(o.afterMilli,0,50000)||
      o.beforeMilli-o.soldMilli!==o.afterMilli||o.afterMilli<o.floorMilli||
      !isInt(o.cashBeforeCents,0,200000000)||!isInt(o.cashReceivedCents,1,10000000)||
      o.cashAfterCents!==o.cashBeforeCents+o.cashReceivedCents||
      o.cashReceivedCents<o.minimumCents||o.minimumCents<o.targetCents||
      !Array.isArray(o.events)||o.events.length!==5||
      o.events.some((e,i)=>e.sequence!==i+1||e.type!==['INTENT_ACCEPTED','BELLGUARD_PASSED','USER_CONFIRMED','SIMULATED_FILL','ACCOUNTING_RECONCILED'][i]||e.atMs!==o.createdAtMs))return false;
    return await digestDemoPayload(p)===receipt.sha256;
  }catch{return false;}
}