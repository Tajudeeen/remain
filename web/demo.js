import {DEMO_ASSETS,DEMO_NOTICE,demoMoney,demoUnits,newDemoState,validDemoState,simulatePlan,
  assertFreshDemoQuote,executeDemoOrder,createDemoReceipt,verifyDemoReceipt,demoGuardReport} from './demo-engine.js';
const $=id=>document.getElementById(id);
const KEY='remain-paper-studio-v1';
const readState=()=>{try{const value=JSON.parse(sessionStorage.getItem(KEY)||'null');return validDemoState(value)?value:newDemoState();}catch{return newDemoState();}};
const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify(state));return true;}catch{return false;}};
const notice=(message,bad=false)=>{$('demo-message').textContent=message;$('demo-message').classList.toggle('error',bad);};
let state=readState(),draft=null,stage='IDLE',busy=false,latestReceipt=null;
function intent(){
 return {assetId:$('demo-asset').value,cashTarget:$('demo-target').value.trim(),
  retainPercent:Number($('demo-retain').value),maxImpactBps:Number($('demo-impact').value),
  scenario:$('demo-market').value,allowClosed:$('demo-closed').checked};
}
function updatePortfolio(){
 const box=$('demo-assets');box.replaceChildren();
 for(const asset of DEMO_ASSETS){
  const qty=state.positions[asset.id];const item=document.createElement('button');
  item.type='button';item.className='paper-asset'+($('demo-asset').value===asset.id?' selected':'');
  item.setAttribute('aria-pressed',String($('demo-asset').value===asset.id));
  item.addEventListener('click',()=>{$('demo-asset').value=asset.id;invalidate();});
  const visual=document.createElement('span');visual.className='paper-asset-icon';visual.textContent=asset.ticker.slice(0,1);
  visual.style.setProperty('--asset-accent',asset.accent);
  const heading=document.createElement('span');heading.className='paper-asset-info';
  const strong=document.createElement('strong');strong.textContent=asset.name;
  const small=document.createElement('small');small.textContent=asset.ticker+' · '+asset.sector;
  heading.append(strong,small);
  const units=document.createElement('span');units.className='paper-asset-quantity';
  const amount=document.createElement('strong');amount.textContent=demoUnits(qty);
  const caption=document.createElement('small');caption.textContent='demo shares';
  units.append(amount,caption);
  item.append(visual,heading,units);box.append(item);
 }
 $('demo-cash').textContent=demoMoney(state.cashCents)+' USDT';
 $('demo-order-count').textContent=String(state.orders.length);
 const asset=DEMO_ASSETS.find(x=>x.id===$('demo-asset').value)||DEMO_ASSETS[0];
 $('demo-price').textContent=demoMoney(asset.priceCents)+' USDT';
 $('demo-holding').textContent=demoUnits(state.positions[asset.id])+' '+asset.ticker;
 const estimate=DEMO_ASSETS.reduce((sum,a)=>sum+Math.floor(state.positions[a.id]*a.priceCents/1000),state.cashCents);
 $('demo-worth').textContent=demoMoney(estimate)+' USDT';
}
function progress(){
 const labels=['01 · TARGET','02 · GUARD','03 · REVIEW','04 · SIMULATED'];
 const position=stage==='IDLE'?0:stage==='READY'?1:stage==='REVIEW'?2:3;
 for(let i=0;i<labels.length;i++){
  const el=$('demo-step-'+i);el.classList.toggle('active',i<=position);
  el.classList.toggle('current',i===position);
 }
}
function renderGuardChecks(checks){
 const root=$('demo-guard-checks'),details=$('demo-guard-details');
 root.replaceChildren();root.hidden=!checks.length;details.hidden=!checks.length;
 details.open=checks.some(c=>c.status==='blocked'||c.status==='caution');
 for(const check of checks){
  const line=document.createElement('div');line.className='paper-guard-row';
  line.dataset.status=check.status;line.dataset.rule=check.code;
  const head=document.createElement('div');head.className='paper-guard-head';
  const label=document.createElement('strong');label.textContent=check.label;
  const status=document.createElement('span');status.textContent=check.status==='blocked'?'BLOCKED':check.status==='caution'?'CAUTION':'PASS';
  head.append(label,status);
  const observed=document.createElement('p');observed.textContent='Observed: '+check.observed;
  const limit=document.createElement('p');limit.textContent='Rule: '+check.limit;
  const action=document.createElement('p');action.className='paper-guard-action';action.textContent=check.action;
  line.append(head,observed,limit,action);root.append(line);
 }
}
function renderOutcome(value,settled){
 const asset=DEMO_ASSETS.find(x=>x.id===value.assetId);
 const before=settled?value.beforeMilli:value.balanceMilli;
 const after=settled?value.afterMilli:value.remainingMilli;
 const received=settled?value.cashReceivedCents:value.expectedCents;
 const cashBefore=settled?value.cashBeforeCents:state.cashCents;
 const cashAfter=settled?value.cashAfterCents:cashBefore+received;
 $('demo-outcome').hidden=false;
 $('demo-outcome').dataset.phase=settled?'settled':'projected';
 $('demo-outcome-tag').textContent=settled?'SIMULATED FILL COMPLETE':'PROJECTED · SYNTHETIC';
 $('demo-outcome-status').textContent=settled
  ?'A fictional sale has updated the demo portfolio. No funds or blockchain assets moved.'
  :'A preview using an illustrative quote. No sale has executed yet.';
 $('demo-before-stock').textContent=demoUnits(before);
 $('demo-after-stock').textContent=demoUnits(after);
 $('demo-before-ticker').textContent=asset.ticker+' fictional shares';
 $('demo-after-ticker').textContent=asset.ticker+' fictional shares retained';
 $('demo-before-cash').textContent=demoMoney(cashBefore)+' demo USDT';
 $('demo-after-cash').textContent=demoMoney(cashAfter)+' demo USDT';
 $('demo-outcome-sold').textContent=demoUnits(value.soldMilli)+' '+asset.ticker;
 $('demo-outcome-received').textContent='+'+demoMoney(received)+' demo USDT';
}
function invalidate(){
 if(busy)return;
 draft=null;stage='IDLE';latestReceipt=null;
 $('demo-outcome').hidden=true;renderGuardChecks([]);
 $('demo-result').hidden=true;$('demo-review-box').hidden=true;$('demo-confirm-box').hidden=true;
 $('demo-guard').textContent='Configure your cash target and ask BellGuard for a quote.';
 $('demo-guard').dataset.state='idle';
 $('demo-exposure').style.setProperty('--paper-sold','0%');
 $('demo-minimum').textContent='—';$('demo-remain').textContent='—';$('demo-sold').textContent='—';
 $('demo-expiry').textContent='No active quote';
 $('demo-review').disabled=true;$('demo-confirm').disabled=true;
 $('demo-retain-value').textContent=$('demo-retain').value+'%';
 updatePortfolio();progress();
}
function showQuote(q){
 const asset=DEMO_ASSETS.find(a=>a.id===q.assetId);
 $('demo-result').hidden=false;$('demo-review-box').hidden=false;$('demo-confirm-box').hidden=true;
 $('demo-minimum').textContent=demoMoney(q.minimumCents)+' USDT';
 $('demo-expected').textContent=demoMoney(q.expectedCents)+' USDT';
 $('demo-sold').textContent=demoUnits(q.soldMilli)+' '+asset.ticker;
 $('demo-remain').textContent=demoUnits(q.remainingMilli)+' '+asset.ticker;
 const closed=q.input.scenario==='closed';
 $('demo-guard').dataset.state=closed?'caution':'ready';
 $('demo-guard').textContent=closed
  ?'CAUTION · Underlying market closed · Explicit simulation permission applied · Quote and retained floor checked'
  :'PASS · Regular simulated market · Fresh synthetic RFQ · Position floor protected · Minimum cash covers target';
 $('demo-quote-math').textContent='Illustrative price '+demoMoney(asset.priceCents)+' USDT · fee '+demoMoney(q.feeCents)+
  ' · impact '+(q.impactBps/100).toFixed(2)+'% · slippage buffer '+demoMoney(q.slippageCents)+
  ' · quote expires in 120 seconds.';
 const released=Math.min(100,100*q.soldMilli/q.balanceMilli);
 $('demo-exposure').style.setProperty('--paper-sold',released.toFixed(2)+'%');
 $('demo-kept-pct').textContent=(100-released).toFixed(1)+'%';
 $('demo-review').disabled=false;
 renderOutcome(q,false);
 progress();tick();
}
function tick(){
 if(!draft)return;
 const left=Math.max(0,Math.ceil((draft.expiresAtMs-Date.now())/1000));
 $('demo-expiry').textContent=left>0?'SIMULATED RFQ · '+left+'s left':'SIMULATED RFQ · expired';
 if(!left){draft=null;stage='IDLE';$('demo-outcome').hidden=true;$('demo-review').disabled=true;$('demo-confirm').disabled=true;
  $('demo-confirm-box').hidden=true;$('demo-review-box').hidden=false;$('demo-guard').textContent='EXPIRED · Generate a fresh quote before proceeding.';
  $('demo-guard').dataset.state='blocked';notice('Quote expired. No order was created.',true);progress();}
}
function renderOrders(){
 const list=$('demo-activity');list.replaceChildren();
 if(!state.orders.length){
  const p=document.createElement('p');p.className='paper-muted';p.textContent='No simulated trades yet. A confirmed demo sale will appear here with a replayable accounting receipt.';list.append(p);
 } else {
  for(const o of state.orders.slice(0,4)){
   const row=document.createElement('div');row.className='paper-activity-row';
   const info=document.createElement('span');info.textContent=o.ticker+' · '+demoUnits(o.soldMilli)+' units';
   const amt=document.createElement('strong');amt.textContent='+'+demoMoney(o.cashReceivedCents)+' demo USDT';
   const time=document.createElement('small');time.textContent=new Date(o.createdAtMs).toLocaleTimeString()+' · SIMULATED';
   row.append(info,amt,time);list.append(row);
  }
 }
 if(state.orders.length){
   const detail=document.createElement('ol');detail.className='paper-event-trail';
   const titles={'INTENT_ACCEPTED':'Cash target accepted','BELLGUARD_PASSED':'BellGuard checked limits',
     'USER_CONFIRMED':'Simulation confirmed','SIMULATED_FILL':'Fictional fill recorded','ACCOUNTING_RECONCILED':'Portfolio arithmetic reconciled'};
   for(const event of state.orders[0].events){
    const li=document.createElement('li'),number=document.createElement('span'),label=document.createElement('span');
    number.textContent=String(event.sequence).padStart(2,'0');
    label.textContent=titles[event.type]||'Simulation event';li.append(number,label);detail.append(li);
   }list.append(detail);
  }
 $('demo-proof-controls').hidden=!state.orders.length;
}
async function renderReceipt(order){
 if(!order)return;
 const receipt=await createDemoReceipt(order);
 latestReceipt=receipt;
 const good=await verifyDemoReceipt(receipt);
 $('demo-proof').textContent=good?'SIMULATED SETTLEMENT · accounting and checksum consistent. No blockchain proof.':'Receipt consistency rejected.';
 $('demo-digest').textContent=receipt.sha256.slice(0,20)+'…';
 $('demo-proof').dataset.state=good?'ready':'blocked';
}
function resetView(){
 invalidate();renderOrders();
 if(state.orders.length){renderOutcome(state.orders[0],true);void renderReceipt(state.orders[0]);}
 else {
  $('demo-proof').textContent='No receipt yet. Confirm a demo order to generate one.';
  $('demo-digest').textContent='—';$('demo-proof-controls').hidden=true;
 }
}
function download(name,value){
 const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'});
 const href=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=href;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
if(typeof document!=='undefined'&&$('demo-view')){
 // All studio navigation is in-page. Highlight the current section without
 // loading main-app routing, live wallet adapters, or any backend modules.
 const studioLinks=Array.from(document.querySelectorAll('nav[aria-label="Paper Studio sections"] a'));
 const updateStudioLocation=()=>{
  const target=studioLinks.some(link=>link.getAttribute('href')===window.location.hash)
   ?window.location.hash:'#demo-overview';
  for(const link of studioLinks){
   if(link.getAttribute('href')===target)link.setAttribute('aria-current','location');
   else link.removeAttribute('aria-current');
  }
 };
 window.addEventListener('hashchange',updateStudioLocation);
 for(const selected of studioLinks)selected.addEventListener('click',()=>{
  // Keep the visible section selected synchronously while the browser scrolls.
  for(const link of studioLinks){
   if(link===selected)link.setAttribute('aria-current','location');
   else link.removeAttribute('aria-current');
  }
 });
 updateStudioLocation();
 $('demo-asset').replaceChildren();
 for(const a of DEMO_ASSETS){const option=document.createElement('option');option.value=a.id;option.textContent=a.name+' · '+a.ticker;$('demo-asset').append(option);}
 for(const id of ['demo-asset','demo-target','demo-retain','demo-impact','demo-market','demo-closed']){
  $(id).addEventListener('input',invalidate);
  $(id).addEventListener('change',invalidate);
 }
 $('demo-form').addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;
  const selectedIntent=intent();
  const result=simulatePlan(state,selectedIntent);
  renderGuardChecks(demoGuardReport(state,selectedIntent,result));
  draft=null;stage='IDLE';$('demo-outcome').hidden=true;$('demo-result').hidden=true;$('demo-review-box').hidden=true;$('demo-confirm-box').hidden=true;
  if(result.status!=='READY'){
   $('demo-guard').dataset.state='blocked';$('demo-guard').textContent='BLOCKED · '+result.reasons.join(' ');
   $('demo-review').disabled=true;$('demo-confirm').disabled=true;
   $('demo-expiry').textContent='No executable demo quote';
   notice('BellGuard blocked the scenario. Change the settings and try again.',true);
  }else{
   draft=result.quote;stage='READY';showQuote(draft);
   notice('Simulation quote prepared. Inspect minimum cash and retained stock before confirming.');
  }progress();
 });
 $('demo-review').addEventListener('click',()=>{
  if(!draft||busy)return;
  try{assertFreshDemoQuote(state,draft);stage='REVIEW';$('demo-confirm-box').hidden=false;
   $('demo-confirm').disabled=false;$('demo-review-box').hidden=true;progress();
   notice('Check the exact simulated debit. Confirming changes demo balances only, not any real wallet.');
  }catch{invalidate();notice('Quote expired or changed. Generate a new one.',true);}
 });
 $('demo-confirm').addEventListener('click',async()=>{
  if(!draft||busy||stage!=='REVIEW')return;
  busy=true;$('demo-confirm').disabled=true;
  try{
   const executed=executeDemoOrder(state,draft);
   state=executed.state;const saved=save();draft=null;stage='SETTLED';
   $('demo-result').hidden=true;$('demo-review-box').hidden=true;$('demo-confirm-box').hidden=true;
   updatePortfolio();renderOrders();renderOutcome(executed.order,true);progress();await renderReceipt(executed.order);
   notice('SIMULATED FILL COMPLETE · '+demoMoney(executed.order.cashReceivedCents)+' demo USDT received and '+
    demoUnits(executed.order.afterMilli)+' demo shares retained.'+
    (saved?'':' Browser storage is unavailable; this session will not persist.'));
   $('demo-guard').dataset.state='ready';$('demo-guard').textContent='SETTLED IN DEMO · BellGuard passed and simulated accounting reconciled.';
   $('demo-expiry').textContent='Completed · no real execution';
  }catch{invalidate();notice('Simulation cancelled: quote changed, expired or violated a limit. Nothing executed.',true);}
  finally{busy=false;}
 });
 $('demo-cancel').addEventListener('click',()=>{invalidate();notice('Review cancelled. No simulated order was created.');});
 const prepareRecording=()=>{
  if(busy)return;
  state=newDemoState();
  $('demo-asset').value='nova';$('demo-target').value='250.00';
  $('demo-retain').value='70';$('demo-impact').value='50';
  $('demo-market').value='regular';$('demo-closed').checked=false;
  save();resetView();
  notice('RECORDING READY · Fictional portfolio restored · 250 USDT target · 70% retention. Begin with Overview, Portfolio and Simulate.');
  if(window.location.hash!=='#demo-overview')window.location.hash='#demo-overview';
  else document.getElementById('demo-overview').scrollIntoView();
 };
 $('demo-record-ready').addEventListener('click',prepareRecording);
 $('demo-reset').addEventListener('click',()=>{
  if(!window.confirm('Reset all fictional holdings, demo USDT and simulated history in this tab?'))return;
  state=newDemoState();save();resetView();notice('Demo portfolio restored. No real assets were involved.');
 });
 for(const button of document.querySelectorAll('[data-demo-scenario]')){
  button.addEventListener('click',()=>{
   $('demo-market').value=button.dataset.demoScenario;
   $('demo-closed').checked=false;invalidate();$('demo-form').requestSubmit();
  });
 }
 $('demo-download').addEventListener('click',async()=>{
  if(!state.orders.length)return;
  const receipt=await createDemoReceipt(state.orders[0]);
  download('remain-SIMULATED-receipt-'+receipt.payload.order.id+'.json',receipt);
 });
 $('demo-verify').addEventListener('click',async()=>{
  if(!state.orders.length)return;
  const receipt=await createDemoReceipt(state.orders[0]);
  const ok=await verifyDemoReceipt(receipt);
  $('demo-proof').dataset.state=ok?'ready':'blocked';
  $('demo-proof').textContent=ok?'PASS · checksummed fictional events and accounting agree. NOT proof of chain settlement.':'FAIL · demo accounting or checksum mismatch.';
 });
 $('demo-upload').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
   if(file.size>32768)throw Error('File exceeds 32 KiB.');
   const receipt=JSON.parse(await file.text());const okay=await verifyDemoReceipt(receipt);
   $('demo-proof').dataset.state=okay?'ready':'blocked';
   $('demo-proof').textContent=okay?'Consistent SIMULATION receipt. File remains unauthenticated and cannot prove a trade.':'Invalid or modified simulation receipt.';
  }catch{$('demo-proof').dataset.state='blocked';$('demo-proof').textContent='Cannot read or verify this simulation receipt.';}
  event.target.value='';
 });
 $('demo-view').setAttribute('data-boundary',DEMO_NOTICE);
 resetView();setInterval(tick,1000);
}
