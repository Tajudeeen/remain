import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTokenBalanceEvidence,recheckTokenBalanceEvidence,validateTokenBalanceEvidence} from '../web/balance-evidence.js';
const owner='0x'+'1'.repeat(40), token='0x'+'2'.repeat(40), hash='0x'+'a'.repeat(64);
const block={number:'0x12ab',hash};const word=(n:number)=>'0x'+BigInt(n).toString(16).padStart(64,'0');
function provider(opts:{mismatch?:boolean;amount?:number;wrongChain?:boolean;disconnected?:boolean;latestOnly?:boolean}={}){
  const seen:{method:string;params:any[]|undefined}[]=[];
  return {seen,request:async({method,params}:{method:string;params?:any[]})=>{
    seen.push({method,params});
    if(method==='eth_chainId')return opts.wrongChain?'0x1':'0x38';
    if(method==='eth_accounts')return opts.disconnected?[]:[owner];
    if(method==='eth_getBlockByNumber'){
      if(params?.[0]==='finalized'&&opts.latestOnly)throw Error('UNSUPPORTED');
      return {...block,hash:opts.mismatch&&params?.[0]==='0x12ab'?'0x'+'b'.repeat(64):hash};
    }
    if(method==='eth_call')return params?.[0]?.data==='0x313ce567'?word(6):word(opts.amount??2500000);
    throw Error('FORBIDDEN');
  }};
}
test('capture pins BSC ERC20 observations to a canonical block without signatures or fake cash',async()=>{
 const p=provider();const evidence=await captureTokenBalanceEvidence(p,token);
 assert.equal(evidence.raw,'2500000');assert.equal(evidence.decimals,6);
 assert.equal(evidence.blockHash,hash);assert.equal(evidence.blockNumber,'0x12ab');assert.equal(evidence.source,'WALLET_RPC_BLOCK_PINNED');
 assert.deepEqual(p.seen.filter(x=>x.method==='eth_call').map(x=>x.params?.[1]),['0x12ab','0x12ab']);
 assert.ok(p.seen.every(x=>!['eth_sendTransaction','eth_signTypedData_v4','personal_sign'].includes(x.method)));
 const recheck=await recheckTokenBalanceEvidence(provider(),evidence);assert.equal(recheck.status,'RPC_REPLAY_MATCH');
});
test('recheck detects tampered balance, block hash, and live RPC disagreement',async()=>{
 const evidence=await captureTokenBalanceEvidence(provider(),token);
 assert.equal((await recheckTokenBalanceEvidence(provider({amount:1}),evidence)).status,'BALANCE_MISMATCH');
 assert.equal((await recheckTokenBalanceEvidence(provider({mismatch:true}),evidence)).status,'BLOCK_MISMATCH');
 assert.throws(()=>validateTokenBalanceEvidence({...evidence,extra:true}),/INVALID_BALANCE_EVIDENCE/);
 assert.throws(()=>validateTokenBalanceEvidence({...evidence,owner:owner.toUpperCase()}),/INVALID_BALANCE_EVIDENCE/);
});
test('capture fails closed on wrong chain, disconnected wallet and block reorg',async()=>{
 await assert.rejects(captureTokenBalanceEvidence(provider({wrongChain:true}),token),/BSC_REQUIRED/);
 await assert.rejects(captureTokenBalanceEvidence(provider({disconnected:true}),token),/CONNECT_WALLET/);
 await assert.rejects(captureTokenBalanceEvidence(provider({mismatch:true}),token),/BLOCK_REORGANIZED/);
 const p=provider({latestOnly:true});await captureTokenBalanceEvidence(p,token);
 assert.ok(p.seen.some(x=>x.method==='eth_getBlockByNumber'&&x.params?.[0]==='latest'));
});
