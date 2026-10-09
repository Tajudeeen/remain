import {captureTokenBalanceEvidence,recheckTokenBalanceEvidence,validateTokenBalanceEvidence} from './balance-evidence.js';
import {activeWalletProvider} from './wallet-providers.js';
// Explicit optional exports. Public wallet addresses and position sizes are sensitive.
// This module never forwards evidence to a server.
if(typeof document!=='undefined'&&document.querySelector('#live-view .wallet-card')){
  const host=document.querySelector('#live-view .wallet-card');
  const panel=document.createElement('section');panel.className='balance-evidence-panel';
  panel.setAttribute('aria-label','On-chain position evidence');
  const heading=document.createElement('h4');heading.textContent='Verify a balance at a block';
  const description=document.createElement('p');description.textContent='Capture a real token balance at a recorded BSC block. Save a local JSON record or replay an existing record through a wallet RPC. No signatures or transactions.';
  const capture=document.createElement('button');capture.type='button';capture.className='secondary';capture.textContent='Capture block-pinned balance ↗';
  const download=document.createElement('button');download.type='button';download.className='secondary';download.textContent='Download private evidence ↓';download.disabled=true;
  const label=document.createElement('label');label.className='field-label';label.textContent='Recheck a local balance evidence JSON';label.htmlFor='balance-evidence-file';
  const upload=document.createElement('input');upload.type='file';upload.id='balance-evidence-file';upload.accept='.json,application/json';
  const replay=document.createElement('button');replay.type='button';replay.className='secondary';replay.textContent='Recheck evidence against BSC ↗';replay.disabled=true;
  const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');message.textContent='No block-pinned evidence collected.';
  const detail=document.createElement('code');detail.className='balance-evidence-detail';
  const privacy=document.createElement('p');privacy.textContent='Privacy: downloaded evidence contains the public wallet address, token contract and exact balance. It proves neither wallet ownership nor stock eligibility, price or a sale. Never publish a user’s holdings without consent.';
  const actions=document.createElement('div');actions.className='wallet-actions';actions.append(capture,download);
  panel.append(heading,description,actions,label,upload,replay,detail,message,privacy);host.append(panel);
  let current,selected,session=0,busy=false,connected=false;
  const tokenField=document.getElementById('live-token');
  const reset=text=>{session++;busy=false;capture.disabled=false;current=undefined;selected=undefined;download.disabled=true;replay.disabled=true;detail.textContent='';message.textContent=text;};
  window.addEventListener('remain-wallet-state',event=>{
    connected=event.detail?.status==='CONNECTED';
    reset(connected?'Connected on BSC. Select a token and capture a fresh block.':'Connect a BSC wallet to capture balance evidence.');
  });
  tokenField?.addEventListener('input',()=>reset('Token changed. Prior evidence cleared from this page.'));
  window.addEventListener('pagehide',()=>reset('Evidence cleared when the page was closed.'));
  capture.addEventListener('click',async()=>{
    if(busy)return;
    const value=tokenField?.value?.trim()??'';
    const provider=activeWalletProvider();
    if(!connected||!provider){message.textContent='Connect a BSC wallet before capturing evidence.';return;}
    busy=true;capture.disabled=true;download.disabled=true;const version=++session;
    message.textContent='Reading an exact token balance at a pinned BSC block…';
    try{
      const evidence=await captureTokenBalanceEvidence(provider,value);
      if(version!==session||provider!==activeWalletProvider()||tokenField.value.trim().toLowerCase()!==evidence.token)return;
      current=evidence;download.disabled=false;
      detail.textContent='BSC block '+BigInt(evidence.blockNumber).toString()+' · '+evidence.blockHash+' · '+evidence.raw+' raw token units (decimals '+evidence.decimals+')';
      message.textContent='Block-pinned observation captured. Recheck it independently before relying on it. This is not proof of a completed sale.';
    }catch{if(version===session)message.textContent='Unable to capture canonical BSC token state. The wallet RPC may not support historical/finalized reads; no evidence was created.';}
    finally{if(version===session){busy=false;capture.disabled=false;}}
  });
  download.addEventListener('click',()=>{
    if(!current)return;
    const data=JSON.stringify(current,null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='remain-private-bsc-balance-evidence.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    message.textContent='Private wallet balance evidence downloaded locally. Do not publish it without the holder’s consent.';
  });
  upload.addEventListener('change',async()=>{
    const file=upload.files?.[0];const version=++session;selected=undefined;replay.disabled=true;
    if(!file)return;
    if(file.size>4096||file.size===0){message.textContent='Invalid JSON file size. Maximum 4 KiB.';upload.value='';return;}
    try{
      const value=validateTokenBalanceEvidence(JSON.parse(await file.text()));
      if(version!==session)return;
      selected=value;replay.disabled=false;
      message.textContent='Valid evidence schema loaded. Recheck it against an independent BSC RPC; file validity alone proves nothing.';
    }catch{if(version===session)message.textContent='Invalid balance evidence JSON. No claim was accepted.';}
    finally{upload.value='';}
  });
  replay.addEventListener('click',async()=>{
    if(!selected||busy)return;
    const provider=activeWalletProvider();
    if(!provider){message.textContent='Open Remain in a BSC wallet browser to independently replay this evidence. A wallet signature is not requested.';return;}
    busy=true;replay.disabled=true;const version=++session;
    message.textContent='Replaying token calls at the exact recorded block…';
    try{
      const result=await recheckTokenBalanceEvidence(provider,selected);
      if(version!==session)return;
      message.textContent=result.status+': '+result.message;
    }catch{if(version===session)message.textContent='RPC replay unavailable or invalid; evidence is not independently verified. Try an RPC with historical block support.';}
    finally{if(version===session){busy=false;replay.disabled=!selected;}}
  });
}
