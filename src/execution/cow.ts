import { hashTypedData, recoverTypedDataAddress, encodeFunctionData, parseAbi, type Hex } from 'viem';
import { address, BSC_USDT, uint } from '../validation.ts';
import { canonicalChecksum, canonicalJSON } from '../receipts/canonical.ts';
import { snapshotRfq } from '../rfq/json.ts';
import { reviewTypedData } from '../rfq/typed-data.ts';
import { dataRecord } from '../input/data.ts';

export const COW_SETTLEMENT = '0x9008d19f58aabd9ed0d60971565aa8510560ab41';
export const COW_RELAYER = '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110';
export class ExecutionError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'ExecutionError'; this.code = code; }
}
export function fail(code: string): never { throw new ExecutionError(code); }
export function exactData(value: unknown, keys: readonly string[]) {
  const r = dataRecord(value);
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) fail('INVALID_EXECUTION_INPUT');
  return r;
}
export const cowFields = Object.freeze([
  ['sellToken', 'address'], ['buyToken', 'address'], ['receiver', 'address'], ['sellAmount', 'uint256'],
  ['buyAmount', 'uint256'], ['validTo', 'uint32'], ['appData', 'bytes32'], ['feeAmount', 'uint256'],
  ['kind', 'string'], ['partiallyFillable', 'bool'], ['sellTokenBalance', 'string'], ['buyTokenBalance', 'string']
].map(([name, type]) => Object.freeze({ name: name!, type: type! })));
export const cowDomainFields = Object.freeze([['name', 'string'], ['version', 'string'], ['chainId', 'uint256'], ['verifyingContract', 'address']].map(([name, type]) => Object.freeze({ name: name!, type: type! })));
export type CashAuthorization = Readonly<{
  profile: 'COW_BSC_SELL_V1'; wallet: string; stock: string; spender: string;
  totalDebitRaw: string; stockFeeRaw: string; minimumCashRaw: string; cashTargetRaw: string;
  floorRaw: string; balanceRaw: string; validTo: number; quoteExpiresAtMs: number;
  orderDigest: Hex; orderUid: Hex; typedData: Parameters<typeof hashTypedData>[0]; checksum: string;
}>;
export function authorizeCow(input: {
  typedData: unknown; wallet: string; stock: string; expectedDebitRaw: string; balanceRaw: string;
  floorRaw: string; targetRaw: string; maximumFeeRaw: string; quoteAtMs: number; nowMs: number;
}): CashAuthorization {
  try {
    const t = snapshotRfq(input.typedData); reviewTypedData(t);
    const root = exactData(t, ['domain', 'types', 'primaryType', 'message']);
    const domain = exactData(root.domain, ['name', 'version', 'chainId', 'verifyingContract']);
    const types = dataRecord(root.types), m = exactData(root.message, cowFields.map(f => f.name));
    if (root.primaryType !== 'Order' || Object.keys(types).some(k => !['Order', 'EIP712Domain'].includes(k)) ||
      canonicalJSON(types.Order) !== canonicalJSON(cowFields) || types.EIP712Domain !== undefined && canonicalJSON(types.EIP712Domain) !== canonicalJSON(cowDomainFields) ||
      domain.name !== 'Gnosis Protocol' || domain.version !== 'v2' || ![56, '56', '0x38'].includes(domain.chainId as string | number) || address(domain.verifyingContract) !== COW_SETTLEMENT ||
      address(m.sellToken) !== address(input.stock) || address(m.buyToken) !== BSC_USDT.toLowerCase() || address(m.receiver) !== address(input.wallet) ||
      m.kind !== 'sell' || m.partiallyFillable !== false || m.sellTokenBalance !== 'erc20' || m.buyTokenBalance !== 'erc20' || m.appData !== '0x' + '0'.repeat(64)) fail('VENDOR_PROFILE_UNSUPPORTED');
    const sell = BigInt(uint(m.sellAmount, true)), fee = BigInt(uint(m.feeAmount)), buy = uint(m.buyAmount, true);
    const debit = uint((sell + fee).toString(), true), balance = uint(input.balanceRaw, true), floor = uint(input.floorRaw), target = uint(input.targetRaw, true);
    if (debit !== uint(input.expectedDebitRaw, true) || fee > BigInt(uint(input.maximumFeeRaw)) || BigInt(balance) - BigInt(debit) < BigInt(floor) || BigInt(buy) < BigInt(target)) fail('ECONOMIC_BINDING_FAILED');
    const validTo = typeof m.validTo === 'number' ? m.validTo : typeof m.validTo === 'string' && /^(0|[1-9][0-9]*)$/.test(m.validTo) ? Number(m.validTo) : NaN;
    if (!Number.isSafeInteger(input.nowMs) || !Number.isSafeInteger(input.quoteAtMs) || input.quoteAtMs > input.nowMs || input.nowMs - input.quoteAtMs >= 30000 ||
      !Number.isSafeInteger(validTo) || validTo > 0xffffffff || validTo * 1000 <= input.nowMs + 5000 || validTo * 1000 > input.nowMs + 1800000) fail('ORDER_EXPIRED');
    const typedData = t as Parameters<typeof hashTypedData>[0], orderDigest = hashTypedData(typedData);
    const orderUid = (orderDigest + address(input.wallet).slice(2) + validTo.toString(16).padStart(8, '0')) as Hex;
    const result = { profile: 'COW_BSC_SELL_V1' as const, wallet: address(input.wallet), stock: address(input.stock), spender: COW_RELAYER,
      totalDebitRaw: debit, stockFeeRaw: fee.toString(), minimumCashRaw: buy, cashTargetRaw: target, floorRaw: floor, balanceRaw: balance,
      validTo, quoteExpiresAtMs: input.quoteAtMs + 30000, orderDigest, orderUid, typedData };
    return Object.freeze({ ...result, checksum: canonicalChecksum(result) });
  } catch (error) { if (error instanceof ExecutionError) throw error; fail('VENDOR_PROFILE_UNSUPPORTED'); }
}
export async function verifyOrderSignature(auth: CashAuthorization, signature: unknown): Promise<Hex> {
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) fail('SIGNATURE_INVALID');
  try {
    if ((await recoverTypedDataAddress({ ...auth.typedData, signature: signature as Hex })).toLowerCase() !== auth.wallet) fail('SIGNATURE_INVALID');
  } catch { fail('SIGNATURE_INVALID'); }
  return signature as Hex;
}
export function approval(auth: CashAuthorization, reset = false) {
  return { from: auth.wallet, to: auth.stock, chainId: '0x38', value: '0x0',
    data: encodeFunctionData({ abi: parseAbi(['function approve(address spender,uint256 amount) returns (bool)']), functionName: 'approve', args: [COW_RELAYER, reset ? 0n : BigInt(auth.totalDebitRaw)] }) };
}
export function cancellation(auth: CashAuthorization) {
  return { from: auth.wallet, to: COW_SETTLEMENT, chainId: '0x38', value: '0x0', data: encodeFunctionData({ abi: parseAbi(['function invalidateOrder(bytes orderUid)']), functionName: 'invalidateOrder', args: [auth.orderUid] }) };
}
