import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/_middleware.ts';

const origin='https://remain-paper.pages.dev';
const call=async(path:string, options:RequestInit={})=>onRequest({
  request:new Request(origin+path,options),
  next:async()=>new Response('STATIC_ASSET',{status:200})
});

test('Pages hosts the original bounded fictional planner from the same origin',async()=>{
  const result=await call('/api/rehearse',{
    method:'POST',headers:{origin,'content-type':'application/json'},
    body:JSON.stringify({cashTarget:'25',retainPercent:70,maxImpactPercent:'0.50',market:'regular',allowClosedMarket:false})
  });
  assert.equal(result.status,200);
  const data=await result.json() as {mode:string;executionEnabled:boolean;plan:{status:string}};
  assert.equal(data.mode,'TEST_FIXTURE');
  assert.equal(data.executionEnabled,false);
  assert.equal(data.plan.status,'PLANNED_FOR_REVIEW');
});
test('Pages exposes no live Binance access or financial execution by default',async()=>{
  const read=await call('/api/live/status');
  assert.equal(read.status,200);
  const status=await read.json() as {inspectionAvailable:boolean;executionEnabled:boolean};
  assert.equal(status.inspectionAvailable,false);
  assert.equal(status.executionEnabled,false);
  const order=await call('/api/execution/submit',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
  assert.equal(order.status,503);
  assert.deepEqual(await order.json(),{code:'EXECUTION_SETUP_REQUIRED'});
  const execution=await call('/api/execution/status');
  assert.equal((await execution.json() as {available:boolean}).available,false);
});
test('Pages does not expose API methods on wrong origin or allow cross-site state changes',async()=>{
  const wrong=await call('/api/rehearse',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'});
  assert.equal(wrong.status,403);
  const notFound=await call('/api/nonexistent');
  assert.equal(notFound.status,404);
});
test('static assets use native Cloudflare Pages delivery with no paid Function invocation',async()=>{
  const result=await call('/studio.html');
  assert.equal(result.status,200);
  assert.equal(await result.text(),'STATIC_ASSET');
});
test('health is labelled TEST_FIXTURE and cannot imply trading readiness',async()=>{
  const result=await call('/healthz');
  assert.equal(result.status,200);
  const data=await result.json() as {mode:string;executionEnabled:boolean;liveGate:string};
  assert.equal(data.mode,'TEST_FIXTURE');
  assert.equal(data.executionEnabled,false);
  assert.equal(data.liveGate,'BLOCKED');
});
