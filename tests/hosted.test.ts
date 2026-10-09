import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredHostedReaders } from '../src/integration/hosted.ts';
import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
import { RemainError } from '../src/errors.ts';
import type { HostedLiveReaders } from '../src/integration/hosted.ts';

const origin = 'https://remain.example.com';
const options = { origins: [origin] };
const catalog = { kind: 'REMAIN_LIVE_CATALOG' as const, mode: 'LIVE_READ_ONLY' as const, observedAtMs: 1791504000000,
  stocks: [{ token: '0x' + '2'.repeat(40), symbol: 'DEMO', ticker: 'DEMO', issuer: 'bstock', decimals: 18 }] };
let requested = '';
const live: HostedLiveReaders = {
  inspector: async () => { throw new RemainError('UNSUPPORTED_ASSET'); },
  positionReader: async input => { requested = input.wallet; throw new RemainError('UNSUPPORTED_ASSET'); },
  cashPreviewer: async () => { throw new RemainError('INSUFFICIENT_POSITION'); },
  cashReviewer: async () => { throw new RemainError('INSUFFICIENT_POSITION'); },
  catalogReader: async () => catalog
};
test('read-only hosted activation requires both private credentials and explicit flag', () => {
  assert.equal(configuredHostedReaders({}),undefined);
  assert.equal(configuredHostedReaders({REMAIN_HOSTED_READ_ONLY:'true',BINANCE_WEB3_API_KEY:'key'}),undefined);
  assert.equal(configuredHostedReaders({REMAIN_HOSTED_READ_ONLY:'false',BINANCE_WEB3_API_KEY:'key',BINANCE_WEB3_SECRET_KEY:'secret'}),undefined);
  assert.ok(configuredHostedReaders({REMAIN_HOSTED_READ_ONLY:'true',BINANCE_WEB3_API_KEY:'key',BINANCE_WEB3_SECRET_KEY:'secret'}));
});
test('hosted readiness is truthful and fixture read remains separately available', async()=>{
  const status = await handleNetlifyFixture(new Request(origin+'/api/live/status'),{...options,live});
  assert.deepEqual(await status.json(),{kind:'REMAIN_INTEGRATION_READINESS',mode:'READ_ONLY_SETUP',inspectionAvailable:true,deployment:'HOSTED_READ_ONLY',executionEnabled:false,liveGate:'UNVERIFIED',signatureSemantics:'UNVERIFIED'});
  const catalogResponse = await handleNetlifyFixture(new Request(origin+'/api/live/catalog'),{...options,live});
  assert.equal(catalogResponse.status,200);
  assert.deepEqual(await catalogResponse.json(),catalog);
  const fixture = await handleNetlifyFixture(new Request(origin+'/api/rehearse',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cashTarget:'25',retainPercent:70,maxImpactPercent:'0.50',market:'regular',allowClosedMarket:false})}),{...options,live});
  assert.equal((await fixture.json() as {mode:string}).mode,'TEST_FIXTURE');
});
test('hosted handler validates financial input and maps blocked reads without exposing upstream internals',async()=>{
  const valid = {wallet:'0x'+'1'.repeat(40),token:'0x'+'2'.repeat(40)};
  const make = (body:unknown) => new Request(origin+'/api/live/position',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
  assert.equal((await handleNetlifyFixture(make({...valid,secret:'bad'}),{...options,live})).status,400);
  const blocked = await handleNetlifyFixture(make(valid),{...options,live});
  assert.equal(blocked.status,502);
  assert.deepEqual(await blocked.json(),{code:'UNSUPPORTED_ASSET'});
  assert.equal(requested,valid.wallet);
  const denied=await handleNetlifyFixture(new Request('https://evil.test/api/live/catalog'),{...options,live});
  assert.equal(denied.status,403);
  const wrongMethod=await handleNetlifyFixture(new Request(origin+'/api/live/catalog',{method:'POST',body:'{}'}),{...options,live});
  assert.equal(wrongMethod.status,405);
  const execution=await handleNetlifyFixture(new Request(origin+'/api/execution/status'),{...options,live});
  assert.equal((await execution.json() as {available:boolean}).available,false);
});
