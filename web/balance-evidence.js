// A block-pinned ERC-20 snapshot independently recheckable through a BSC RPC.
// It is a replayable observation, NOT a Merkle/storage proof, transaction receipt,
// wallet signature, supported-stock classification, or current cash valuation.
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
const WORD=/^0x[0-9a-fA-F]{64}$/;
const HEX=/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
export function decodeWord(value){if(typeof value!=='string'||!WORD.test(value))throw Error('INVALID_RPC_WORD');return BigInt(value);}
const canonicalNumber=value=>typeof value==='string'&&HEX.test(value)&&BigInt(value)>0n&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER);
function parseBlock(value) {
  if(!value||typeof value!=='object'||!canonicalNumber(value.number)||!HASH.test(value.hash))throw Error('INVALID_BLOCK_HEADER');
  return {number:'0x'+BigInt(value.number).toString(16),hash:value.hash.toLowerCase()};
}
function parseEvidence(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!=='blockHash,blockNumber,chainId,decimals,kind,mode,observedAt,owner,raw,source,token,version')throw Error('INVALID_BALANCE_EVIDENCE');
  if(value.kind!=='REMAIN_TOKEN_BALANCE_EVIDENCE'||value.version!==1||value.mode!=='LIVE_READ_ONLY'||value.source!=='WALLET_RPC_BLOCK_PINNED'||
     value.chainId!==56||!ADDRESS.test(value.owner)||value.owner!==value.owner.toLowerCase()||
     !ADDRESS.test(value.token)||value.token!==value.token.toLowerCase()||
     !canonicalNumber(value.blockNumber)||value.blockNumber!=='0x'+BigInt(value.blockNumber).toString(16)||
     !HASH.test(value.blockHash)||value.blockHash!==value.blockHash.toLowerCase()||
     !Number.isInteger(value.decimals)||value.decimals<0||value.decimals>36||
     typeof value.raw!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(value.raw)||BigInt(value.raw)>=2n**256n||
     typeof value.observedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.observedAt)||
     !Number.isFinite(Date.parse(value.observedAt)))throw Error('INVALID_BALANCE_EVIDENCE');
  return value;
}
async function rpc(provider,method,params=[]) {
  if(!provider||typeof provider.request!=='function')throw Error('WALLET_UNAVAILABLE');
  let timer;
  try{return await Promise.race([
    Promise.resolve().then(()=>provider.request({method,params})),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WALLET_RPC_TIMEOUT')),12000);})
  ]);}finally{clearTimeout(timer);}
}
async function chain(provider) {
  const id=await rpc(provider,'eth_chainId');
  if(!HEX.test(id)||BigInt(id)!==56n)throw Error('BSC_REQUIRED');
}
async function readAtBlock(provider,owner,token,number){
  const queries=[
    {method:'eth_call',params:[{to:token,data:'0x70a08231'+owner.slice(2).padStart(64,'0')},number]},
    {method:'eth_call',params:[{to:token,data:'0x313ce567'},number]}
  ];
  const [amount,decimals]=await Promise.all(queries.map(q=>rpc(provider,q.method,q.params)));
  const unit=decodeWord(amount), scale=decodeWord(decimals);
  if(scale>36n)throw Error('INVALID_DECIMALS');
  return {raw:unit.toString(),decimals:Number(scale)};
}
export async function captureTokenBalanceEvidence(provider,token){
  if(!ADDRESS.test(token))throw Error('INVALID_TOKEN');
  await chain(provider);
  const accounts=await rpc(provider,'eth_accounts');
  if(!Array.isArray(accounts)||!ADDRESS.test(accounts[0]))throw Error('CONNECT_WALLET');
  const owner=accounts[0].toLowerCase();
  // Use 'finalized' when the wallet RPC offers it, but fall back to 'latest'.
  // Both paths record an exact block and verify its hash before returning.
  let latest;
  try {latest=parseBlock(await rpc(provider,'eth_getBlockByNumber',['finalized',false]));}
  catch{latest=parseBlock(await rpc(provider,'eth_getBlockByNumber',['latest',false]));}
  const balance=await readAtBlock(provider,owner,token,latest.number);
  await chain(provider);
  const after=await rpc(provider,'eth_accounts');
  if(!Array.isArray(after)||after[0]?.toLowerCase()!==owner)throw Error('WALLET_CHANGED');
  const canonical=parseBlock(await rpc(provider,'eth_getBlockByNumber',[latest.number,false]));
  if(canonical.hash!==latest.hash)throw Error('BLOCK_REORGANIZED');
  return Object.freeze({kind:'REMAIN_TOKEN_BALANCE_EVIDENCE',version:1,mode:'LIVE_READ_ONLY',
    source:'WALLET_RPC_BLOCK_PINNED',chainId:56,owner,token:token.toLowerCase(),blockNumber:latest.number,
    blockHash:latest.hash,raw:balance.raw,decimals:balance.decimals,observedAt:new Date().toISOString()});
}
export function validateTokenBalanceEvidence(value){return parseEvidence(value);}
export async function recheckTokenBalanceEvidence(provider,input) {
  const evidence=parseEvidence(input);
  await chain(provider);
  const canonical=parseBlock(await rpc(provider,'eth_getBlockByNumber',[evidence.blockNumber,false]));
  if(canonical.hash!==evidence.blockHash)return Object.freeze({status:'BLOCK_MISMATCH',message:'The recorded block is not canonical on this RPC. This evidence is not verified.'});
  const balance=await readAtBlock(provider,evidence.owner,evidence.token,evidence.blockNumber);
  await chain(provider);
  if(balance.raw!==evidence.raw||balance.decimals!==evidence.decimals)
    return Object.freeze({status:'BALANCE_MISMATCH',message:'The token balance or decimals differ from the recorded claim.'});
  return Object.freeze({status:'RPC_REPLAY_MATCH',message:'Independent RPC replay matched the recorded block and token state. This is not a cryptographic storage proof, wallet ownership signature, trade, or stock identity verification.'});
}
