import { dataRecord } from '../input/data.ts';
import { address, BSC_USDT } from '../validation.ts';
import { canonicalJSON } from '../receipts/canonical.ts';
import { COW_RELAYER, COW_SETTLEMENT, fail } from './cow.ts';
import { bytecodeHash, hexHash, quantity, type Rpc } from './rpc.ts';

const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const beaconSlot = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
// An observation is a candidate pin. Reviewing source, proxy authority and
// deployments is a separate operator task, never an automatic trust decision.
export async function observeContractPins(rpcs: readonly [Rpc, Rpc], selectedStock: string) {
  const targets = [address(selectedStock), BSC_USDT.toLowerCase(), COW_SETTLEMENT, COW_RELAYER];
  if (new Set(targets).size !== 4) fail('CONTRACT_UNVERIFIED');
  const observations = await Promise.all(rpcs.map(async rpc => {
    if (quantity(await rpc.call('eth_chainId', [])) !== 56n) fail('CHAIN_MISMATCH');
    const block = dataRecord(await rpc.call('eth_getBlockByNumber', ['latest', false]));
    const tag = { blockHash: hexHash(block.hash), requireCanonical: true };
    return Promise.all(targets.map(async target => {
      const codeHash = bytecodeHash(await rpc.call('eth_getCode', [target, tag]));
      const slot = await rpc.call('eth_getStorageAt', [target, implementationSlot, tag]);
      const beacon = await rpc.call('eth_getStorageAt', [target, beaconSlot, tag]);
      if (beacon !== '0x' + '0'.repeat(64) || typeof slot !== 'string' || !/^0x0{24}[0-9a-fA-F]{40}$/.test(slot)) fail('CONTRACT_UNVERIFIED');
      const implementationAddress = BigInt(slot) === 0n ? null : address('0x' + slot.slice(-40));
      const implementation = implementationAddress === null ? null : { address: implementationAddress, codeHash: bytecodeHash(await rpc.call('eth_getCode', [implementationAddress, tag])) };
      return { address: target, codeHash, implementation };
    }));
  }));
  if (canonicalJSON(observations[0]) !== canonicalJSON(observations[1])) fail('RPC_DISAGREEMENT');
  return { kind: 'REMAIN_CONTRACT_PIN_OBSERVATION', review: 'UNVERIFIED', pins: observations[0]!, trust: 'TWO_RPC_AGREEMENT_NOT_SOURCE_REVIEW' };
}
