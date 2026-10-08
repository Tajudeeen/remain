import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Hex } from 'viem';
import { COW_SETTLEMENT, COW_RELAYER, cowFields, cowDomainFields } from '../../src/execution/cow.ts';
import { bytecodeHash, type Rpc } from '../../src/execution/rpc.ts';
import { BSC_USDT } from '../../src/validation.ts';
import type { Reader } from '../../src/feasibility.ts';
import type { Query } from '../../src/signing.ts';
import type { OrderReviewInput } from '../../web/order-review.js';
export const time = 1800000000000;
export const stock = '0x2222222222222222222222222222222222222222';
export const txHash = ('0x' + '3'.repeat(64)) as Hex, blockHash = ('0x' + '4'.repeat(64)) as Hex, parentHash = ('0x' + '5'.repeat(64)) as Hex;
export const zero = '0x' + '0'.repeat(64), cash = 25n * 10n ** 18n;
export const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0');
export function executionFixture() {
  // Generated only in process. No funded account or private key is persisted.
  const account = privateKeyToAccount(generatePrivateKey()), wallet = account.address.toLowerCase();
  const input: OrderReviewInput = { intent: { wallet, token: stock, cashTarget: '25', retainBps: 7000, maxImpactBps: 50, allowClosedMarket: false }, amountRaw: '25', vendor: 'CowSwap', expectedOutputRaw: cash.toString(), cashDecimals: 18 };
  const typed = { domain: { name: 'Gnosis Protocol', version: 'v2', chainId: 56, verifyingContract: COW_SETTLEMENT }, types: { EIP712Domain: structuredClone([...cowDomainFields]), Order: structuredClone([...cowFields]) }, primaryType: 'Order',
    message: { sellToken: stock, buyToken: BSC_USDT.toLowerCase(), receiver: wallet, sellAmount: '24', buyAmount: cash.toString(), validTo: time / 1000 + 600, appData: zero, feeAmount: '1', kind: 'sell', partiallyFillable: false, sellTokenBalance: 'erc20', buyTokenBalance: 'erc20' } };
  const quote = { binanceChainId: '56', executionMode: 'RFQ', vendorName: 'CowSwap', quoteId: 'cache-quote', fromTokenAmount: '25', toTokenAmount: cash.toString(),
    fromToken: { tokenContractAddress: stock, decimal: '0', isHoneyPot: false, taxRate: '0' }, toToken: { tokenContractAddress: BSC_USDT.toLowerCase(), decimal: '18', isHoneyPot: false, taxRate: '0' },
    priceImpactPercent: '-0.01', feeAmount: null, feeToken: null, actualSwapAmount: null };
  const reader: Reader = { async get(endpoint: string, _query?: Query) {
    let data: unknown;
    if (endpoint.endsWith('/tokens')) data = [{ binanceChainId: '56', tokenContractAddress: stock, assetType: 1, platformId: 'ondo', decimals: 0, tokenSymbol: 'FIXon', underlyingTicker: 'FIX' }];
    else if (endpoint.includes('/balance/')) data = [{ page: 1, pageSize: 100, tokenAssets: [{ binanceChainId: '56', address: wallet, tokenContractAddress: stock, rawBalance: '100', isRiskToken: false }] }];
    else if (endpoint.endsWith('/underlying-market')) data = { binanceChainId: '56', tokenContractAddress: stock, statusInfo: { marketStatus: 'regular', openState: true, reasonCode: 'TRADING' } };
    else if (endpoint.endsWith('/quote')) data = [quote];
    else data = { executionMode: 'RFQ', routerResult: quote, tx: { from: wallet }, rfq: { vendor: 'CowSwap', orderId: 'rfq-context-id', signingScheme: 'EIP712', typedDataToSign: typed } };
    return { data: structuredClone(data), timestamp: time, responseHash: 'fixture', latencyMs: 0 };
  } };
  const pins = [stock, BSC_USDT.toLowerCase(), COW_SETTLEMENT, COW_RELAYER].map(address => ({ address, codeHash: bytecodeHash('0x6000'), implementation: null }));
  const flags = { settled: false, invalidated: false, allowance: 25n, stockBalance: 100n, head: 111n, wrongChain: false, reorg: false, concurrent: false, shortfall: false, duplicate: false, removed: false, orderUid: '' as Hex, filled: 0n };
  const transferAbi = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
  const tradeAbi = parseAbi(['event Trade(address indexed owner,address sellToken,address buyToken,uint256 sellAmount,uint256 buyAmount,uint256 feeAmount,bytes orderUid)']);
  function transfer(token: string, from: string, to: string, amount: bigint, index: number) {
    return { address: token, blockHash, blockNumber: '0x64', transactionHash: flags.concurrent ? ('0x' + '9'.repeat(64)) : txHash,
      logIndex: '0x' + index.toString(16), removed: flags.removed,
      topics: encodeEventTopics({ abi: transferAbi, eventName: 'Transfer', args: { from: from as Hex, to: to as Hex } }), data: word(amount) };
  }
  function logs() { return [transfer(stock, wallet, COW_SETTLEMENT, 25n, 1), transfer(BSC_USDT.toLowerCase(), COW_SETTLEMENT, wallet, flags.shortfall ? cash - 1n : cash, 2)]; }
  const rpc: Rpc = { async call(method, params) {
    if (method === 'eth_chainId') return flags.wrongChain ? '0x1' : '0x38';
    if (method === 'eth_blockNumber') return '0x' + flags.head.toString(16);
    if (method === 'eth_getBlockByNumber') return { hash: flags.reorg ? txHash : blockHash, number: '0x64', parentHash, timestamp: '0x' + (time / 1000).toString(16) };
    if (method === 'eth_getCode') return params[0] === wallet ? '0x' : '0x6000';
    if (method === 'eth_getStorageAt') return zero;
    if (method === 'eth_call') {
      const call = params[0] as { to: string; data: string }, tag = params[1] as { blockHash?: string } | string;
      if (call.data.startsWith('0x70a08231')) {
        const before = typeof tag === 'object' && tag.blockHash === parentHash;
        return word(call.to === stock ? before ? 100n : flags.settled ? 75n : flags.stockBalance : before || !flags.settled ? 0n : cash);
      }
      if (call.data.startsWith('0xdd62ed3e')) return word(flags.allowance);
      if (call.data.startsWith('0x313ce567')) return word(call.to === stock ? 0n : 18n);
      return word(flags.invalidated ? 2n ** 256n - 1n : flags.filled);
    }
    if (method === 'eth_getLogs') {
      const filter = params[0] as { topics: unknown[] };
      return logs().filter(log => filter.topics[1] ? log.topics[1] === filter.topics[1] : log.topics[2] === filter.topics[2]);
    }
    if (method === 'eth_getTransactionReceipt') {
      if (flags.invalidated) {
        const abi = parseAbi(['event OrderInvalidated(address indexed owner,bytes orderUid)']);
        const log = { address: COW_SETTLEMENT, blockHash, blockNumber: '0x64', transactionHash: txHash, logIndex: '0x3', removed: flags.removed,
          topics: encodeEventTopics({ abi, eventName: 'OrderInvalidated', args: { owner: wallet as Hex } }), data: encodeAbiParameters([{ type: 'bytes' }], [flags.orderUid]) };
        return { transactionHash: txHash, blockHash, blockNumber: '0x64', status: '0x1', logs: [log, ...(flags.duplicate ? [log] : [])] };
      }
      if (!flags.settled) return null;
      const trade = { address: COW_SETTLEMENT, blockHash, blockNumber: '0x64', transactionHash: txHash, logIndex: '0x3', removed: false,
        topics: encodeEventTopics({ abi: tradeAbi, eventName: 'Trade', args: { owner: wallet as Hex } }),
        data: encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }], [stock, BSC_USDT as Hex, 25n, cash, 1n, flags.orderUid]) };
      return { transactionHash: txHash, blockHash, blockNumber: '0x64', status: '0x1', logs: [...logs(), trade, ...(flags.duplicate ? [trade] : [])] };
    }
    throw new Error('FIXTURE_METHOD_UNEXPECTED');
  } };
  return { account, wallet, input, typed, quote, reader, pins, rpc, flags };
}
