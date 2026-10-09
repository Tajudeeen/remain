import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRpcEgressFetcher } from '../cloudflare/egress.js';
import { approvedTargets, validateRpcEnvelope } from '../cloudflare/rpc-egress/policy.mjs';
import { handleRpc } from '../cloudflare/rpc-egress/server.mjs';

const primary='https://rpc-a.example.org/v1/test';
const secondary='https://rpc-b.example.org/rpc';
const payload=JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_blockNumber', params:[] });
const env={ REMAIN_RPC_EGRESS_ENABLED:'true', REMAIN_RPC_PRIMARY:primary, REMAIN_RPC_SECONDARY:secondary };

test('free tier uses direct fetch, not a container', async () => {
  let calls=0;
  const direct=async () => { calls++; return Response.json({ok:true}); };
  const f=makeRpcEgressFetcher({ ...env, REMAIN_RPC_EGRESS_ENABLED:'false' }, direct as typeof fetch);
  await f(primary); assert.equal(calls,1);
});
test('optional RPC transport uses the private service binding', async () => {
  let calls=0;
  const service={fetch: async (req: Request) => {
    calls++; assert.equal(new URL(req.url).pathname, '/rpc');
    assert.deepEqual(await req.json(), {target:primary,payload});
    return Response.json({jsonrpc:'2.0',id:1,result:'0x1'});
  }};
  const f=makeRpcEgressFetcher({...env,REMAIN_RPC_EGRESS:service}, async () => {throw Error('DIRECT_FALLBACK');});
  const response=await f(primary,{method:'POST',body:payload});
  assert.equal(response.status,200); assert.equal(calls,1);
});
test('enabled but missing service fails closed without direct fallback', async () => {
  const f=makeRpcEgressFetcher(env, async () => { throw Error('BAD_DIRECT_FALLBACK'); });
  await assert.rejects(f(primary,{method:'POST',body:payload}), /NOT_CONFIGURED/);
});
test('container transport refuses Binance and unpinned host URLs', async () => {
  const f=makeRpcEgressFetcher({...env,REMAIN_RPC_EGRESS:{fetch:async()=>Response.json({})}});
  await assert.rejects(f('https://web3.binance.com/build/api/v1/dex/market/price-info',{method:'POST',body:payload}),/TARGET_REJECTED/);
  await assert.rejects(f('https://attacker.test/collect',{method:'POST',body:payload}),/TARGET_REJECTED/);
  await assert.rejects(f(primary,{method:'GET',body:payload}),/REQUEST_REJECTED/);
});
test('read-only RPC allowlist rejects exchange domains, private IP and non-RPC methods', () => {
  for (const host of ['https://web3.binance.com','https://127.0.0.1/rpc','http://rpc-a.example.org','https://geckoterminal.com']) {
    assert.throws(()=>approvedTargets(host));
  }
  const targets=approvedTargets(primary+'\n'+secondary);
  assert.deepEqual(validateRpcEnvelope({target:primary,payload},targets),{target:primary,payload});
  for (const method of ['eth_sendRawTransaction','personal_sign','eth_sign','wallet_sendCalls']) {
    const bad=JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]});
    assert.throws(()=>validateRpcEnvelope({target:primary,payload:bad},targets));
  }
  assert.throws(()=>validateRpcEnvelope({target:'https://attacker.test',payload},targets));
});
test('container executes approved read-only RPC request with no redirects', async () => {
  let calls=0;
  const result=await handleRpc({target:primary,payload},primary,async (url,init) => {
    calls++; assert.equal(url,primary); assert.equal(init?.method,'POST'); assert.equal(init?.redirect,'error');
    return Response.json({jsonrpc:'2.0',id:1,result:'0x2'});
  });
  assert.equal(calls,1); assert.equal(result.status,200);
  assert.deepEqual(JSON.parse(result.data.toString()), {jsonrpc:'2.0',id:1,result:'0x2'});
});
