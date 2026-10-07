// Entirely fictional addresses, amounts and order. Never a vendor schema.
export const wallet = '0x1111111111111111111111111111111111111111';
export const token = '0x2222222222222222222222222222222222222222';
export const output = '0x55d398326f99059fF775485246999027B3197955';
export const config = { wallet, token, amount: '100' };
export function fixtureTyped() {
  return { domain: { chainId: 56, verifyingContract: token }, primaryType: 'Order', types: {
    EIP712Domain: [{ name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
    Order: [{ name: 'sell', type: 'Asset' }, { name: 'receiver', type: 'address' }, { name: 'flags', type: 'bool[2]' }],
    Asset: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }]
  }, message: { sell: { token, amount: '100' }, receiver: wallet, flags: [true, false] } };
}
export function fixtureQuote() {
  return { binanceChainId: '56', executionMode: 'RFQ', fromTokenAmount: '100', toTokenAmount: '25000000000000000000',
    quoteId: 'fixture-quote', vendorName: 'PcsXRfq', fromToken: { tokenContractAddress: token }, toToken: { tokenContractAddress: output } };
}
export function fixtureBuild() {
  return { executionMode: 'RFQ', routerResult: fixtureQuote(), tx: { from: wallet },
    rfq: { vendor: 'PcsXRfq', signingScheme: 'EIP712', typedDataToSign: fixtureTyped() } };
}
