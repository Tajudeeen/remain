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
    const panel = document.createElement('div');
    panel.className = 'wallet-onchain-read';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary'; button.textContent = 'Verify token balance on BSC';
    const output = document.createElement('p'); output.setAttribute('role','status'); output.setAttribute('aria-live','polite');
    output.textContent = 'Works on this deployed site with a connected BSC wallet. Uses live wallet RPC reads without a server key.';
    panel.append(button,output); card.append(panel);
    const clear = () => { output.textContent = 'Previous balance cleared. Verify again to read current chain state.'; };
    window.ethereum?.on?.('accountsChanged', clear);
    window.ethereum?.on?.('chainChanged', clear);
    button.addEventListener('click', async () => {
      const token = document.getElementById('live-token')?.value.trim();
      if (!ADDRESS.test(token ?? '')) { output.textContent = 'Enter an ERC-20 contract address first.'; return; }
      button.disabled = true; output.textContent = 'Reading BSC token balance through your wallet...';
      try {
        const result = await readWalletToken(window.ethereum, token);
        output.textContent = result.formatted + ' token units at ' + result.owner.slice(0,8) + '… (BSC, observed ' + result.observedAt + '). Token identity and trade eligibility remain unverified.';
      } catch (error) { output.textContent = 'Unable to verify balance: ' + (error instanceof Error ? error.message : 'RPC_ERROR') + '. No transaction was sent.'; }
      finally { button.disabled = false; }
    });
  }
}
