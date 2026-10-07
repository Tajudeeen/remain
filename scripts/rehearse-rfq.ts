import assert from 'node:assert/strict';
import { reviewRfqBuild } from '../src/rfq/review.ts';
import { safeError } from '../src/errors.ts';
import { BSC_USDT } from '../src/validation.ts';

// Fictional data only. This sample is deliberately not a vendor order schema.
const token = '0x2222222222222222222222222222222222222222';
const wallet = '0x1111111111111111111111111111111111111111';
const quote = { binanceChainId: '56', executionMode: 'RFQ', fromTokenAmount: '100', toTokenAmount: '25',
  vendorName: 'PcsXRfq', fromToken: { tokenContractAddress: token }, toToken: { tokenContractAddress: BSC_USDT } };
const built = { executionMode: 'RFQ', routerResult: { ...quote }, rfq: { vendor: 'PcsXRfq', typedDataToSign: {
  domain: { chainId: 56, verifyingContract: token }, primaryType: 'FictionalOrder',
  types: { FictionalOrder: [{ name: 'sell', type: 'Asset' }], Asset: [{ name: 'amount', type: 'uint256' }] },
  message: { sell: { amount: '100' } }
} } };
const review = reviewRfqBuild(built, quote, { token, wallet, amount: '100' });
let routeTamperRejected = false; let valueTamperRejected = false;
try { reviewRfqBuild({ ...built, routerResult: { ...quote, fromTokenAmount: '101' } }, quote, { token, wallet, amount: '100' }); }
catch (error) { routeTamperRejected = safeError(error).validationCheck === 'RFQ_BUILD_BINDING'; }
built.rfq.typedDataToSign.message.sell.amount = 'invalid';
try { reviewRfqBuild(built, quote, { token, wallet, amount: '100' }); }
catch (error) { valueTamperRejected = safeError(error).code === 'RFQ_OPAQUE'; }
assert.ok(routeTamperRejected && valueTamperRejected);
console.log(JSON.stringify({ mode: 'TEST_FIXTURE', executionEnabled: false, liveGate: 'BLOCKED', review,
  checks: { routeTamperRejected, valueTamperRejected } }, null, 2));
