import assert from 'node:assert/strict';
const origin=process.argv[2];
if (!origin || !/^https?:\/\//.test(origin) || process.argv.length!==3) throw Error('Provide exact local dev URL');
async function check(path,method='GET',opts={}) {
  const response=await fetch(origin+path,{method,redirect:'error',cache:'no-store',...opts});
  return {status:response.status,body:await response.json()};
}
const health=await check('/healthz');
assert.equal(health.status,200);
assert.equal(health.body.service,'remain-cloudflare-execution');
assert.equal(health.body.executionEnabled,false);
assert.equal(health.body.journal,'READY');
const status=await check('/api/execution/status');
assert.equal(status.status,200);
assert.deepEqual(status.body,{kind:'REMAIN_EXECUTION_STATUS',available:false,profile:'COW_BSC_SELL_V1',userConfirmationRequired:true});
const disabled=await check('/api/execution/submit','POST',{headers:{'origin':origin,'content-type':'application/json'},body:'{"id":"00000000-0000-4000-8000-000000000000"}'});
assert.deepEqual(disabled,{status:503,body:{code:'EXECUTION_SETUP_REQUIRED'}});
assert.equal((await check('/api/execution/status','POST')).status,405);
assert.equal((await check('/api/execution/submit')).status,405);
assert.equal((await check('/api/execution/status?x=1')).status,403);
assert.equal((await check('/api/execution/status','GET',{headers:{origin:'https://attacker.example'}})).status,403);
console.log(JSON.stringify({kind:'REMAIN_CLOUDFLARE_SMOKE',health:'READY',journal:'READY',execution:'BLOCKED',maliciousOrigin:'REJECTED',queryInjection:'REJECTED'}));
