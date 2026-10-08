import { decodeEventLog, encodeFunctionData, parseAbi, type Hex } from 'viem';
import { dataRecord } from '../input/data.ts';
import { address } from '../validation.ts';
import { canonicalJSON } from '../receipts/canonical.ts';
import { COW_SETTLEMENT, fail, type CashAuthorization } from './cow.ts';
import { hexHash, quantity, type Rpc } from './rpc.ts';

const event = parseAbi(['event OrderInvalidated(address indexed owner,bytes orderUid)']);
export async function confirmInvalidation(rpcs: readonly [Rpc, Rpc], auth: CashAuthorization, hash: string) {
  const txHash = hexHash(hash);
  const observations = await Promise.all(rpcs.map(async rpc => {
    if (quantity(await rpc.call('eth_chainId', [])) !== 56n) fail('CHAIN_MISMATCH');
    const value = await rpc.call('eth_getTransactionReceipt', [txHash]); if (!value) fail('CANCELLATION_UNCONFIRMED');
    const receipt = dataRecord(value), blockHash = hexHash(receipt.blockHash), number = quantity(receipt.blockNumber);
    if (hexHash(receipt.transactionHash) !== txHash || quantity(receipt.status) !== 1n || !Array.isArray(receipt.logs) || receipt.logs.length > 256) fail('CANCELLATION_UNCONFIRMED');
    const block = dataRecord(await rpc.call('eth_getBlockByNumber', [receipt.blockNumber, false]));
    if (hexHash(block.hash) !== blockHash || quantity(block.number) !== number) fail('REORG_DETECTED');
    if (quantity(await rpc.call('eth_blockNumber', [])) < number + 11n) fail('CANCELLATION_UNCONFIRMED');
    let matches = 0;
    for (const item of receipt.logs) {
      const log = dataRecord(item); if (typeof log.address !== 'string' || log.address.toLowerCase() !== COW_SETTLEMENT) continue;
      try {
        const decoded = decodeEventLog({ abi: event, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
        if (decoded.args.orderUid.toLowerCase() !== auth.orderUid.toLowerCase()) continue;
        if (address(decoded.args.owner) !== auth.wallet || log.removed !== false || hexHash(log.blockHash) !== blockHash || hexHash(log.transactionHash) !== txHash) fail('CANCELLATION_UNCONFIRMED'); matches++;
      } catch (e) { if (e instanceof Error && e.message === 'CANCELLATION_UNCONFIRMED') throw e; }
    }
    const data = encodeFunctionData({ abi: parseAbi(['function filledAmount(bytes orderUid) view returns (uint256)']), functionName: 'filledAmount', args: [auth.orderUid] });
    const filled = await rpc.call('eth_call', [{ to: COW_SETTLEMENT, data }, { blockHash, requireCanonical: true }]);
    if (matches !== 1 || filled !== '0x' + 'f'.repeat(64)) fail('CANCELLATION_UNCONFIRMED');
    const recheck = dataRecord(await rpc.call('eth_getBlockByNumber', [receipt.blockNumber, false])); if (hexHash(recheck.hash) !== blockHash) fail('REORG_DETECTED');
    return { txHash, blockHash, number: number.toString(), orderUid: auth.orderUid };
  }));
  if (canonicalJSON(observations[0]) !== canonicalJSON(observations[1])) fail('RPC_DISAGREEMENT');
  return observations[0]!;
}
