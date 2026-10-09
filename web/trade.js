import { activeWalletProvider } from './wallet-providers.js';
import { readReadOnlyJSON } from './response.js';
import { validatePreview, previewInput, cashTargetRaw, qualifiesPreview } from './preview.js';
import { orderReviewInput } from './order-review.js';
import { formatPositionUnits } from './position.js';

const settlement = '0x9008d19f58aabd9ed0d60971565aa8510560ab41';
const relayer = '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110';
const usdt = '0x55d398326f99059ff775485246999027b3197955';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const states = new Set(['PREPARED', 'SIGNED', 'SUBMITTING', 'UNKNOWN', 'PENDING', 'FILLED', 'FAILED', 'CANCELLED', 'RECONCILED', 'INVALIDATED']);
const fields = [['sellToken', 'address'], ['buyToken', 'address'], ['receiver', 'address'], ['sellAmount', 'uint256'], ['buyAmount', 'uint256'], ['validTo', 'uint32'], ['appData', 'bytes32'], ['feeAmount', 'uint256'], ['kind', 'string'], ['partiallyFillable', 'bool'], ['sellTokenBalance', 'string'], ['buyTokenBalance', 'string']].map(([name, type]) => ({ name, type }));
function fail(code = 'INVALID_ORDER_RESPONSE') { const error = new Error(code); error.code = code; throw error; }
function raw(value, positive = false) { if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= 2n ** 256n || positive && value === '0') fail(); return value; }
function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail(); return value; }
export function executionCandidate(preview, now = Date.now()) {
  const p = validatePreview(preview, preview.input, now); let best;
  p.probes.forEach(probe => probe.routes.forEach(route => {
    if (route.vendor === 'CowSwap' && qualifiesPreview(route, p.input, p.cashTargetRaw) && (!best || BigInt(probe.inputRaw) < BigInt(best.amountRaw))) best = {
      intent: p.input, amountRaw: probe.inputRaw, vendor: 'CowSwap', expectedOutputRaw: route.estimatedOutputRaw, cashDecimals: p.cashDecimals
    };
  }));
  if (!best) fail('NO_SUPPORTED_COW_CANDIDATE');
  return Object.freeze({ input: orderReviewInput(best), floorRaw: p.floorRaw, balanceRaw: p.position.balanceRaw, stockDecimals: p.position.stock.decimals, stockSymbol: p.position.stock.symbol });
}
export function validateTradeOrder(value, selection, now = Date.now(), signing = false) {
  const keys = ['kind', 'mode', 'id', 'state', 'revision', 'auth', 'txHash', 'result', 'recovery'];
  const v = exact(value, [...keys, ...['approval', 'cancellation'].filter(k => Object.hasOwn(value ?? {}, k))]);
  if (v.kind !== 'REMAIN_EXECUTION_ORDER' || !['LIVE_EXECUTION', 'TEST_FIXTURE'].includes(v.mode) || !uuid.test(v.id) || !states.has(v.state) || !Number.isSafeInteger(v.revision) || v.revision < 0) fail();
  const a = exact(v.auth, ['profile', 'wallet', 'stock', 'spender', 'totalDebitRaw', 'stockFeeRaw', 'minimumCashRaw', 'cashTargetRaw', 'floorRaw', 'balanceRaw', 'validTo', 'quoteExpiresAtMs', 'orderDigest', 'orderUid', 'typedData', 'checksum']);
  if (a.profile !== 'COW_BSC_SELL_V1' || a.wallet !== selection.input.intent.wallet || a.stock !== selection.input.intent.token || a.spender !== relayer ||
    raw(a.totalDebitRaw, true) !== selection.input.amountRaw || raw(a.balanceRaw, true) !== selection.balanceRaw || raw(a.floorRaw) !== selection.floorRaw ||
    BigInt(a.balanceRaw) - BigInt(a.totalDebitRaw) < BigInt(a.floorRaw) || raw(a.cashTargetRaw, true) !== cashTargetRaw(selection.input.intent.cashTarget, 18) ||
    BigInt(raw(a.minimumCashRaw, true)) < BigInt(a.cashTargetRaw) || BigInt(raw(a.stockFeeRaw)) >= BigInt(a.totalDebitRaw) ||
    !Number.isSafeInteger(a.validTo) || a.validTo < 1 || a.validTo > 0xffffffff || !Number.isSafeInteger(a.quoteExpiresAtMs) ||
    !/^0x[0-9a-f]{64}$/.test(a.orderDigest) || !/^[0-9a-f]{64}$/.test(a.checksum) || a.orderUid !== a.orderDigest + a.wallet.slice(2) + a.validTo.toString(16).padStart(8, '0') ||
    v.txHash !== null && !/^0x[0-9a-f]{64}$/.test(v.txHash) || v.recovery !== null && v.recovery !== 'DO_NOT_REPEAT_SALE_INVESTIGATE_OR_INVALIDATE_ORDER') fail();
  if (signing) {
    if (v.mode !== 'LIVE_EXECUTION' || v.state !== 'PREPARED') fail('FIXTURE_CANNOT_REQUEST_WALLET');
    if (now >= a.quoteExpiresAtMs || a.quoteExpiresAtMs > now + 30000 || a.validTo * 1000 <= now + 5000 || a.validTo * 1000 > now + 1800000) fail('ORDER_EXPIRED');
    const t = exact(a.typedData, ['domain', 'types', 'primaryType', 'message']), d = exact(t.domain, ['name', 'version', 'chainId', 'verifyingContract']);
    if (t.primaryType !== 'Order' || d.name !== 'Gnosis Protocol' || d.version !== 'v2' || ![56, '56', '0x38'].includes(d.chainId) || d.verifyingContract.toLowerCase() !== settlement ||
      Object.keys(t.types).some(k => !['Order', 'EIP712Domain'].includes(k)) || JSON.stringify(t.types.Order) !== JSON.stringify(fields)) fail();
    const m = exact(t.message, fields.map(f => f.name));
    if (m.sellToken.toLowerCase() !== a.stock || m.buyToken.toLowerCase() !== usdt || m.receiver.toLowerCase() !== a.wallet ||
      BigInt(raw(m.sellAmount, true)) + BigInt(raw(m.feeAmount)) !== BigInt(a.totalDebitRaw) || m.feeAmount !== a.stockFeeRaw || m.buyAmount !== a.minimumCashRaw ||
      Number(m.validTo) !== a.validTo || m.appData !== '0x' + '0'.repeat(64) || m.kind !== 'sell' || m.partiallyFillable !== false || m.sellTokenBalance !== 'erc20' || m.buyTokenBalance !== 'erc20') fail();
  }
  if (v.result !== null) {
    const result = exact(v.result, ['mode', 'status', 'txHash', 'blockHash', 'confirmations', 'stockDebitRaw', 'cashReceivedRaw', 'remainingStockRaw', 'reasons', 'checksum', 'trust']);
    if (result.mode !== (v.mode === 'TEST_FIXTURE' ? 'TEST_FIXTURE' : 'LIVE_RPC_OBSERVATION') || !['WAITING', 'MISMATCH', 'RECONCILED'].includes(result.status) || result.txHash !== v.txHash ||
      result.blockHash !== null && !/^0x[0-9a-f]{64}$/.test(result.blockHash) || !Number.isSafeInteger(result.confirmations) || result.confirmations < 0 || result.confirmations > 1000000 ||
      result.trust !== 'TWO_RPC_AGREEMENT_NOT_CONSENSUS_PROOF' || !/^[0-9a-f]{64}$/.test(result.checksum) || !Array.isArray(result.reasons) || result.reasons.length > 16 || result.reasons.some(r => typeof r !== 'string' || !/^[A-Z_]{1,64}$/.test(r))) fail();
    if (result.status === 'RECONCILED' && (result.confirmations < 12 || result.reasons.length || result.stockDebitRaw !== a.totalDebitRaw || BigInt(raw(result.cashReceivedRaw, true)) < BigInt(a.minimumCashRaw) || BigInt(raw(result.remainingStockRaw)) < BigInt(a.floorRaw) || v.state !== 'RECONCILED')) fail();
  } else if (v.state === 'RECONCILED') fail();
  return structuredClone(v);
}
export function validateWalletTransaction(transaction, order, invalidate = false) {
  const tx = exact(transaction, ['from', 'to', 'chainId', 'value', 'data']), a = order.auth;
  if (tx.from !== a.wallet || tx.chainId !== '0x38' || tx.value !== '0x0') fail('INVALID_WALLET_TRANSACTION');
  if (invalidate) {
    // invalidateOrder(bytes): selector + offset + length + padded UID.
    if (tx.to !== settlement || !tx.data.startsWith('0x15337bc0') || tx.data.slice(10) !== '20'.padStart(64, '0') + '38'.padStart(64, '0') + a.orderUid.slice(2).padEnd(128, '0')) fail('INVALID_WALLET_TRANSACTION');
  } else {
    const prefix = '0x095ea7b3' + relayer.slice(2).padStart(64, '0'), data = prefix + BigInt(a.totalDebitRaw).toString(16).padStart(64, '0');
    if (tx.to !== a.stock || ![data, prefix + '0'.repeat(64)].includes(tx.data)) fail('INVALID_WALLET_TRANSACTION');
  }
  return tx;
}

if (typeof document !== 'undefined' && document.getElementById('trade-view')) {
  const $ = id => document.getElementById(id);
  let selection, order, token, provider, wallet, listenedProvider, available = false, busy = false, version = 0;
  const message = text => { $('trade-message').textContent = text; };
  function update() {
    $('trade-login').disabled = !available || busy;
    $('trade-prepare').disabled = !available || !token || !selection || busy;
    $('trade-approve').disabled = busy || !token || order?.state !== 'PREPARED' || !order.approval || order.mode !== 'LIVE_EXECUTION';
    $('trade-sign').disabled = busy || !token || order?.state !== 'PREPARED' || order.mode !== 'LIVE_EXECUTION';
    $('trade-submit').disabled = busy || !token || order?.state !== 'SIGNED' || order.mode !== 'LIVE_EXECUTION';
    for (const id of ['trade-poll', 'trade-cancel', 'trade-download']) $(id).disabled = busy || !token || !order;
    $('trade-cancel').disabled ||= ['CANCELLED', 'RECONCILED'].includes(order?.state);
    $('trade-recover').disabled = busy || !token || !order;
    $('trade-invalidate').disabled = busy || !token || !order || ['CANCELLED', 'RECONCILED'].includes(order.state);
    $('trade-load').disabled = busy || !token;
    const active = order && !['CANCELLED', 'RECONCILED'].includes(order.state);
    $('trade-preview').disabled = busy || !token || active;
    for (const id of ['trade-stock', 'trade-target', 'trade-retain', 'trade-closed']) $(id).disabled = busy || active;
  }
  function render(value) {
    order = value;
    $('trade-result').hidden = false; $('trade-state').textContent = order.mode === 'TEST_FIXTURE' ? 'TEST_FIXTURE / ' + order.state : order.state;
    $('trade-debit').textContent = formatPositionUnits(order.auth.totalDebitRaw, selection.stockDecimals) + ' ' + selection.stockSymbol;
    $('trade-cash').textContent = formatPositionUnits(order.auth.minimumCashRaw, 18) + ' USDT minimum';
    $('trade-remain').textContent = formatPositionUnits((BigInt(order.auth.balanceRaw) - BigInt(order.auth.totalDebitRaw)).toString(), selection.stockDecimals) + ' ' + selection.stockSymbol;
    $('trade-fee').textContent = formatPositionUnits(order.auth.stockFeeRaw, selection.stockDecimals) + ' ' + selection.stockSymbol + ' included in debit';
    $('trade-order-id').textContent = order.id; $('trade-hash').textContent = order.auth.orderDigest;
    $('trade-receipt').textContent = order.result ? `${order.result.status}. ${order.result.confirmations} confirmations. ${order.result.reasons.join(', ')}` : 'Settlement has not been independently observed.';
    const reconciled = order.state === 'RECONCILED' && order.result?.status === 'RECONCILED';
    $('trade-settled-facts').hidden = !reconciled;
    $('trade-actual-cash').textContent = reconciled ? formatPositionUnits(order.result.cashReceivedRaw, 18) + ' USDT' : '';
    $('trade-actual-stock').textContent = reconciled ? formatPositionUnits(order.result.remainingStockRaw, selection.stockDecimals) + ' ' + selection.stockSymbol : '';
    if (order.recovery) message('Submission outcome unknown. Keep this order ID. Check status or reconcile its settlement hash. Don’t create another sale.');
    if (order.state === 'INVALIDATED') message('This sale needs investigation. A previous receipt may have been withdrawn. Invalidation can race a fill. Reconcile the original settlement before starting another sale.');
    update();
  }
  async function api(action, body) {
    const signal = AbortSignal.timeout(45000), headers = { 'Content-Type': 'application/json' }; if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch('/api/execution/' + action, { method: 'POST', headers, body: JSON.stringify(body), signal, cache: 'no-store', redirect: 'error', credentials: 'omit' });
    const result = await readReadOnlyJSON(response, signal);
    if (!response.ok) fail(typeof result?.code === 'string' && /^[A-Z_]{1,64}$/.test(result.code) ? result.code : 'EXECUTION_REQUEST_BLOCKED'); return result;
  }
  async function accountCheck() {
    if (!provider || BigInt(await walletRequest({ method: 'eth_chainId' })) !== 56n) fail('WALLET_CHANGED');
    const accounts = await walletRequest({ method: 'eth_accounts' }); if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== wallet) fail('WALLET_CHANGED');
  }
  function walletRequest(request) {
    const selected = provider;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { const error = new Error('WALLET_TIMEOUT'); error.code = 'WALLET_TIMEOUT'; reject(error); }, 90000);
      Promise.resolve().then(() => selected.request(request)).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }
  function clearSession() { version++; token = undefined; wallet = undefined; order = undefined; $('trade-result').hidden = true; $('trade-settled-facts').hidden = true; $('trade-actual-cash').textContent = ''; $('trade-actual-stock').textContent = ''; $('trade-receipt').textContent = 'No sale has been reconciled.'; message('Wallet or page changed. Sign in again to recover an existing order.'); update(); }
  async function run(action) {
    if (busy) return; busy = true; update(); const current = version;
    try { await action(current); } catch (error) { if (current === version) message(`${error.code ?? 'REQUEST_FAILED'}. Check status before repeating any wallet action. Signing and submission are separate steps.`); }
    finally { busy = false; update(); }
  }
  window.addEventListener('remain-cash-selection', event => {
    clearSession(); location.hash = '#trade';
    try { selection = executionCandidate(event.detail); $('trade-selection').textContent = `Cash target ${selection.input.intent.cashTarget} USDT. Keep at least ${formatPositionUnits(selection.floorRaw, selection.stockDecimals)} ${selection.stockSymbol}. CoW candidate selected.`; message('Sign in to review the exact debit and minimum payout. No sale has been signed.'); }
    catch { selection = undefined; message('No fresh supported CoW candidate. Return to the cash target and request a fresh preview. Other vendors still need reviewed signing profiles.'); } update();
  });
  window.addEventListener('hashchange', () => { if (location.hash !== '#trade') clearSession(); });
  $('trade-login').addEventListener('click', () => run(async current => {
    provider = activeWalletProvider(); if (!provider?.request) fail('WALLET_UNAVAILABLE');
    const accounts = await walletRequest({ method: 'eth_requestAccounts' }); wallet = accounts?.[0]?.toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(wallet ?? '')) fail('WALLET_UNAVAILABLE'); await accountCheck();
    if (selection && wallet !== selection.input.intent.wallet) fail('WALLET_CHANGED');
    const challenge = await api('challenge', { wallet });
    if (challenge.domain?.name !== 'Remain Session' || challenge.domain.version !== '1' || challenge.domain.chainId !== 56 || challenge.primaryType !== 'Session' ||
      challenge.message?.wallet !== wallet || challenge.message.origin !== location.origin || !uuid.test(challenge.message.nonce) || challenge.message.expiresAt <= Date.now() || challenge.message.expiresAt > Date.now() + 60000 ||
      challenge.message.purpose !== 'Sign in to Remain. This authorizes no token transfer or order.') fail('INVALID_LOGIN_CHALLENGE');
    exact(challenge, ['domain', 'types', 'primaryType', 'message']); exact(challenge.domain, ['name', 'version', 'chainId']); exact(challenge.types, ['Session']);
    exact(challenge.message, ['wallet', 'origin', 'nonce', 'expiresAt', 'purpose']);
    if (JSON.stringify(challenge.types.Session) !== JSON.stringify([['wallet', 'address'], ['origin', 'string'], ['nonce', 'string'], ['expiresAt', 'uint256'], ['purpose', 'string']].map(([name, type]) => ({ name, type })))) fail('INVALID_LOGIN_CHALLENGE');
    const signature = await walletRequest({ method: 'eth_signTypedData_v4', params: [wallet, JSON.stringify(challenge)] }); await accountCheck(); if (current !== version) return;
    const result = await api('login', { nonce: challenge.message.nonce, signature }); if (current !== version) return;
    if (typeof result.token !== 'string' || result.token.length > 1024) fail('INVALID_SESSION'); token = result.token; message('Signed in. Review the sale before approving or signing an order.');
    if (provider.on && provider.removeListener && listenedProvider !== provider) {
      if (listenedProvider) for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) listenedProvider.removeListener(event, clearSession);
      for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) provider.on(event, clearSession);
      listenedProvider = provider;
    }
  }));
  $('trade-prepare').addEventListener('click', () => run(async current => {
    await accountCheck(); if (!selection) fail('CANDIDATE_REQUIRED');
    const result = await api('prepare', selection.input); if (current !== version) return;
    render(validateTradeOrder(result, selection)); message(order.approval ? 'Approve the exact stock allowance, then refresh the cash candidate before signing.' : 'Review the debit, fee and minimum payout. Signing creates an order authorization.');
  }));
  $('trade-preview').addEventListener('click', () => run(async current => {
    await accountCheck();
    const input = previewInput({ wallet, token: $('trade-stock').value.trim().toLowerCase(), cashTarget: $('trade-target').value.trim(), retainBps: Number($('trade-retain').value) * 100, maxImpactBps: 50, allowClosedMarket: $('trade-closed').checked });
    const result = await api('preview', input); if (current !== version) return;
    const preview = validatePreview(result, input, Date.now()); selection = executionCandidate(preview); order = undefined; $('trade-result').hidden = true;
    $('trade-selection').textContent = `Target ${input.cashTarget} USDT. CoW candidate: ${formatPositionUnits(selection.input.amountRaw, selection.stockDecimals)} ${selection.stockSymbol}. Keep at least ${formatPositionUnits(selection.floorRaw, selection.stockDecimals)} ${selection.stockSymbol}.`;
    message('Candidate is an estimate. Review the signed minimum payout before any approval or order signature.');
  }));
  for (const id of ['trade-stock', 'trade-target', 'trade-retain', 'trade-closed']) $(id).addEventListener('input', () => {
    if (!order || ['CANCELLED', 'RECONCILED'].includes(order.state)) { selection = undefined; $('trade-selection').textContent = 'Cash intent changed. Find a fresh candidate.'; update(); }
  });
  $('trade-approve').addEventListener('click', () => run(async current => {
    await accountCheck(); const result = validateTradeOrder(await api('approve', { id: order.id }), selection); if (current !== version) return;
    if (!result.approval) { render(result); message('Allowance observed. Refresh the candidate before signing.'); return; }
    const transaction = validateWalletTransaction(result.approval, result);
    const hash = await walletRequest({ method: 'eth_sendTransaction', params: [transaction] }); if (current !== version) return;
    message(`Approval requested: ${hash}. Wait for confirmation, discard this unsigned draft and refresh the cash candidate.`);
  }));
  $('trade-sign').addEventListener('click', () => run(async current => {
    await accountCheck(); const fresh = validateTradeOrder(await api('signing', { id: order.id }), selection, Date.now(), true); if (current !== version) return;
    const signature = await walletRequest({ method: 'eth_signTypedData_v4', params: [wallet, JSON.stringify(fresh.auth.typedData)] }); await accountCheck(); if (current !== version) return;
    const result = await api('sign', { id: fresh.id, signature }); if (current !== version) return;
    render(validateTradeOrder(result, selection)); message('Order signed and stored privately. Review again, then submit once.');
  }));
  $('trade-submit').addEventListener('click', () => run(async current => {
    await accountCheck(); const id = order.id; message('Submitting this order once. Keep the order ID if the connection drops.');
    order = { ...order, state: 'SUBMITTING', recovery: 'DO_NOT_REPEAT_SALE_INVESTIGATE_OR_INVALIDATE_ORDER' }; render(order);
    const result = await api('submit', { id }); if (current !== version) return; render(validateTradeOrder(result, selection));
    if (!order.recovery) message('Submission observed. Check settlement until the chain receipt is reconciled.');
  }));
  $('trade-poll').addEventListener('click', () => run(async current => {
    const id = order?.id ?? $('trade-recovery-id').value.trim();
    // Remove prior success while its canonical chain observations are rechecked.
    if (order?.state === 'RECONCILED') { order = { ...order, state: 'INVALIDATED', result: null }; render(order); }
    const result = await api('poll', { id }); if (current !== version) return; render(validateTradeOrder(result, selection));
  }));
  $('trade-cancel').addEventListener('click', () => run(async current => {
    await accountCheck(); const result = validateTradeOrder(await api('cancel', { id: order.id }), selection); if (current !== version) return;
    if (result.cancellation) {
      const hash = await walletRequest({ method: 'eth_sendTransaction', params: [validateWalletTransaction(result.cancellation, result, true)] }); if (current !== version) return;
      $('trade-invalidation-hash').value = hash;
      message(`Invalidation requested: ${hash}. It can race settlement. Cancellation is unconfirmed until observed on-chain.`);
    } else { render(result); message('Unsigned draft discarded. You can explore a fresh cash candidate.'); }
  }));
  $('trade-invalidate').addEventListener('click', () => run(async current => {
    const result = await api('invalidate', { id: order.id, txHash: $('trade-invalidation-hash').value.trim() }); if (current !== version) return;
    render(validateTradeOrder(result, selection)); message('Invalidation confirmed by two RPC observations. It does not rule out an earlier fill. The original sale stays locked for settlement review.');
  }));
  $('trade-recover').addEventListener('click', () => run(async current => {
    const result = await api('recover', { id: order.id, txHash: $('trade-settlement-hash').value.trim() }); if (current !== version) return; render(validateTradeOrder(result, selection));
  }));
  $('trade-load').addEventListener('click', () => run(async current => {
    const id = $('trade-recovery-id').value.trim(); if (!uuid.test(id)) fail('ORDER_ID_REQUIRED');
    const receipt = await api('receipt', { id }); if (current !== version) return;
    if (receipt.kind !== 'REMAIN_CHAIN_RECEIPT_V1' || receipt.id !== id || !Number.isInteger(receipt.stockDecimals) || receipt.stockDecimals < 0 || receipt.stockDecimals > 36 || typeof receipt.stockSymbol !== 'string' || receipt.stockSymbol.length > 64) fail();
    const input = orderReviewInput(receipt.intent); if (input.intent.wallet !== wallet) fail('WALLET_CHANGED');
    selection = { input, floorRaw: raw(receipt.auth.floorRaw), balanceRaw: raw(receipt.auth.balanceRaw, true), stockDecimals: receipt.stockDecimals, stockSymbol: receipt.stockSymbol };
    const result = await api('get', { id }); if (current !== version) return;
    render(validateTradeOrder(result, selection)); message('Original order loaded. Check its status before starting any new sale.');
  }));
  $('trade-download').addEventListener('click', () => run(async current => {
    const result = await api('receipt', { id: order.id }); if (current !== version) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = 'remain-chain-receipt.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); message('Private receipt downloaded. It contains your wallet and order amounts. Recheck its chain observations before relying on it.');
  }));
  fetch('/api/execution/status', { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(5000) }).then(async response => {
    const s = await readReadOnlyJSON(response, AbortSignal.timeout(5000));
    if (!response.ok || !exact(s, ['kind', 'available', 'profile', 'userConfirmationRequired']) || s.kind !== 'REMAIN_EXECUTION_STATUS' ||
      typeof s.available !== 'boolean' || s.profile !== 'COW_BSC_SELL_V1' || s.userConfirmationRequired !== true) fail();
    available = s.available; $('trade-server').textContent = available ? 'Execution backend configured' : 'Trading service not configured';
    $('trade-server-copy').textContent = available
      ? 'Wallet authentication, current supported holdings, price bounds, approvals and chain reconciliation are still required for every sale.'
      : 'The execution backend is not active on this deployment. No signed orders can be submitted here.';
    update();
  }).catch(() => { $('trade-server').textContent = 'Trading service unavailable'; $('trade-server-copy').textContent = 'Cannot verify the execution backend. No trade availability is assumed.'; update(); });
  update();
}
