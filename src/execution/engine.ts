import { randomUUID } from 'node:crypto';
import { encodeFunctionData, parseAbi } from 'viem';
import { ReadOnlyBinanceClient } from '../client.ts';
import type { Reader } from '../feasibility.ts';
import { prepareCashCandidate, cashOrderInput, cashPreviewInput, exploreCashTarget } from '../integration/preview.ts';
import { dataRecord } from '../input/data.ts';
import { address, BSC_USDT, selectedMarket, uint } from '../validation.ts';
import { identifier } from '../orders/model.ts';
import { authorizeCow, approval, cancellation, COW_RELAYER, COW_SETTLEMENT, fail, verifyOrderSignature } from './cow.ts';
import { ExecutionStore, type ExecutionRecord } from './store.ts';
import { BinanceExecutionVendor, vendorObservation, type ExecutionVendor } from './vendor.ts';
import { bytecodeHash, hexHash, HttpRpc, quantity, tokenValue, type Rpc } from './rpc.ts';
import { reconcileChain } from './settlement.ts';
import { confirmInvalidation } from './invalidation.ts';

export type ContractPin = { address: string; codeHash: string; implementation: { address: string; codeHash: string } | null };
export type ExecutionOptions = { reader: Reader; vendor: ExecutionVendor; rpcs: readonly [Rpc, Rpc]; store: ExecutionStore;
  pins: readonly ContractPin[]; maximumStockFeeRaw: string; mode: 'TEST_FIXTURE' | 'LIVE_EXECUTION'; now?: () => number };
const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const beaconSlot = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
export class ExecutionEngine {
  private readonly now: () => number;
  private readonly options: ExecutionOptions;
  constructor(options: ExecutionOptions) { this.options = options; this.now = options.now ?? Date.now; }
  async preview(wallet: string, value: unknown) {
    const input = cashPreviewInput(value); if (input.wallet !== wallet) fail('INVALID_EXECUTION_INPUT');
    return exploreCashTarget(input, this.options.reader, AbortSignal.timeout(12000), this.options.mode === 'TEST_FIXTURE' ? 'TEST_FIXTURE' : 'LIVE_READ_ONLY', this.now);
  }
  private async controls(stock: string, wallet: string, expectedStockDecimals: number) {
    const facts = await Promise.all(this.options.rpcs.map(async rpc => {
      if (quantity(await rpc.call('eth_chainId', [])) !== 56n) fail('CHAIN_MISMATCH');
      const block = dataRecord(await rpc.call('eth_getBlockByNumber', ['latest', false])), blockHash = hexHash(block.hash), tag = { blockHash, requireCanonical: true };
      if (typeof block.timestamp !== 'string' || quantity(block.timestamp) * 1000n > BigInt(this.now()) + 5000n || BigInt(this.now()) - quantity(block.timestamp) * 1000n > 30000n) fail('RPC_STALE');
      for (const target of [stock, BSC_USDT.toLowerCase(), COW_SETTLEMENT, COW_RELAYER]) {
        const matches = this.options.pins.filter(pin => pin.address === target); if (matches.length !== 1) fail('CONTRACT_UNVERIFIED'); const pin = matches[0]!;
        if (bytecodeHash(await rpc.call('eth_getCode', [target, tag])) !== pin.codeHash) fail('CONTRACT_UNVERIFIED');
        const slot = await rpc.call('eth_getStorageAt', [target, implementationSlot, tag]);
        const beacon = await rpc.call('eth_getStorageAt', [target, beaconSlot, tag]);
        if (typeof beacon !== 'string' || !/^0x0{64}$/.test(beacon)) fail('CONTRACT_UNVERIFIED');
        if (typeof slot !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(slot)) fail('CONTRACT_UNVERIFIED');
        if (BigInt(slot) !== 0n) {
          if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(slot) || !pin.implementation || pin.implementation.address !== address('0x' + slot.slice(-40)) || bytecodeHash(await rpc.call('eth_getCode', [pin.implementation.address, tag])) !== pin.implementation.codeHash) fail('CONTRACT_UNVERIFIED');
        } else if (pin.implementation !== null) fail('CONTRACT_UNVERIFIED');
      }
      const code = await rpc.call('eth_getCode', [wallet, tag]); if (code !== '0x') fail('SMART_WALLET_UNSUPPORTED');
      const balance = await tokenValue(rpc, stock, wallet, tag), allowance = await tokenValue(rpc, stock, wallet, tag, COW_RELAYER);
      const decimals = encodeFunctionData({ abi: parseAbi(['function decimals() view returns (uint8)']), functionName: 'decimals' });
      const cashDecimals = await rpc.call('eth_call', [{ to: BSC_USDT.toLowerCase(), data: decimals }, tag]);
      if (typeof cashDecimals !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(cashDecimals) || BigInt(cashDecimals) !== 18n) fail('CASH_DECIMALS_UNVERIFIED');
      const stockDecimals = await rpc.call('eth_call', [{ to: stock, data: decimals }, tag]);
      if (typeof stockDecimals !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(stockDecimals) || BigInt(stockDecimals) !== BigInt(expectedStockDecimals)) fail('STOCK_DECIMALS_UNVERIFIED');
      return { balance, allowance };
    }));
    if (facts[0]!.balance !== facts[1]!.balance || facts[0]!.allowance !== facts[1]!.allowance) fail('RPC_DISAGREEMENT'); return facts[0]!;
  }
  private async fresh(record: ExecutionRecord, requireAllowance: boolean) {
    const now = this.now();
    if (now < record.lastAtMs || now >= record.auth.quoteExpiresAtMs || now >= record.auth.validTo * 1000) fail('ORDER_EXPIRED');
    const marketRead = await this.options.reader.get('/api/v1/dex/market/rwa/underlying-market', [['binanceChainId', '56'], ['tokenContractAddress', record.auth.stock]]);
    const market = selectedMarket(marketRead.data, record.auth.stock);
    if (marketRead.timestamp > this.now() || this.now() - marketRead.timestamp > 15000 || market.marketStatus === 'pause' || !market.openState && !record.intent.intent.allowClosedMarket || (market.marketStatus === 'closed') === market.openState) fail('MARKET_BLOCKED');
    const facts = await this.controls(record.auth.stock, record.auth.wallet, record.stockDecimals);
    if (BigInt(facts.balance) - BigInt(record.auth.totalDebitRaw) < BigInt(record.auth.floorRaw)) fail('FLOOR_BREACH');
    if (requireAllowance && BigInt(facts.allowance) < BigInt(record.auth.totalDebitRaw)) fail('APPROVAL_REQUIRED');
    const data = encodeFunctionData({ abi: parseAbi(['function filledAmount(bytes orderUid) view returns (uint256)']), functionName: 'filledAmount', args: [record.auth.orderUid] });
    for (const rpc of this.options.rpcs) {
      const value = await rpc.call('eth_call', [{ to: COW_SETTLEMENT, data }, 'latest']);
      if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value) || BigInt(value) !== 0n) fail('ORDER_ALREADY_USED');
    }
    if (this.now() >= record.auth.quoteExpiresAtMs) fail('ORDER_EXPIRED'); return facts;
  }
  async prepare(wallet: string, value: unknown) {
    const input = cashOrderInput(value); if (input.intent.wallet !== wallet || input.vendor !== 'CowSwap' || input.cashDecimals !== 18) fail('VENDOR_PROFILE_UNSUPPORTED');
    const bundle = await prepareCashCandidate(input, this.options.reader, AbortSignal.timeout(12000), this.now), rfq = dataRecord(bundle.build.rfq);
    if (rfq.vendor !== 'CowSwap') fail('VENDOR_PROFILE_UNSUPPORTED');
    const submissionQuoteId = identifier(rfq.orderId);
    const facts = await this.controls(input.intent.token, wallet, bundle.preview.position.stock.decimals);
    if (facts.balance !== bundle.preview.position.balanceRaw) fail('POSITION_CHANGED');
    const auth = authorizeCow({ typedData: rfq.typedDataToSign, wallet, stock: input.intent.token, expectedDebitRaw: input.amountRaw,
      balanceRaw: facts.balance, floorRaw: bundle.preview.floorRaw, targetRaw: bundle.preview.cashTargetRaw!, maximumFeeRaw: this.options.maximumStockFeeRaw,
      quoteAtMs: bundle.quoteAtMs, nowMs: this.now() });
    const record: ExecutionRecord = { id: randomUUID(), mode: this.options.mode, revision: 0, state: 'PREPARED', auth, intent: input,
      quoteId: submissionQuoteId, stockDecimals: bundle.preview.position.stock.decimals, stockSymbol: bundle.preview.position.stock.symbol,
      createdAtMs: this.now(), lastAtMs: this.now(), attempts: 0, signature: null, platformOrderId: null, txHash: null, result: null };
    const stored = this.options.store.create(record);
    return { ...projectOrder(stored), approval: BigInt(facts.allowance) >= BigInt(auth.totalDebitRaw) ? null : approval(auth, facts.allowance !== '0') };
  }
  get(wallet: string, id: string) { return projectOrder(this.options.store.get(id, wallet)); }
  receipt(wallet: string, id: string) {
    const r = this.options.store.get(id, wallet);
    return { kind: 'REMAIN_CHAIN_RECEIPT_V1', mode: r.mode, id: r.id, state: r.state, auth: r.auth, intent: r.intent,
      stockDecimals: r.stockDecimals, stockSymbol: r.stockSymbol, createdAtMs: r.createdAtMs, observedAtMs: r.lastAtMs, txHash: r.txHash, result: r.result,
      provenance: 'RPC_OBSERVATIONS_RECHECK_BEFORE_RELYING' };
  }
  async signing(wallet: string, id: string) {
    const r = this.options.store.get(id, wallet); if (r.state !== 'PREPARED') fail('STATE_CONFLICT');
    await this.fresh(r, true);
    // Persist potential signing before returning anything the browser can sign.
    // A lost browser response or rejected prompt cannot prove no signature escaped.
    if (!r.signaturePrompted) return projectOrder(this.options.store.change(id, wallet, r.revision, record => { record.signaturePrompted = true; record.lastAtMs = this.now(); }));
    return projectOrder(r);
  }
  async approve(wallet: string, id: string) {
    const r = this.options.store.get(id, wallet); if (r.state !== 'PREPARED') fail('STATE_CONFLICT');
    const facts = await this.fresh(r, false);
    return { ...projectOrder(r), approval: BigInt(facts.allowance) >= BigInt(r.auth.totalDebitRaw) ? null : approval(r.auth, facts.allowance !== '0') };
  }
  async sign(wallet: string, id: string, signature: unknown) {
    let r = this.options.store.get(id, wallet); if (r.state !== 'PREPARED') fail('STATE_CONFLICT');
    if (!r.signaturePrompted) r = this.options.store.change(id, wallet, r.revision, record => { record.signaturePrompted = true; record.lastAtMs = Math.max(record.lastAtMs, this.now()); });
    await this.fresh(r, true); const verified = await verifyOrderSignature(r.auth, signature);
    return projectOrder(this.options.store.change(id, wallet, r.revision, record => { record.signature = verified; record.state = 'SIGNED'; record.lastAtMs = this.now(); }));
  }
  async submit(wallet: string, id: string) {
    const r = this.options.store.get(id, wallet); if (r.state !== 'SIGNED' || !r.signature) fail('STATE_CONFLICT');
    await this.fresh(r, true);
    // Claim persists before crossing the network boundary. Reentrant or competing
    // workers cannot submit this order again, including after process restart.
    const claimed = this.options.store.change(id, wallet, r.revision, record => { record.state = 'SUBMITTING'; record.attempts++; record.lastAtMs = this.now(); });
    try {
      const observed = vendorObservation(await this.options.vendor.submit({ requestId: id, userSignature: r.signature, vendor: 'CowSwap', quoteId: r.quoteId }));
      return projectOrder(this.options.store.change(id, wallet, claimed.revision, record => applyObservation(record, observed, this.now())));
    } catch {
      const current = this.options.store.get(id, wallet);
      if (current.revision === claimed.revision) this.options.store.change(id, wallet, current.revision, record => { record.state = 'UNKNOWN'; record.lastAtMs = this.now(); });
      return this.get(wallet, id);
    }
  }
  async poll(wallet: string, id: string) {
    const r = this.options.store.get(id, wallet);
    if (r.state === 'PREPARED' || r.state === 'SIGNED' || r.state === 'FAILED' || r.state === 'CANCELLED' || r.state === 'INVALIDATED') return projectOrder(r);
    if (!r.platformOrderId) return projectOrder(r); // No guessed lookup or new UUID.
    if (!r.txHash) {
      const observation = vendorObservation(await this.options.vendor.status(r.platformOrderId));
      if (observation.orderId !== r.platformOrderId) fail('ORDER_ID_MISMATCH');
      return projectOrder(this.options.store.change(id, wallet, r.revision, record => applyObservation(record, observation, this.now())));
    }
    let result;
    try { result = await reconcileChain(this.options.rpcs, r.auth, r.txHash, this.options.mode === 'TEST_FIXTURE'); }
    catch (error) {
      // Withdraw an earlier observation even when the new read cannot produce a
      // receipt. A deep reorg must not leave durable success on display.
      this.options.store.change(id, wallet, r.revision, record => {
        record.result = null; record.state = 'INVALIDATED'; record.lastAtMs = this.now();
        if (r.state === 'RECONCILED') record.lockReleased = true;
      });
      throw error;
    }
    return projectOrder(this.options.store.change(id, wallet, r.revision, record => {
      record.result = result; record.state = result.status === 'RECONCILED' ? 'RECONCILED' : result.status === 'MISMATCH' ? 'INVALIDATED' : 'FILLED'; record.lastAtMs = this.now();
    }));
  }
  async recoverSettlement(wallet: string, id: string, txHash: string) {
    const r = this.options.store.get(id, wallet);
    if (!(r.state === 'PREPARED' && r.signaturePrompted) && !['SUBMITTING', 'UNKNOWN', 'PENDING', 'FILLED', 'FAILED', 'INVALIDATED', 'RECONCILED'].includes(r.state)) fail('STATE_CONFLICT');
    const hash = hexHash(txHash); if (r.txHash && r.txHash !== hash) fail('ORDER_ID_MISMATCH');
    const result = await reconcileChain(this.options.rpcs, r.auth, hash, this.options.mode === 'TEST_FIXTURE');
    // An arbitrary transaction hash cannot be attached to an unresolved order.
    if (result.status !== 'RECONCILED') fail('SETTLEMENT_NOT_CONFIRMED');
    return projectOrder(this.options.store.change(id, wallet, r.revision, record => { record.result = result; record.txHash = hash; record.state = 'RECONCILED'; record.lastAtMs = this.now(); }));
  }
  cancel(wallet: string, id: string) {
    const r = this.options.store.get(id, wallet);
    if (r.state === 'CANCELLED' || r.state === 'RECONCILED') fail('STATE_CONFLICT');
    if (r.state === 'PREPARED' && !r.signaturePrompted) return projectOrder(this.options.store.change(id, wallet, r.revision, record => { record.state = 'CANCELLED'; record.lastAtMs = this.now(); }));
    // A signed order may have escaped. Only on-chain invalidation or confirmed
    // expiry ends its authority. This payload is never broadcast by the server.
    return { ...projectOrder(r), cancellation: cancellation(r.auth) };
  }
  async invalidate(wallet: string, id: string, hash: string) {
    const r = this.options.store.get(id, wallet);
    if (!r.signature && !r.signaturePrompted || r.state === 'RECONCILED') fail('STATE_CONFLICT');
    const evidence = await confirmInvalidation(this.options.rpcs, r.auth, hash);
    // Invalidation can follow a fill. Keep the unresolved sale locked until its
    // settlement is reconciled. Revocation never proves absence of a prior fill.
    return projectOrder(this.options.store.change(id, wallet, r.revision, record => {
      record.state = 'INVALIDATED'; record.lastAtMs = this.now(); record.result = null; record.invalidationTxHash = evidence.txHash;
    }));
  }
}
function applyObservation(r: ExecutionRecord, value: ReturnType<typeof vendorObservation>, now: number) {
  if (now < r.lastAtMs || r.platformOrderId && r.platformOrderId !== value.orderId || r.txHash && r.txHash !== value.txHash || r.state === 'FILLED' && value.status !== 'FILLED' || r.state === 'PENDING' && value.status === 'PENDING_VENDOR' && r.txHash) fail('VENDOR_STATUS_INVALID');
  r.platformOrderId = value.orderId; r.txHash = value.txHash; r.state = value.status === 'FILLED' ? 'FILLED' : ['FAILED', 'EXPIRED', 'CANCELLED'].includes(value.status) ? 'FAILED' : 'PENDING'; r.lastAtMs = now;
}
export function projectOrder(r: ExecutionRecord) {
  return { kind: 'REMAIN_EXECUTION_ORDER', mode: r.mode, id: r.id, state: r.state, revision: r.revision,
    auth: { ...r.auth, typedData: r.state === 'PREPARED' ? r.auth.typedData : null }, txHash: r.txHash, result: r.result,
    recovery: r.state === 'UNKNOWN' || r.state === 'SUBMITTING' ? 'DO_NOT_REPEAT_SALE_INVESTIGATE_OR_INVALIDATE_ORDER' : null };
}
export function configuredEngine(env: Record<string, string | undefined>) {
  if (env.REMAIN_EXECUTION_ENABLED !== 'true') return undefined;
  if (env.REMAIN_COW_PROFILE_REVIEWED !== 'true') fail('VENDOR_REVIEW_REQUIRED');
  const required = ['BINANCE_WEB3_API_KEY', 'BINANCE_WEB3_SECRET_KEY', 'REMAIN_RPC_PRIMARY', 'REMAIN_RPC_SECONDARY', 'REMAIN_STORAGE_KEY', 'REMAIN_CONTRACT_PINS', 'REMAIN_MAXIMUM_STOCK_FEE_RAW'];
  if (required.some(key => !env[key]?.trim())) fail('EXECUTION_CONFIG_MISSING');
  uint(env.REMAIN_MAXIMUM_STOCK_FEE_RAW);
  const first = new URL(env.REMAIN_RPC_PRIMARY!), second = new URL(env.REMAIN_RPC_SECONDARY!);
  if (first.hostname === second.hostname) fail('INDEPENDENT_RPC_REQUIRED');
  const values: unknown = JSON.parse(env.REMAIN_CONTRACT_PINS!); if (!Array.isArray(values) || values.length < 4 || values.length > 32) fail('CONTRACT_UNVERIFIED');
  const pins = values.map(value => {
    const p = dataRecord(value); if (Object.keys(p).sort().join(',') !== 'address,codeHash,implementation' || typeof p.codeHash !== 'string' || !/^[a-f0-9]{64}$/.test(p.codeHash)) fail('CONTRACT_UNVERIFIED');
    let implementation: ContractPin['implementation'] = null;
    if (p.implementation !== null) { const i = dataRecord(p.implementation); if (Object.keys(i).sort().join(',') !== 'address,codeHash' || typeof i.codeHash !== 'string' || !/^[a-f0-9]{64}$/.test(i.codeHash)) fail('CONTRACT_UNVERIFIED'); implementation = { address: address(i.address), codeHash: i.codeHash }; }
    return { address: address(p.address), codeHash: p.codeHash, implementation };
  });
  const credentials = { apiKey: env.BINANCE_WEB3_API_KEY!, secretKey: env.BINANCE_WEB3_SECRET_KEY! };
  const store = new ExecutionStore(env.REMAIN_EXECUTION_DB ?? 'state/execution.sqlite', env.REMAIN_STORAGE_KEY!);
  const engine = new ExecutionEngine({ reader: new ReadOnlyBinanceClient(credentials), vendor: new BinanceExecutionVendor(credentials),
    rpcs: [new HttpRpc(first.href), new HttpRpc(second.href)], store, pins, maximumStockFeeRaw: env.REMAIN_MAXIMUM_STOCK_FEE_RAW!, mode: 'LIVE_EXECUTION' });
  return { engine, store };
}
