import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits, readWalletToken } from '../web/onchain.js';
const owner = '0x' + '1'.repeat(40), token = '0x' + '2'.repeat(40);
const word = n => '0x' + BigInt(n).toString(16).padStart(64, '0');
test('formats exact fractional units without float rounding', () => {
  assert.equal(formatUnits(1234500000000000000n,18), '1.2345');
  assert.equal(formatUnits(0n,18), '0');
});
test('reads live ERC20 wallet balance without signing', async () => {
  const methods = [];
  const provider = { request: async ({method,params}: {method:string;params?: {data:string}[]}) => {
    methods.push(method);
    if (method==='eth_chainId') return '0x38';
    if (method==='eth_accounts') return [owner];
    if (method==='eth_call') return params![0]!.data.startsWith('0x70a08231') ? word(1234500) : word(6);
    throw Error('unexpected method');
  }};
  const result=await readWalletToken(provider,token);
  assert.equal(result.formatted,'1.2345');
  assert.equal(result.source,'WALLET_RPC_ETH_CALL');
  assert.ok(methods.every(x=>['eth_chainId','eth_accounts','eth_call'].includes(x)));
});
test('rejects wrong chain before requesting balances',async()=>{
  const methods=[];
  const provider={request:async ({method}: {method:string})=>{methods.push(method);return '0x1';}};
  await assert.rejects(readWalletToken(provider,token),/BSC_REQUIRED/);
  assert.deepEqual(methods,['eth_chainId']);
});
