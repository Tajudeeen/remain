// Independent, read-only BSC ERC-20 balance verification using the user's wallet RPC.
// This reports token units, never claims that an arbitrary contract represents a stock.
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export function formatUnits(raw, decimals) {
  if (typeof raw !== 'bigint' || raw < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('INVALID_BALANCE');
  const divisor = 10n ** BigInt(decimals);
  const whole = (raw / divisor).toString();
  const fraction = (raw % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? whole + '.' + fraction : whole;
}
function decodeUint(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error('INVALID_RPC_RESPONSE');
  return BigInt(hex);
}
export async function readWalletToken(provider, token) {
  if (!provider || typeof provider.request !== 'function' || !ADDRESS.test(token)) throw new Error('INVALID_TOKEN');
  const chain = await provider.request({ method: 'eth_chainId' });
  if (typeof chain !== 'string' || !/^0x[0-9a-fA-F]+$/.test(chain) || BigInt(chain) !== 56n) throw new Error('BSC_REQUIRED');
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!Array.isArray(accounts) || !accounts.length || !ADDRESS.test(accounts[0])) throw new Error('CONNECT_WALLET');
  const owner = accounts[0].toLowerCase();
  const call = data => provider.request({ method: 'eth_call', params: [{ to: token, data }, 'latest'] });
  // ERC-20 balanceOf(address) and decimals(). No eth_sendTransaction or signing.
  const [balanceHex, decimalsHex] = await Promise.all([
    call('0x70a08231' + owner.slice(2).padStart(64, '0')),
    call('0x313ce567')
  ]);
  const balance = decodeUint(balanceHex), decimalsRaw = decodeUint(decimalsHex);
  if (decimalsRaw > 36n) throw new Error('INVALID_DECIMALS');
  const chainAfter = await provider.request({ method: 'eth_chainId' });
  const accountsAfter = await provider.request({ method: 'eth_accounts' });
  if (typeof chainAfter !== 'string' || !/^0x[0-9a-fA-F]+$/.test(chainAfter) || BigInt(chainAfter) !== 56n || !Array.isArray(accountsAfter) || accountsAfter[0]?.toLowerCase() !== owner) throw new Error('WALLET_CHANGED');
  return Object.freeze({ owner, token: token.toLowerCase(), raw: balance.toString(), decimals: Number(decimalsRaw), formatted: formatUnits(balance, Number(decimalsRaw)), chainId: 56, source: 'WALLET_RPC_ETH_CALL', observedAt: new Date().toISOString() });
}
if (typeof document !== 'undefined') {
  const card = document.querySelector('#live-view .wallet-card');
  if (card) {
    const panel=document.createElement('section');panel.className='wallet-onchain-read';panel.setAttribute('aria-label','Verified BSC token balance');
    const title=document.createElement('h4');title.textContent='On-chain position check';
    const body=document.createElement('p');body.setAttribute('role','status');body.setAttribute('aria-live','polite');
    body.textContent='Connect a BSC wallet, choose a token, then read its actual on-chain balance.';
    const amount=document.createElement('strong');amount.className='verified-amount';amount.hidden=true;
    const meta=document.createElement('p');meta.className='verified-source';meta.hidden=true;
    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Read balance on BSC ↗';button.disabled=true;
    panel.append(title,body,amount,meta,button);card.append(panel);
    let wallet=null, version=0, busy=false;
    const tokenField=document.getElementById('live-token');
    function clear(message) {
      version++;amount.hidden=true;meta.hidden=true;amount.textContent='';meta.textContent='';
      body.textContent=message;busy=false;button.disabled=!wallet;
    }
    window.addEventListener('remain-wallet-state',event=>{
      const state=event.detail;
      wallet=state?.status==='CONNECTED' && ADDRESS.test(state?.address??'')?state.address:null;
      clear(wallet?'Connected. Choose a token contract to read its current balance.':'Connect a BSC wallet to read its tokens.');
    });
    tokenField.addEventListener('input',()=>clear('Token selection changed. Read again to avoid displaying a stale balance.'));
    window.addEventListener('pagehide',()=>{wallet=null;clear('Connect a BSC wallet to read its tokens.');});
    button.addEventListener('click',async()=>{
      if(!wallet||busy)return;
      const token=tokenField.value.trim();
      if(!ADDRESS.test(token)){body.textContent='Select or enter a valid ERC-20 contract address.';return;}
      const current=++version, owner=wallet.toLowerCase(), walletProvider=window.ethereum;
      busy=true;button.disabled=true;amount.hidden=true;meta.hidden=true;body.textContent='Reading actual BSC chain state from your wallet provider…';
      try {
        const result=await readWalletToken(walletProvider,token);
        if(current!==version||wallet?.toLowerCase()!==owner||tokenField.value.trim().toLowerCase()!==result.token||window.ethereum!==walletProvider)return;
        amount.textContent=result.formatted+' token units';
        amount.hidden=false;meta.hidden=false;
        meta.textContent='Observed '+new Date(result.observedAt).toLocaleTimeString()+' · BSC chain 56 · '+result.token;
        body.textContent=result.raw==='0'?'Zero units at this contract. No holding is inferred.':'A positive on-chain token balance was observed. Tokenized-stock identity, quote availability, market price and cash value need separate checks.';
      } catch(error) {
        if(current===version)body.textContent='Balance could not be verified: '+(error instanceof Error?error.message:'RPC_UNAVAILABLE')+'. No balance has been assumed.';
      } finally{if(current===version){busy=false;button.disabled=!wallet;}}
    });
  }
}
