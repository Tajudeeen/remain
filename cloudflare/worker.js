import { BUILD_SHA } from './build-identity.js';
import { DurableObject } from 'cloudflare:workers';
import { randomUUID } from 'node:crypto';
import { sealEncryptedBackup } from './backup.ts';
import { ReadOnlyBinanceClient } from '../src/client.ts';
import { ExecutionEngine } from '../src/execution/engine-core.ts';
import { ExecutionHttp, executionError } from '../src/execution/http.ts';
import { BinanceExecutionVendor } from '../src/execution/vendor.ts';
import { HttpRpc } from '../src/execution/rpc.ts';
import { makeRpcEgressFetcher } from './egress.js';
import { contractPins, rpcPair } from '../src/execution/configuration.ts';
import { parseRfqJSON } from '../src/rfq/json.ts';
import { DurableSqlExecutionJournal } from './journal.ts';

const ledgerName = 'remain-execution-all-wallets-v1';
const actions = new Set(['challenge','login','preview','prepare','approve','signing','sign','submit','poll','get','cancel','recover','invalidate','receipt']);
const profile = 'COW_BSC_SELL_V1';

function reply(status, value, head = false) {
  return new Response(head ? null : JSON.stringify(value), {
    status, headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    }
  });
}
function allowedOrigin(request, env) {
  const url = new URL(request.url);
  const actual = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || actual && actual !== url.origin) return false;
  // A public trading origin must be pinned, never taken from untrusted Host.
  if (env.REMAIN_EXECUTION_ORIGIN && env.REMAIN_EXECUTION_ORIGIN !== url.origin) return false;
  return true;
}
function eligibleForEngine(env) {
  // Configuration readiness is necessary but never proves Binance access,
  // venue compatibility, contract source review or a funded settlement.
  if (env.REMAIN_EXECUTION_ENABLED !== 'true' ||
      env.REMAIN_COW_PROFILE_REVIEWED !== 'true' ||
      env.REMAIN_CLOUDFLARE_LIVE_APPROVED !== 'true' ||
      env.REMAIN_BACKUP_APPROVED !== 'true' || !env.REMAIN_BACKUP_BUCKET ||
      !/^[a-f0-9]{64}$/.test(env.REMAIN_STORAGE_KEY ?? '') ||
      !/^https:\/\/[^/]+$/.test(env.REMAIN_EXECUTION_ORIGIN ?? '') ||
      (env.REMAIN_RPC_EGRESS_ENABLED === 'true' && !env.REMAIN_RPC_EGRESS?.fetch)) return false;
  try {
    if (['BINANCE_WEB3_API_KEY','BINANCE_WEB3_SECRET_KEY','REMAIN_MAXIMUM_STOCK_FEE_RAW'].some(k=>!env[k]?.trim())) return false;
    if (!/^(0|[1-9][0-9]*)$/.test(env.REMAIN_MAXIMUM_STOCK_FEE_RAW)) return false;
    rpcPair(env);
    contractPins(env.REMAIN_CONTRACT_PINS ?? '');
    return true;
  } catch { return false; }
}
async function boundedBody(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d{1,7}$/.test(length) || Number(length) > 4096)) throw Error('BODY_TOO_LARGE');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw Error('CONTENT_TYPE_REJECTED');
  if (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity') throw Error('CONTENT_TYPE_REJECTED');
  if (!request.body) throw Error('INVALID_REQUEST');
  const reader = request.body.getReader(); const parts=[]; let total=0;
  try {
    for (;;) {
      const {value,done} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4096) throw Error('BODY_TOO_LARGE');
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let at=0;
  for (const p of parts) { bytes.set(p,at); at+=p.length; }
  return parseRfqJSON(new TextDecoder('utf-8',{fatal:true}).decode(bytes), 4096);
}
function makeHttp(env, journal) {
  const required=['BINANCE_WEB3_API_KEY','BINANCE_WEB3_SECRET_KEY','REMAIN_RPC_PRIMARY','REMAIN_RPC_SECONDARY','REMAIN_CONTRACT_PINS','REMAIN_MAXIMUM_STOCK_FEE_RAW'];
  if (required.some(key=>!env[key]?.trim())) throw Error('EXECUTION_CONFIG_MISSING');
  const [primary,secondary]=rpcPair(env), pins=contractPins(env.REMAIN_CONTRACT_PINS);
  const credentials={apiKey:env.BINANCE_WEB3_API_KEY,secretKey:env.BINANCE_WEB3_SECRET_KEY};
  const rpcFetcher = makeRpcEgressFetcher(env);
  const engine=new ExecutionEngine({
    reader:new ReadOnlyBinanceClient(credentials),
    vendor:new BinanceExecutionVendor(credentials),
    rpcs:[new HttpRpc(primary.href,rpcFetcher),new HttpRpc(secondary.href,rpcFetcher)],
    store:journal, pins, maximumStockFeeRaw:env.REMAIN_MAXIMUM_STOCK_FEE_RAW, mode:'LIVE_EXECUTION'
  });
  return new ExecutionHttp(engine, env.REMAIN_EXECUTION_ORIGIN);
}

// One global named instance means the active-wallet uniqueness constraint is
// enforced across all users, requests, restarts and Cloudflare edge locations.
export class RemainLedger extends DurableObject {
  constructor(ctx, env) {
    super(ctx,env);
    this.http = undefined;
    this.journal = undefined;
  }
  // Optional private offsite backups; no public backup/restore HTTP route exists.
  // Do not approve real orders without configuring R2, a verified restore drill,
  // and an independently held copy of the encryption key.
  async scheduleBackup() {
    if (!this.env.REMAIN_BACKUP_BUCKET || this.env.REMAIN_BACKUP_APPROVED!=='true') return;
    if ((await this.ctx.storage.getAlarm())===null)
      await this.ctx.storage.setAlarm(Date.now()+5*60*1000);
  }
  async alarm() {
    if (!this.env.REMAIN_BACKUP_BUCKET || this.env.REMAIN_BACKUP_APPROVED!=='true' ||
        !/^[a-f0-9]{64}$/.test(this.env.REMAIN_STORAGE_KEY??'')) return;
    const at=Date.now();
    const journal=this.journal ??= new DurableSqlExecutionJournal(this.ctx.storage,this.env.REMAIN_STORAGE_KEY);
    const rows=journal.exportRows();
    if(rows.length>0) {
      const snapshot=sealEncryptedBackup(rows,this.env.REMAIN_STORAGE_KEY,at);
      const path='v1/'+new Date(at).toISOString().slice(0,10)+'/'+at+'-'+randomUUID()+'.rmb';
      const written=await this.env.REMAIN_BACKUP_BUCKET.put(path,snapshot,{
        httpMetadata:{contentType:'application/octet-stream'},
        customMetadata:{format:'remain-encrypted-backup-v1'}
      });
      if(!written) throw Error('BACKUP_WRITE_NOT_CONFIRMED');
    }
    // Cloudflare replays a failed alarm; only a successful snapshot reschedules.
    await this.ctx.storage.setAlarm(at+60*60*1000);
  }
  async fetch(request) {
    const url=new URL(request.url);
    if (url.pathname === '/_internal/health' && request.method === 'GET') {
      try {
        if (!this.env.REMAIN_STORAGE_KEY) return reply(200,{journal:'KEY_NOT_CONFIGURED'});
        const journal = this.journal ??= new DurableSqlExecutionJournal(this.ctx.storage,this.env.REMAIN_STORAGE_KEY);
        await this.scheduleBackup();
        return reply(200,{journal:journal.probe()?'READY':'UNVERIFIED'});
      } catch { return reply(503,{journal:'UNVERIFIED'}); }
    }
    const action=/^\/api\/execution\/([a-z]+)$/.exec(url.pathname)?.[1];
    if (!action || !actions.has(action) || request.method !== 'POST' || url.search || !allowedOrigin(request,this.env) ||
        !eligibleForEngine(this.env)) return reply(503,{code:'EXECUTION_SETUP_REQUIRED'});
    let input;
    try { input=await boundedBody(request); }
    catch (e) { return reply(e.message==='BODY_TOO_LARGE'?413:400,{code:e.message==='BODY_TOO_LARGE'?'BODY_TOO_LARGE':'INVALID_REQUEST'}); }
    try {
      const journal = this.journal ??= new DurableSqlExecutionJournal(this.ctx.storage,this.env.REMAIN_STORAGE_KEY);
      const http = this.http ??= makeHttp(this.env,journal);
      await this.scheduleBackup();
      const value = await http.handle(action,input,request.headers.get('authorization')??undefined);
      return reply(200,value);
    } catch(e) {return reply(400,{code:executionError(e)});}
  }
}

// Public Worker is a strict reverse boundary. No wallet keys, order signing
// or Binance upstream data is ever returned by health/status endpoints.
export default {
  async fetch(request,env) {
    let url;
    try {url=new URL(request.url);} catch {return reply(400,{code:'INVALID_REQUEST'});}
    // Public health and status GET/HEAD reveal no session, wallet or order data.
    // Browser navigations from ChatGPT, GitHub and bookmarks may carry
    // Sec-Fetch-Site: cross-site; do not mistake safe navigation for CSRF.
    // The strict Origin/Sec-Fetch-Site gate still applies to every POST.
    const publicRead = ['GET','HEAD'].includes(request.method) &&
      ['/', '/healthz', '/api/execution/status'].includes(url.pathname);
    if (url.search || (!publicRead && !allowedOrigin(request,env)) ||
        (url.protocol!=='https:' && url.hostname!=='localhost' && url.hostname!=='127.0.0.1'))
      return reply(403,{code:'ORIGIN_REJECTED'});
    if (url.pathname==='/') {
      if (!['GET','HEAD'].includes(request.method)) return reply(405,{code:'METHOD_REJECTED'});
      return reply(200,{kind:'REMAIN_EXECUTION_API',service:'remain-cloudflare-execution',
        health:'/healthz',executionStatus:'/api/execution/status',executionEnabled:eligibleForEngine(env)},
        request.method==='HEAD');
    }
    if (url.pathname==='/healthz') {
      if (!['GET','HEAD'].includes(request.method)) return reply(405,{code:'METHOD_REJECTED'});
      let journal='NOT_CONFIGURED';
      if (/^[a-f0-9]{64}$/.test(env.REMAIN_STORAGE_KEY??'')) {
        try {
          const instance=env.REMAIN_LEDGER.get(env.REMAIN_LEDGER.idFromName(ledgerName));
          const result=await instance.fetch(new Request(url.origin+'/_internal/health'));
          const value=await result.json();
          journal=result.ok && value.journal==='READY'?'READY':'UNVERIFIED';
        } catch {journal='UNVERIFIED';}
      }
      return reply(200,{status:'ok',service:'remain-cloudflare-execution',
        buildSha:BUILD_SHA, journal,
        backup:env.REMAIN_BACKUP_BUCKET && env.REMAIN_BACKUP_APPROVED==='true' ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED',
        executionEnabled:eligibleForEngine(env),liveGate:'UNVERIFIED'}, request.method==='HEAD');
    }
    if (url.pathname==='/api/execution/status') {
      if (!['GET','HEAD'].includes(request.method)) return reply(405,{code:'METHOD_REJECTED'});
      return reply(200,{kind:'REMAIN_EXECUTION_STATUS',available:eligibleForEngine(env),profile,userConfirmationRequired:true},request.method==='HEAD');
    }
    const action=/^\/api\/execution\/([a-z]+)$/.exec(url.pathname)?.[1];
    if (!action || !actions.has(action)) return reply(404,{code:'NOT_FOUND'});
    if (request.method!=='POST') return reply(405,{code:'METHOD_REJECTED'});
    if (!eligibleForEngine(env)) return reply(503,{code:'EXECUTION_SETUP_REQUIRED'});
    if (!request.headers.get('origin') || request.headers.get('origin')!==url.origin)
      return reply(403,{code:'ORIGIN_REJECTED'});
    const instance=env.REMAIN_LEDGER.get(env.REMAIN_LEDGER.idFromName(ledgerName));
    try { return await instance.fetch(request); }
    catch {return reply(503,{code:'EXECUTION_UPSTREAM_UNAVAILABLE'});}
  }
};
