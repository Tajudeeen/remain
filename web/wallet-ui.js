import {
  availableWallets,requestWalletDiscovery,chooseWalletProvider,
  mobileWalletLinks,subscribeWalletProviders
} from './wallet-providers.js';

let chooser, selection, options;
function refreshWalletChoices() {
  if (!chooser || chooser.hidden || !options) return;
  const list=availableWallets();
  options.replaceChildren();
  for (const item of list) {
    const button=document.createElement('button');
    button.type='button';button.className='secondary';
    button.textContent=item.name;
    button.addEventListener('click',()=>{
      if(!selection)return;
      chooser.hidden=true;
      selection(chooseWalletProvider(item.provider));
    });
    options.append(button);
  }
  if (!list.length) {
    const empty=document.createElement('p');
    empty.textContent='No compatible browser wallet detected yet. Unlock an installed extension, then choose Refresh wallets. If you have no extension, open this site in a wallet app or install one from its official website.';
    options.append(empty);
    const help=document.createElement('div');help.className='wallet-handoff';
    for (const [label,url] of [['Get MetaMask','https://metamask.io/download/'],['Get Trust Wallet','https://trustwallet.com/download']]) {
      const link=document.createElement('a');link.className='secondary';
      link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=label+' ↗';
      help.append(link);
    }
    options.append(help);
  }
  const retry=document.createElement('button');
  retry.type='button';retry.className='secondary';
  retry.textContent='Refresh wallets ↻';
  retry.addEventListener('click',()=>{requestWalletDiscovery();refreshWalletChoices();});
  options.append(retry);
}
subscribeWalletProviders(()=>refreshWalletChoices());

export function showWalletChoice(onPick) {
  if(typeof document==='undefined'||typeof onPick!=='function')return;
  const card=document.querySelector('#live-view .wallet-card');
  if(!card)return;
  selection=onPick;
  if(!chooser) {
    chooser=document.createElement('div');chooser.className='wallet-chooser';
    chooser.id='wallet-chooser';chooser.setAttribute('role','group');
    chooser.setAttribute('aria-label','Choose a wallet');
    const title=document.createElement('h4');title.textContent='Choose how to connect';
    const instructions=document.createElement('p');
    instructions.textContent='Select your browser extension. On a phone, open this site in the wallet app browser. Connecting only requests your public account.';
    options=document.createElement('div');options.className='wallet-options';
    const links=mobileWalletLinks(location.href);
    const handoff=document.createElement('div');handoff.className='wallet-handoff';
    if(links) {
      const hint=document.createElement('p');
      hint.textContent='Mobile wallet apps (opens the public Remain site, without account details):';
      handoff.append(hint);
      for(const [label,url] of [['Open in MetaMask',links.metamask],['Open in Trust Wallet',links.trust]]) {
        const a=document.createElement('a');a.className='secondary';
        a.href=url;a.textContent=label+' ↗';a.rel='noopener noreferrer';
        handoff.append(a);
      }
    }
    const note=document.createElement('p');
    note.textContent='BNB Smart Chain (chain 56) is required for balance reads. Never share a seed phrase. WalletConnect QR pairing is not enabled.';
    const close=document.createElement('button');close.type='button';
    close.className='secondary';close.textContent='Close wallet choices';
    close.addEventListener('click',()=>{chooser.hidden=true;});
    chooser.append(title,instructions,options,handoff,note,close);
    card.append(chooser);
  }
  chooser.hidden=false;
  refreshWalletChoices();
  // Request a fresh EIP-6963 announcement after subscribing. Wallets that
  // respond asynchronously appear without the user having to reopen the UI.
  requestWalletDiscovery();
  chooser.querySelector('button')?.focus();
}
