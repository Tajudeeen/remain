import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredExecutionProxy, proxyExecution } from '../src/rehearsal/execution-proxy.ts';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
const origin='https://remain.example.com';
const upstream='https://secure-execution.example.com';
test('execution proxy only configures for an opt-in external HTTPS host',()=>{
  assert.equal(configuredExecutionProxy({}),undefined);
  assert.equal(configuredExecutionProxy({REMAIN_EXECUTION_PROXY_ENABLED:'true',REMAIN_EXECUTION_UPSTREAM_ORIGIN:'http://example.com'}),undefined);
  assert.equal(configuredExecutionProxy({REMAIN_EXECUTION_PROXY_ENABLED:'true',REMAIN_EXECUTION_UPSTREAM_ORIGIN:'https://localhost'}),undefined);
  assert.equal(configuredExecutionProxy({REMAIN_EXECUTION_PROXY_ENABLED:'true',REMAIN_EXECUTION_UPSTREAM_ORIGIN:'https://example.com/path'}),undefined);
  assert.deepEqual(configuredExecutionProxy({REMAIN_EXECUTION_PROXY_ENABLED:'true',REMAIN_EXECUTION_UPSTREAM_ORIGIN:upstream}),{origin:upstream});
});
test('gateway forwards exact allowlisted actions without forwarding browser origin or cookies',async()=>{
  let calls=0;
  const fetcher:typeof fetch=async(input,init)=>{
    calls++;
    assert.equal(String(input),upstream+'/api/execution/challenge');
    assert.equal(init?.method,'POST');
    const h=new Headers(init?.headers);
    assert.equal(h.get('origin'),upstream);
    assert.equal(h.get('cookie'),null);
    assert.equal(h.get('authorization'),'Bearer token.value-123');
    assert.equal(init?.body,JSON.stringify({wallet:'0x'+'1'.repeat(40)}));
    return new Response(JSON.stringify({challenge:'verified-upstream'}),{status:200,headers:{'content-type':'application/json'}});
  };
  const req=new Request(origin+'/api/execution/challenge',{method:'POST',headers:{origin,'content-type':'application/json','authorization':'Bearer token.value-123','cookie':'session=unsafe'},
    body:JSON.stringify({wallet:'0x'+'1'.repeat(40)})});
  const output=await handleNetlifyFixture(req,{origins:[origin],executionProxy:{origin:upstream,fetcher}});
  assert.equal(output.status,200);
  assert.deepEqual(await output.json(),{challenge:'verified-upstream'});
  assert.equal(calls,1);
});
test('upstream actual readiness, not a configured URL, decides available execution',async()=>{
  const fetcher:typeof fetch=async()=>new Response(JSON.stringify({kind:'REMAIN_EXECUTION_STATUS',available:false,profile:'COW_BSC_SELL_V1',userConfirmationRequired:true}),{status:200,headers:{'content-type':'application/json'}});
  const output=await handleNetlifyFixture(new Request(origin+'/api/execution/status'),{origins:[origin],executionProxy:{origin:upstream,fetcher}});
  assert.equal((await output.json() as {available:boolean}).available,false);
});
test('untrusted proxy inputs and invalid upstream responses fail closed',async()=>{
  let called=0;const fetcher:typeof fetch=async()=>{called++;return new Response('not json',{headers:{'content-type':'text/html'}});};
  const cfg={origin:upstream,fetcher};
  const invalid=new Request(origin+'/api/execution/sign',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'});
  assert.equal((await proxyExecution(invalid,'sign',cfg)).status,400);
  assert.equal(called,0);
  const invalidAuth=new Request(origin+'/api/execution/sign',{method:'POST',headers:{'content-type':'application/json',authorization:'Basic secret'},body:'{}'});
  assert.equal((await proxyExecution(invalidAuth,'sign',cfg)).status,400);
  assert.equal(called,0);
  const response=await proxyExecution(new Request(origin+'/api/execution/status'),'status',cfg);
  assert.equal(response.status,502);assert.deepEqual(await response.json(),{code:'EXECUTION_UPSTREAM_INVALID'});
  assert.equal(called,1);
  const crossSite=await handleNetlifyFixture(new Request(origin+'/api/execution/status',{headers:{origin:'https://attacker.example.com'}}),{origins:[origin],executionProxy:cfg});
  assert.equal(crossSite.status,403);
  assert.equal(called,1);
});
