import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileWalletLinks,availableWallets,chooseWalletProvider,activeWalletProvider,clearWalletProvider,startWalletDiscovery,subscribeWalletProviders} from '../web/wallet-providers.js';
test('mobile handoff uses fixed, sanitized HTTPS portfolio destination, without secrets',()=>{
  const links=mobileWalletLinks('https://remain-cash.netlify.app/secret?apiKey=DO_NOT_LEAK#token');
  assert.ok(links);
  assert.equal(links!.metamask,'https://link.metamask.io/dapp/remain-cash.netlify.app');
  assert.equal(links!.trust,'https://link.trustwallet.com/open_url?coin_id=60&url=https%3A%2F%2Fremain-cash.netlify.app%2F%23live');
  assert.equal(JSON.stringify(links).includes('DO_NOT_LEAK'),false);
  assert.equal(mobileWalletLinks('http://localhost:3000'),null);
  assert.equal(mobileWalletLinks('javascript:alert(1)'),null);
  assert.equal(mobileWalletLinks('https://user:pass@remain-cash.netlify.app'),null);
});
test('no default wallet is fabricated and legacy injection is a fallback',()=>{
  const provider={request:async()=>[]};
  assert.deepEqual(availableWallets({}),[]);
  assert.equal(availableWallets({ethereum:provider}).length,1);
  assert.equal(activeWalletProvider({ethereum:provider}),provider);
  chooseWalletProvider(provider);assert.equal(activeWalletProvider({ethereum:{}}),provider);
  clearWalletProvider();assert.equal(activeWalletProvider({}),undefined);
  assert.throws(()=>chooseWalletProvider({}),/WALLET_UNAVAILABLE/);
});
test('wallet discovery handles valid EIP-6963 announcements, duplicates, malformed spoof metadata',()=>{
  const listeners=new Map<string,(x:any)=>void>();let requests=0;
  const win={addEventListener:(name:string,fn:(x:any)=>void)=>listeners.set(name,fn),
    dispatchEvent:(event:Event)=>{if(event.type==='eip6963:requestProvider')requests++;},ethereum:undefined};
  startWalletDiscovery(win); // module-level discovery only runs in browsers; this simulates a separate target
  let additions=0;
  const unsubscribe=subscribeWalletProviders(()=>{additions++;});
  const announce=listeners.get('eip6963:announceProvider');
  assert.ok(announce);
  const provider={request:async()=>[]};
  const event={detail:{info:{uuid:'f8334c94-6775-4e6f-8ac2-c79a7695e400',rdns:'io.wallet.sample',name:'Wallet from extension'},provider}};
  announce!(event);announce!(event);
  announce!({detail:{info:{uuid:'not-a-uuid',rdns:'io.fake',name:'Fake'},provider:{request:async()=>[]}}});
  const list=availableWallets(win);
  assert.equal(list.length,1);assert.equal(list[0]!.name,'Wallet from extension');
  assert.ok(requests>=1);
  assert.equal(additions,1);
  unsubscribe();
});

test('multiple legacy browser extensions are surfaced without silently selecting one',()=>{
  const calls:string[]=[];
  const a={request:async({method}:{method:string})=>{calls.push('meta:'+method);return [];},isMetaMask:true};
  const b={request:async({method}:{method:string})=>{calls.push('trust:'+method);return [];},isTrust:true};
  const target={ethereum:{providers:[a,b]}};
  const matches=availableWallets(target);
  assert.equal(matches.filter(x=>x.provider===a).length,1);
  assert.equal(matches.filter(x=>x.provider===b).length,1);
  assert.equal(matches.find(x=>x.provider===a)?.name,'MetaMask (browser extension)');
  assert.equal(matches.find(x=>x.provider===b)?.name,'Trust Wallet (browser extension)');
  assert.deepEqual(calls,[],'discovery must never request account permissions');
  assert.equal(activeWalletProvider(target),undefined,'multi-wallet discovery never silently picks a provider');
  chooseWalletProvider(b);
  assert.equal(activeWalletProvider(target),b);
  clearWalletProvider();
});
