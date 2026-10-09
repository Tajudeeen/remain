// Browse only assets independently returned by the configured Binance RWA catalog.
// No example token is ever substituted for an unavailable real catalog.
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export function validateCatalog(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== 'kind,mode,observedAtMs,stocks' ||
    value.kind !== 'REMAIN_LIVE_CATALOG' || value.mode !== 'LIVE_READ_ONLY' || !Number.isSafeInteger(value.observedAtMs) ||
    value.observedAtMs > now || now - value.observedAtMs > 60000 || !Array.isArray(value.stocks) || value.stocks.length > 2048) throw Error('INVALID_CATALOG');
  const seen = new Set();
  for (const s of value.stocks) {
    if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).sort().join() !== 'decimals,issuer,symbol,ticker,token' ||
      !ADDRESS.test(s.token) || s.token !== s.token.toLowerCase() || seen.has(s.token) || !['ondo','bstock','xstocks'].includes(s.issuer) ||
      !Number.isInteger(s.decimals) || s.decimals < 0 || s.decimals > 36 ||
      !/^[a-zA-Z0-9._-]{1,24}$/.test(s.symbol) || !/^[a-zA-Z0-9._-]{1,24}$/.test(s.ticker)) throw Error('INVALID_CATALOG');
    seen.add(s.token);
  }
  return value;
}
if (typeof document !== 'undefined' && document.getElementById('live-token')) {
  const token = document.getElementById('live-token'), form = document.getElementById('live-form');
  const section = document.createElement('div'); section.className='stock-catalog-picker';
  const button = document.createElement('button'); button.type='button'; button.className='secondary'; button.textContent='Find supported BSC stocks';
  const label = document.createElement('label'); label.className='field-label'; label.textContent='Choose an asset returned by the live catalog';
  const select = document.createElement('select'); select.setAttribute('aria-label','Supported BSC stock');
  select.disabled=true;
  const status = document.createElement('p'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  status.textContent='Available when the live market service is configured. You can still enter a contract manually.';
  section.append(button,label,select,status); form.insertBefore(section,token.previousElementSibling);
  let controller;
  button.addEventListener('click',async()=>{
    controller?.abort(); controller = new AbortController(); const active=controller, timeout=setTimeout(()=>active.abort(),12000);
    button.disabled=true; select.disabled=true; select.replaceChildren(); status.textContent='Loading a fresh Binance BSC stock catalog...';
    try {
      const res = await fetch('/api/live/catalog',{signal:active.signal,cache:'no-store',credentials:'omit',redirect:'error'});
      if (!res.ok) throw Error(res.status===503?'MARKET_SERVICE_NOT_CONFIGURED':'CATALOG_UNAVAILABLE');
      const length=Number(res.headers.get('content-length')||'0'); if (length>1024*1024) throw Error('CATALOG_TOO_LARGE');
      const content=await res.text(); if(content.length>1024*1024) throw Error('CATALOG_TOO_LARGE');
      const data=validateCatalog(JSON.parse(content));
      const placeholder=document.createElement('option'); placeholder.value='';placeholder.textContent='Select a supported token';select.append(placeholder);
      for(const s of data.stocks){const option=document.createElement('option');option.value=s.token;option.textContent=s.ticker+' · '+s.symbol+' · '+s.issuer;select.append(option);}
      select.disabled=data.stocks.length===0;
      status.textContent=data.stocks.length+' BSC tokenized-stock identities reported. Market status, wallet balance, price, and trading availability require fresh independent checks.';
    } catch(e) { if(active.signal.aborted) status.textContent='Catalog request cancelled or timed out.'; else status.textContent='Catalog unavailable. '+(e instanceof Error?e.message:'UNKNOWN')+'. Enter a supported contract manually.'; }
    finally{clearTimeout(timeout);if(controller===active){controller=undefined;button.disabled=false;}}
  });
  select.addEventListener('change',()=>{
    if(!select.value)return;
    token.value=select.value;
    token.dispatchEvent(new Event('input',{bubbles:true}));
    status.textContent='Stock contract selected. Read your actual balance and request a fresh quote.';
  });
  window.addEventListener('pagehide',()=>controller?.abort());
}
