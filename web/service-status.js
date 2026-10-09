// Live deployment capabilities. These checks describe configured services,
// not market prices, user holdings, or completed trades.
export function serviceSnapshot(market, execution) {
  const validMarket = market && typeof market === 'object' && !Array.isArray(market) &&
    Object.keys(market).sort().join() === 'deployment,executionEnabled,inspectionAvailable,kind,liveGate,mode,signatureSemantics' &&
    market.kind === 'REMAIN_INTEGRATION_READINESS' && market.mode === 'READ_ONLY_SETUP' &&
    typeof market.inspectionAvailable === 'boolean' &&
    (market.inspectionAvailable ? ['LOCAL_ONLY','HOSTED_READ_ONLY'].includes(market.deployment) : market.deployment === 'NOT_CONFIGURED') &&
    market.executionEnabled === false && market.liveGate === 'UNVERIFIED' && market.signatureSemantics === 'UNVERIFIED';
  const validExecution = execution && typeof execution === 'object' && !Array.isArray(execution) &&
    Object.keys(execution).sort().join() === 'available,kind,profile,userConfirmationRequired' &&
    execution.kind === 'REMAIN_EXECUTION_STATUS' && typeof execution.available === 'boolean' &&
    execution.profile === 'COW_BSC_SELL_V1' && execution.userConfirmationRequired === true;
  if (!validMarket || !validExecution) throw Error('UNTRUSTED_STATUS');
  return Object.freeze({
    market: market.inspectionAvailable ? 'CONFIGURED' : 'UNAVAILABLE',
    execution: execution.available ? 'CONFIGURED' : 'UNAVAILABLE',
    marketLabel: market.inspectionAvailable ? 'Provider read access configured' : 'Market service unavailable',
    executionLabel: execution.available ? 'Execution backend configured' : 'Trade execution unavailable'
  });
}
async function statusJSON(endpoint, signal) {
  const res = await fetch(endpoint, {signal,credentials:'omit',cache:'no-store',redirect:'error'});
  if (!res.ok || !/^application\/json(?:\s*;|$)/i.test(res.headers.get('content-type') ?? '')) throw Error('STATUS_UNAVAILABLE');
  const length = Number(res.headers.get('content-length') || '0');
  if (!Number.isSafeInteger(length) || length > 2048) throw Error('STATUS_UNAVAILABLE');
  const payload = await res.text();
  if (payload.length > 2048) throw Error('STATUS_UNAVAILABLE');
  return JSON.parse(payload);
}
if (typeof document !== 'undefined' && document.getElementById('status-market')) {
  const market = document.getElementById('status-market');
  const execution = document.getElementById('status-execution');
  const detail = document.getElementById('status-detail');
  const footer = document.getElementById('footer-live-status');
  const refresh = document.getElementById('status-refresh');
  let pending, version=0;
  const render = (value) => {
    market.textContent = value.marketLabel;
    execution.textContent = value.executionLabel;
    market.dataset.state=value.market;
    execution.dataset.state=value.execution;
    footer.textContent = 'Market: ' + (value.market === 'CONFIGURED'?'configured':'unavailable') +
      ' · ' + (value.execution === 'CONFIGURED'?'Execution backend configured; transaction eligibility unverified':'Live execution disabled');
    detail.textContent = 'Service configuration verified at ' + new Date().toLocaleTimeString() +
      '. Supported holdings, fresh quotes and settlement still need their own checks.';
  };
  async function checkStatus() {
    pending?.abort();const controller=new AbortController();pending=controller;const current=++version;
    refresh.disabled=true;detail.textContent='Checking deployed services, without using a sample portfolio…';
    try {
      const timeout = AbortSignal.timeout(7000);
      const signal=AbortSignal.any([controller.signal,timeout]);
      const [read,trade]=await Promise.all([statusJSON('/api/live/status',signal),statusJSON('/api/execution/status',signal)]);
      if(current!==version||controller.signal.aborted)return;
      render(serviceSnapshot(read,trade));
    } catch {
      if(current!==version||controller.signal.aborted)return;
      market.textContent='Status not verified';execution.textContent='Status not verified';
      market.dataset.state='UNKNOWN';execution.dataset.state='UNKNOWN';
      footer.textContent='Service status unavailable';
      detail.textContent='Unable to verify service status. No live market or trading availability is assumed.';
    }finally{if(current===version){pending=undefined;refresh.disabled=false;}}
  }
  refresh.addEventListener('click',checkStatus);
  window.addEventListener('hashchange',()=>{if(!location.hash || location.hash==='#home')void checkStatus();});
  window.addEventListener('pagehide',()=>{version++;pending?.abort();});
  void checkStatus();
}
