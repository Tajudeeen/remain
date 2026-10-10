import test from 'node:test';
import assert from 'node:assert/strict';
import {scanCatalogPage} from '../web/portfolio.js';
const owner='0x'+'1'.repeat(40), token='0x'+'2'.repeat(40), zero='0x'+'3'.repeat(40);
const stamp=Date.now();
const catalog={kind:'REMAIN_LIVE_CATALOG',mode:'LIVE_READ_ONLY',observedAtMs:stamp,stocks:[{token,symbol:'STOCK1',ticker:'ONE',issuer:'xstocks',decimals:6},{token:zero,symbol:'STOCK2',ticker:'TWO',issuer:'bstock',decimals:6}]};
const word=(n:bigint|number)=>'0x'+BigInt(n).toString(16).padStart(64,'0');
test('catalog scan returns only observed positive holdings, with a partial-scan boundary',async()=>{
 const methods:string[]=[];
 const provider={request:async ({method,params}:{method:string;params?:{data:string;to:string}[]})=>{
  methods.push(method);
  if(method==='eth_accounts')return [owner];
  if(method==='eth_chainId')return '0x38';
  if(method==='eth_call')return params![0]!.data==='0x313ce567'?word(6):params![0]!.to===token?word(2500000):word(0);
  throw Error('UNEXPECTED_REQUEST');
 }};
 const a=await scanCatalogPage(catalog,provider,owner,0,1);
 assert.equal(a.cursor,1);assert.equal(a.complete,false);assert.equal(a.holdings[0]!.formatted,'2.5');
 const b=await scanCatalogPage(catalog,provider,owner,1,1);
 assert.equal(b.complete,true);assert.deepEqual(b.holdings,[]);assert.deepEqual(b.failed,[]);
 assert.ok(methods.every(method=>['eth_accounts','eth_chainId','eth_call'].includes(method)));
});
test('a failed provider read is unknown rather than an observed zero holding',async()=>{
 const p={request:async ({method}:{method:string})=>method==='eth_accounts'?[owner]:method==='eth_chainId'?'0x38':Promise.reject(Error('RPC_FAILED'))};
 const result=await scanCatalogPage(catalog,p,owner,0,1);
 assert.equal(result.holdings.length,0);assert.deepEqual(result.failed,[token]);
});
test('wrong chain, account mismatch, and scan limits fail closed',async()=>{
 const p={request:async ({method}:{method:string})=>method==='eth_accounts'?[owner]: '0x1'};
 await assert.rejects(scanCatalogPage(catalog,p,owner,0,1),/WALLET_CHANGED/);
 await assert.rejects(scanCatalogPage(catalog,p,owner,0,9),/INVALID_SCAN/);
});

test('wallet scan times out instead of hanging forever on account discovery',async()=>{
 const provider={request:(_:unknown)=>new Promise(()=>{})};
 await assert.rejects(scanCatalogPage(catalog,provider,owner,0,1,undefined,{timeoutMs:10}),/WALLET_RPC_TIMEOUT/);
});
test('wallet scan stops promptly when revoked during a pending wallet prompt',async()=>{
 const controller=new AbortController();
 const provider={request:(_:unknown)=>new Promise(()=>{})};
 const task=scanCatalogPage(catalog,provider,owner,0,1,controller.signal,{timeoutMs:1000});
 controller.abort(new Error('SCAN_ABORTED'));
 await assert.rejects(task,/SCAN_ABORTED/);
});
test('wallet scan rechecks account after reads and rejects a stuck last handshake',async()=>{
 let reads=0;
 const p={request:({method,params}:{method:string;params?:{data:string;to:string}[]})=>{
  if(method==='eth_accounts'){reads++;return reads>=4?new Promise(()=>{}):Promise.resolve([owner]);}
  if(method==='eth_chainId')return Promise.resolve('0x38');
  if(method==='eth_call')return Promise.resolve(params![0]!.data==='0x313ce567'?word(6):word(2500000));
  throw Error('UNEXPECTED_REQUEST');
 }};
 await assert.rejects(scanCatalogPage(catalog,p,owner,0,1,undefined,{timeoutMs:10}),/WALLET_RPC_TIMEOUT/);
});
