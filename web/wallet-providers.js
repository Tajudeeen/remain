// EIP-6963 discovery plus one legacy injected-provider fallback. A name or rdns
// announced by a wallet is self-asserted, not evidence of wallet authenticity.
// A chosen provider is held only in page memory and shared by portfolio + sale.
let selected;
const providers=[];
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
  const legacy=target?.ethereum;
  if(validProvider(legacy)&&!list.some(x=>x.provider===legacy))list.push({id:'legacy-injected',name:'Browser wallet',provider:legacy});
  return list;
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
