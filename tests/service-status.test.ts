import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceSnapshot,statusJSON} from '../web/service-status.js';
const market={kind:'REMAIN_INTEGRATION_READINESS',mode:'READ_ONLY_SETUP',inspectionAvailable:false,deployment:'NOT_CONFIGURED',executionEnabled:false,liveGate:'UNVERIFIED',signatureSemantics:'UNVERIFIED'};
const execution={kind:'REMAIN_EXECUTION_STATUS',available:false,profile:'COW_BSC_SELL_V1',userConfirmationRequired:true};
test('unconfigured product status cannot be labelled live',()=>{
  const result=serviceSnapshot(market,execution);
  assert.equal(result.market,'UNAVAILABLE');
  assert.equal(result.execution,'UNAVAILABLE');
});
test('configured backend is never described as verified settlement',()=>{
  const result=serviceSnapshot({...market,inspectionAvailable:true,deployment:'HOSTED_READ_ONLY'},{...execution,available:true});
  assert.equal(result.market,'CONFIGURED');assert.equal(result.execution,'CONFIGURED');
  assert.match(result.executionLabel,/configured/);
  assert.doesNotMatch(result.executionLabel,/settled|ready to trade|verified sale/i);
});
test('malformed readiness and forged backend responses are rejected',()=>{
  assert.throws(()=>serviceSnapshot({...market,executionEnabled:true},execution));
  assert.throws(()=>serviceSnapshot(market,{...execution,userConfirmationRequired:false}));
  assert.throws(()=>serviceSnapshot({...market,extra:'yes'},execution));
});

test('status reader accepts small, correctly typed JSON without a length header',async()=>{
 const result=await statusJSON('/api/status',undefined,async()=>
   new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json; charset=utf-8'}}) as Response);
 assert.deepEqual(result,{ok:true});
});
test('status reader rejects a chunked stream over two KiB even without Content-Length',async()=>{
 let readCount=0;
 const fetcher=async()=>new Response(new ReadableStream({
  pull(controller){readCount++;controller.enqueue(new Uint8Array(1300));}
 }),{headers:{'content-type':'application/json'}}) as Response;
 await assert.rejects(statusJSON('/api/status',undefined,fetcher),/STATUS_UNAVAILABLE/);
 assert.ok(readCount<=5,'stream must be rejected near byte limit, not read completely');
});
test('status reader rejects malformed UTF-8 and excessive advertised length',async()=>{
 const bad=async()=>new Response(new Uint8Array([0xc3,0x28]),{headers:{'content-type':'application/json'}}) as Response;
 await assert.rejects(statusJSON('/api/status',undefined,bad));
 const long=async()=>new Response('{"ok":true}',{headers:{'content-type':'application/json','content-length':'65535'}}) as Response;
 await assert.rejects(statusJSON('/api/status',undefined,long),/STATUS_UNAVAILABLE/);
});
test('status reader aborts a streaming response rather than leaving a pending UI request',async()=>{
 const controller=new AbortController();
 const fetcher=async()=>new Response(new ReadableStream({
   start(c){c.enqueue(new Uint8Array([123]));},
   cancel(){return Promise.resolve();}
 }),{headers:{'content-type':'application/json'}}) as Response;
 const task=statusJSON('/api/status',controller.signal,fetcher);
 controller.abort(new Error('STATUS_CANCELLED'));
 await assert.rejects(task);
});
