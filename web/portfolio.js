import { activeWalletProvider } from './wallet-providers.js';
import { readWalletToken, ADDRESS } from './onchain.js';
import { validateCatalog } from './catalog.js';

// Explicit, bounded, read-only BSC scans. A failed RPC is unknown, never a zero holding.
// The total portfolio is never fabricated or valued without supported market prices.
export async function scanCatalogPage(catalog, provider, owner, cursor=0, limit=8, signal) {
  // Stock identities are immutable contract addresses, unlike expiring quotes.
  // Bound the browsing snapshot to 15 minutes so multi-page RPC scans can finish.
  const age=Date.now()-catalog?.observedAtMs;
  if(!Number.isSafeInteger(age)||age<0||age>900000)throw Error('CATALOG_EXPIRED');
  const verified=validateCatalog(catalog,Math.min(Date.now(),catalog.observedAtMs+59999));
  if (!ADDRESS.test(owner)||!Number.isInteger(cursor)||cursor<0||cursor>verified.stocks.length||
      !Number.isInteger(limit)||limit<1||limit>8) throw Error('INVALID_SCAN');
  signal?.throwIfAborted();
  if (!provider || typeof provider.request!=='function') throw Error('WALLET_UNAVAILABLE');
  const accounts=await provider.request({method:'eth_accounts'});
  const chain=await provider.request({method:'eth_chainId'});
  if (!Array.isArray(accounts)||accounts[0]?.toLowerCase()!==owner.toLowerCase()||
      typeof chain!=='string'||!/^0x[0-9a-fA-F]+$/.test(chain)||BigInt(chain)!==56n) throw Error('WALLET_CHANGED');
  const holdings=[], failed=[];
  const end=Math.min(cursor+limit,verified.stocks.length);
  for(let i=cursor;i<end;i++){
    signal?.throwIfAborted();
    const stock=verified.stocks[i];
    try {
      const balance=await readWalletToken(provider,stock.token);
      signal?.throwIfAborted();
      if(balance.owner!==owner.toLowerCase() || balance.decimals!==stock.decimals) throw Error('TOKEN_DECIMALS_MISMATCH');
      if(BigInt(balance.raw)>0n) holdings.push(Object.freeze({token:stock.token,ticker:stock.ticker,symbol:stock.symbol,
        issuer:stock.issuer,raw:balance.raw,formatted:balance.formatted,observedAt:balance.observedAt}));
    }catch(error){
      signal?.throwIfAborted();
      if(error instanceof Error && ['WALLET_CHANGED','BSC_REQUIRED'].includes(error.message))throw error;
      failed.push(stock.token);
    }
  }
  signal?.throwIfAborted();
  const after=await provider.request({method:'eth_accounts'});
  const chainAfter=await provider.request({method:'eth_chainId'});
  if(!Array.isArray(after)||after[0]?.toLowerCase()!==owner.toLowerCase()||
      typeof chainAfter!=='string'||!/^0x[0-9a-fA-F]+$/.test(chainAfter)||BigInt(chainAfter)!==56n)throw Error('WALLET_CHANGED');
  return Object.freeze({cursor:end,total:verified.stocks.length,complete:end===verified.stocks.length,
    scanned:end-cursor,holdings,failed});
}

if(typeof document!=='undefined' && document.querySelector('.stock-catalog-picker')){
  const root=document.querySelector('.stock-catalog-picker');
  const box=document.createElement('section');box.className='holdings-scanner';box.setAttribute('aria-label','My verified supported-token holdings');
  const heading=document.createElement('h4');heading.textContent='Find stocks in my wallet';
  const info=document.createElement('p');info.textContent='Load the supported stock catalog, connect your wallet, then scan contracts in small batches. Zero balances stay hidden. Failed RPC reads stay unknown.';
  const button=document.createElement('button');button.className='secondary';button.type='button';button.textContent='Check next 8 stocks ↗';button.disabled=true;
  const progress=document.createElement('p');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');progress.textContent='No holdings scanned.';
  const list=document.createElement('div');list.className='holdings-list';
  box.append(heading,info,button,progress,list);root.append(box);
  let catalog=null,wallet=null,cursor=0,failed=0,found=0,version=0,busy=false,abort;
  const tokenInput=document.getElementById('live-token');
  function reset(reason){
    version++;abort?.abort();abort=undefined;cursor=0;failed=0;found=0;busy=false;list.replaceChildren();
    progress.textContent=reason;
    button.disabled=!catalog||!wallet;
    button.textContent='Check next 8 stocks ↗';
  }
  window.addEventListener('remain-wallet-state',event=>{
    const state=event.detail;
    wallet=state?.status==='CONNECTED'&&ADDRESS.test(state?.address??'')?state.address:null;
    reset(wallet?'Wallet connected. Scan supported contracts to find holdings.':'Connect a BSC wallet to find holdings.');
  });
  window.addEventListener('remain-catalog-loaded',event=>{
    try{catalog=event.detail?validateCatalog(event.detail):null;}catch{catalog=null;}
    reset(catalog?'Supported stock catalog loaded. Ready to scan wallet holdings.':'Live catalog unavailable. Nothing can be scanned without verified stock identities.');
  });
  window.addEventListener('pagehide',()=>{wallet=null;catalog=null;reset('Wallet scan cleared.');});
  button.addEventListener('click',async()=>{
    if(!catalog||!wallet||busy)return;
    const current=++version,owner=wallet,provider=activeWalletProvider();
    abort=new AbortController();busy=true;button.disabled=true;
    progress.textContent='Checking real on-chain balances for this catalog page…';
    try{
      const result=await scanCatalogPage(catalog,provider,owner,cursor,8,abort.signal);
      if(current!==version||wallet!==owner||activeWalletProvider()!==provider)return;
      cursor=result.cursor;failed+=result.failed.length;found+=result.holdings.length;
      for(const item of result.holdings){
        const row=document.createElement('button');row.type='button';row.className='holding-row';
        const name=document.createElement('strong');name.textContent=item.ticker+' · '+item.symbol;
        const amount=document.createElement('span');amount.textContent=item.formatted+' tokens';
        const note=document.createElement('small');note.textContent='On-chain at '+new Date(item.observedAt).toLocaleTimeString()+' · '+item.issuer;
        row.append(name,amount,note);
        row.addEventListener('click',()=>{
          tokenInput.value=item.token;
          tokenInput.dispatchEvent(new Event('input',{bubbles:true}));
          tokenInput.scrollIntoView({behavior:'auto',block:'center'});
          progress.textContent='Stock contract selected. Check its latest balance and ask for a fresh market quote. The scan itself does not authorize a trade.';
        });
        list.append(row);
      }
      progress.textContent='Scanned '+cursor+' of '+result.total+' supported contracts · '+found+' positive holdings · '+failed+' unverified reads.'+
        (result.complete?' Catalog scan finished.':' Scan further to cover the rest of the catalog.');
      button.textContent=result.complete?'Catalog scan finished':'Check next 8 stocks ↗';
      button.disabled=result.complete;
    }catch(error){
      if(current===version)progress.textContent='Scan stopped: '+(error instanceof Error?error.message:'RPC_UNAVAILABLE')+
        '. Existing results should be refreshed if your wallet or chain changed.';
    }finally{if(current===version){busy=false;abort=undefined;button.disabled=!catalog||!wallet||cursor>=catalog.stocks.length;}}
  });
}
