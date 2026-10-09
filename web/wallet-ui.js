import {availableWallets,requestWalletDiscovery,chooseWalletProvider,mobileWalletLinks} from './wallet-providers.js';
let chooser;
export function showWalletChoice(onPick){
  if(typeof document==='undefined')return;
  const card=document.querySelector('#live-view .wallet-card');
  if(!card)return;
  if(!chooser){
    chooser=document.createElement('div');
    chooser.className='wallet-chooser';chooser.id='wallet-chooser';
    chooser.setAttribute('role','group');chooser.setAttribute('aria-label','Choose a wallet');
    card.append(chooser);
  }
  chooser.replaceChildren();
  const title=document.createElement('h4');title.textContent='Choose how to connect';
  const instructions=document.createElement('p');instructions.textContent='Choose an available wallet. On a phone, open this site in the wallet app browser to connect securely.';
  const options=document.createElement('div');options.className='wallet-options';
  const list=availableWallets();
  requestWalletDiscovery();
  for(const item of list){
    const button=document.createElement('button');button.type='button';button.className='secondary';
    button.textContent=item.name+(item.id==='legacy-injected'?' (in this browser)':'');
    button.addEventListener('click',()=>{chooser.hidden=true;onPick(chooseWalletProvider(item.provider));});
    options.append(button);
  }
  if(!list.length){
    const empty=document.createElement('p');empty.textContent='No compatible wallet is available in this browser. This does not mean you are connected.';
    options.append(empty);
  }
  const links=mobileWalletLinks(location.href);
  if(links){
    const message=document.createElement('p');message.textContent='On mobile, open Remain inside one of these wallet apps. No wallet authorization happens until you connect there.';
    const handoff=document.createElement('div');handoff.className='wallet-handoff';
    for(const [label,url] of [['Open in MetaMask',links.metamask],['Open in Trust Wallet',links.trust]]){
      const a=document.createElement('a');a.className='secondary';a.href=url;a.textContent=label+' ↗';a.rel='noopener noreferrer';
      handoff.append(a);
    }
    options.append(message,handoff);
  }
  const note=document.createElement('p');note.textContent='BSC network (chain 56) is required. Never share a seed phrase or private key. WalletConnect QR pairing is not enabled on this deployment.';
  const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='Close wallet choices';
  close.addEventListener('click',()=>{chooser.hidden=true;});
  chooser.append(title,instructions,options,note,close);chooser.hidden=false;
  close.focus();
}
