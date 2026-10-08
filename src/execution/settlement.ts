import { decodeEventLog, parseAbi, type Hex } from 'viem';
import { dataRecord } from '../input/data.ts';
import { address, BSC_USDT } from '../validation.ts';
import { canonicalChecksum, canonicalJSON } from '../receipts/canonical.ts';
import { COW_SETTLEMENT, fail, type CashAuthorization } from './cow.ts';
import { hexHash, quantity, tokenValue, type Rpc } from './rpc.ts';

const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const tradeAbi = parseAbi(['event Trade(address indexed owner,address sellToken,address buyToken,uint256 sellAmount,uint256 buyAmount,uint256 feeAmount,bytes orderUid)']);
export type ChainReceipt = { mode: 'LIVE_RPC_OBSERVATION' | 'TEST_FIXTURE'; status: 'WAITING' | 'RECONCILED' | 'MISMATCH';
  txHash: string; blockHash: string | null; confirmations: number; stockDebitRaw: string | null; cashReceivedRaw: string | null;
  remainingStockRaw: string | null; reasons: string[]; checksum: string; trust: 'TWO_RPC_AGREEMENT_NOT_CONSENSUS_PROOF' };
async function observe(rpc: Rpc, auth: CashAuthorization, txHash: string) {
  if (quantity(await rpc.call('eth_chainId', [])) !== 56n) fail('CHAIN_MISMATCH');
  const raw = await rpc.call('eth_getTransactionReceipt', [txHash]); if (raw === null) return null;
  const r = dataRecord(raw), blockHash = hexHash(r.blockHash), number = quantity(r.blockNumber);
  if (hexHash(r.transactionHash) !== txHash || number === 0n || !Array.isArray(r.logs) || r.logs.length > 2048) fail('RPC_SCHEMA_INVALID');
  const block = dataRecord(await rpc.call('eth_getBlockByNumber', [r.blockNumber, false]));
  if (hexHash(block.hash) !== blockHash || quantity(block.number) !== number) fail('REORG_DETECTED');
  const parent = hexHash(block.parentHash), before = { blockHash: parent, requireCanonical: true }, after = { blockHash, requireCanonical: true };
  const head = quantity(await rpc.call('eth_blockNumber', []));
  const walletTopic = '0x' + auth.wallet.slice(2).padStart(64, '0');
  const logResults = await Promise.all([
    rpc.call('eth_getLogs', [{ blockHash, address: [auth.stock, BSC_USDT.toLowerCase()], topics: [transferTopic, walletTopic] }]),
    rpc.call('eth_getLogs', [{ blockHash, address: [auth.stock, BSC_USDT.toLowerCase()], topics: [transferTopic, null, walletTopic] }])
  ]);
  const logs = new Map<string, Record<string, unknown>>();
  for (const set of logResults) {
    if (!Array.isArray(set) || set.length > 256) fail('TRANSFER_LIMIT');
    for (const item of set) {
      const log = dataRecord(item), key = quantity(log.logIndex).toString();
      if (logs.has(key) && canonicalJSON(logs.get(key)) !== canonicalJSON(log)) fail('RPC_SCHEMA_INVALID'); logs.set(key, log);
    }
  }
  if (logs.size > 256) fail('TRANSFER_LIMIT');
  const [stockBefore, cashBefore, stockAfter, cashAfter] = await Promise.all([
    tokenValue(rpc, auth.stock, auth.wallet, before), tokenValue(rpc, BSC_USDT, auth.wallet, before),
    tokenValue(rpc, auth.stock, auth.wallet, after), tokenValue(rpc, BSC_USDT, auth.wallet, after)
  ]);
  let stock = 0n, cash = 0n; const reasons: string[] = [];
  const transferEvidence: { index: string; token: string; from: string; to: string; amountRaw: string; txHash: string }[] = [];
  for (const log of logs.values()) {
    const topics = log.topics;
    if (log.removed !== false || hexHash(log.blockHash) !== blockHash || quantity(log.blockNumber) !== number || !Array.isArray(topics) || topics.length !== 3 || topics[0] !== transferTopic || typeof log.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) fail('RPC_SCHEMA_INVALID');
    const topicAddress = (value: unknown) => { if (typeof value !== 'string' || !/^0x0{24}[0-9a-fA-F]{40}$/.test(value)) fail('RPC_SCHEMA_INVALID'); return '0x' + value.slice(-40).toLowerCase(); };
    const from = topicAddress(topics[1]), to = topicAddress(topics[2]), token = address(log.address), hash = hexHash(log.transactionHash);
    if (![auth.stock, BSC_USDT.toLowerCase()].includes(token) || from !== auth.wallet && to !== auth.wallet) fail('RPC_SCHEMA_INVALID');
    if (hash !== txHash) reasons.push('CONCURRENT_WALLET_ACTIVITY');
    const amount = BigInt(log.data), delta = (to === auth.wallet ? amount : 0n) - (from === auth.wallet ? amount : 0n);
    if (token === auth.stock) stock += delta; else cash += delta;
    transferEvidence.push({ index: quantity(log.logIndex).toString(), token, from, to, amountRaw: amount.toString(), txHash: hash });
  }
  let matches = 0;
  for (const item of r.logs) {
    const log = dataRecord(item);
    if (typeof log.address !== 'string' || log.address.toLowerCase() !== COW_SETTLEMENT) continue;
    try {
      const decoded = decodeEventLog({ abi: tradeAbi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
      if (decoded.args.orderUid.toLowerCase() !== auth.orderUid.toLowerCase()) continue;
      if (address(decoded.args.owner) !== auth.wallet || address(decoded.args.sellToken) !== auth.stock || address(decoded.args.buyToken) !== BSC_USDT.toLowerCase() || decoded.args.sellAmount.toString() !== auth.totalDebitRaw || decoded.args.feeAmount.toString() !== auth.stockFeeRaw || decoded.args.buyAmount < BigInt(auth.minimumCashRaw)) fail('ORDER_EVENT_MISMATCH');
      if (log.removed !== false || hexHash(log.blockHash) !== blockHash || hexHash(log.transactionHash) !== txHash) fail('RPC_SCHEMA_INVALID'); matches++;
    } catch (e) { if (e instanceof Error && ['ORDER_EVENT_MISMATCH', 'RPC_SCHEMA_INVALID'].includes(e.message)) throw e; }
  }
  if (matches !== 1) reasons.push('ORDER_EVENT_MISSING_OR_DUPLICATED');
  if (quantity(r.status) !== 1n) reasons.push('TRANSACTION_REVERTED');
  if (BigInt(stockAfter) - BigInt(stockBefore) !== stock || BigInt(cashAfter) - BigInt(cashBefore) !== cash) reasons.push('BALANCE_LOG_MISMATCH');
  if (stock !== -BigInt(auth.totalDebitRaw)) reasons.push('STOCK_DEBIT_MISMATCH');
  if (BigInt(stockAfter) < BigInt(auth.floorRaw)) reasons.push('FLOOR_BREACH');
  if (cash < BigInt(auth.minimumCashRaw) || cash < BigInt(auth.cashTargetRaw)) reasons.push('CASH_SHORTFALL');
  // Re-read canonical hash after all historical calls to detect a mid-read reorg.
  const recheck = dataRecord(await rpc.call('eth_getBlockByNumber', [r.blockNumber, false]));
  if (hexHash(recheck.hash) !== blockHash) fail('REORG_DETECTED');
  return { evidence: { txHash, blockHash, number: number.toString(), parent, stockBefore, cashBefore, stockAfter, cashAfter,
    stockDelta: stock.toString(), cashDelta: cash.toString(), transferEvidence: transferEvidence.sort((a, b) => BigInt(a.index) < BigInt(b.index) ? -1 : 1), reasons: [...new Set(reasons)] }, confirmations: head < number ? 0n : head - number + 1n };
}
export async function reconcileChain(rpcs: readonly [Rpc, Rpc], auth: CashAuthorization, hash: string, fixture = false): Promise<ChainReceipt> {
  const txHash = hexHash(hash), [a, b] = await Promise.all(rpcs.map(rpc => observe(rpc, auth, txHash)));
  const base = { mode: fixture ? 'TEST_FIXTURE' as const : 'LIVE_RPC_OBSERVATION' as const, txHash, trust: 'TWO_RPC_AGREEMENT_NOT_CONSENSUS_PROOF' as const };
  if (!a || !b) return { ...base, status: 'WAITING', blockHash: null, confirmations: 0, stockDebitRaw: null, cashReceivedRaw: null, remainingStockRaw: null, reasons: ['RECEIPT_NOT_FOUND'], checksum: canonicalChecksum(base) };
  if (canonicalJSON(a.evidence) !== canonicalJSON(b.evidence)) fail('RPC_DISAGREEMENT');
  const e = a.evidence, n = a.confirmations < b.confirmations ? a.confirmations : b.confirmations;
  const result = { ...base, status: e.reasons.length ? 'MISMATCH' as const : n < 12n ? 'WAITING' as const : 'RECONCILED' as const, blockHash: e.blockHash,
    confirmations: Number(n > 1000000n ? 1000000n : n), stockDebitRaw: (-BigInt(e.stockDelta)).toString(), cashReceivedRaw: e.cashDelta,
    remainingStockRaw: e.stockAfter, reasons: [...e.reasons, ...(n < 12n ? ['INSUFFICIENT_CONFIRMATIONS'] : [])] };
  return { ...result, checksum: canonicalChecksum({ result, evidence: e }) };
}
