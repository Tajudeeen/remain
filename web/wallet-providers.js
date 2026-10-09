// EIP-6963 discovery plus one legacy injected-provider fallback. A name or rdns
// announced by a wallet is self-asserted, not evidence of wallet authenticity.
// A chosen provider is held only in page memory and shared by portfolio + sale.
let selected;
const providers=[];
const listeners=new Set();
let discoveryTarget;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validProvider(value){return value && typeof value.request==='function';}
export function startWalletDiscovery(target=typeof window!=='undefined'?window:undefined) {
  if(!target||typeof target.addEventListener!=='function'||discoveryTarget)return;
  discoveryTarget=target;
  target.addEventListener('eip6963:announceProvider',event=>{
    const info=event?.detail?.info, provider=event?.detail?.provider;
    if(!validProvider(provider)||!info||typeof info.name!=='string'||info.name.length<1||info.name.length>64||
      typeof info.uuid!=='string'||!uuid.test(info.uuid)||
      typeof info.rdns!=='string'||!/^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/i.test(info.rdns)||
      providers.some(item=>item.provider===provider||item.uuid===info.uuid)||providers.length>=12)return;
    providers.push(Object.freeze({id:info.uuid,name:info.name,provider}));
    for(const listener of listeners) {try{listener();}catch{/* A UI subscriber must not block discovery. */}}
  });
  requestWalletDiscovery(target);
}
export function requestWalletDiscovery(target=typeof window!=='undefined'?window:undefined){
  if(target && typeof target.dispatchEvent==='function' && typeof Event==='function'){
    try{target.dispatchEvent(new Event('eip6963:requestProvider'));}catch{ /* Browsers may restrict events. */ }
  }
}
export function availableWallets(target=typeof window!=='undefined'?window:undefined){
  startWalletDiscovery(target);
  const list=[...providers];
  // Some older injected providers expose a .providers array rather than
  // announcing through EIP-6963. Never silently choose the wrong one.
  const legacy=target?.ethereum;
  const candidates=Array.isArray(legacy?.providers) && legacy.providers.length>0 && legacy.providers.length<=12
    ? legacy.providers : [legacy];
  for(let i=0;i<candidates.length&&list.length<12;i++){
    const injected=candidates[i];
    if(!validProvider(injected)||list.some(x=>x.provider===injected))continue;
    const name=injected.isMetaMask?'MetaMask (browser extension)':
      injected.isTrust?'Trust Wallet (browser extension)':'Browser wallet '+(i+1);
    list.push({id:i===0?'legacy-injected':'legacy-injected-'+i,name,provider:injected});
  }
  return list;
}
export function subscribeWalletProviders(listener){
  if(typeof listener!=='function')throw Error('WALLET_INVALID');
  listeners.add(listener);
  return ()=>listeners.delete(listener);
}
export function chooseWalletProvider(provider){
  if(!validProvider(provider))throw Error('WALLET_UNAVAILABLE');
  selected=provider;
  return provider;
}
export function activeWalletProvider(target=typeof window!=='undefined'?window:undefined){
  return selected ?? (validProvider(target?.ethereum)?target.ethereum:undefined);
}
export function clearWalletProvider(){selected=undefined;}
export function mobileWalletLinks(href){
  let url;
  try { url=new URL(href); }catch{ return null; }
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname||url.port)return null;
  // Do not forward a page query, fragment, access token, or user address to wallets.
  // Use only the public domain and fixed portfolio route.
  const safePage=url.origin+'/#live';
  return Object.freeze({
    metamask:'https://link.metamask.io/dapp/'+url.hostname,
    trust:'https://link.trustwallet.com/open_url?coin_id=60&url='+encodeURIComponent(safePage),
    page:safePage
  });
}
startWalletDiscovery();
