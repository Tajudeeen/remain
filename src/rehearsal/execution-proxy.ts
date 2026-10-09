// Same-origin gateway to the existing durable execution service.
// Never interpret the presence of a URL as permission to trade.
// No order replay or retry. Durable idempotency remains entirely upstream.
export type ExecutionProxy = Readonly<{ origin: string; fetcher?: typeof fetch }>;
export function configuredExecutionProxy(env: Record<string,string|undefined>): ExecutionProxy | undefined {
  if (env.REMAIN_EXECUTION_PROXY_ENABLED !== 'true') return undefined;
  let url: URL;
  try { url = new URL(env.REMAIN_EXECUTION_UPSTREAM_ORIGIN ?? ''); }
  catch { return undefined; }
  if (url.protocol !== 'https:' || url.origin !== env.REMAIN_EXECUTION_UPSTREAM_ORIGIN ||
    url.username || url.password || url.port || url.hostname === 'localhost' ||
    /^(?:127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(url.hostname) || /\.local$/.test(url.hostname)) return undefined;
  return {origin:url.origin};
}
async function boundedText(body: ReadableStream<Uint8Array> | null, maxBytes: number, signal: AbortSignal): Promise<string> {
  if(!body) throw Error('MISSING_BODY');
  const reader=body.getReader();
  const parts:Uint8Array[]=[]; let total=0;
  const interrupt=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',interrupt,{once:true});
  try {
    while(true){
      signal.throwIfAborted();
      const {value,done}=await reader.read();
      signal.throwIfAborted();
      if(done) break;
      total+=value.byteLength;
      if(total>maxBytes) throw Error('BODY_TOO_LARGE');
      parts.push(value);
    }
    const bytes=new Uint8Array(total);let at=0;
    for(const part of parts){bytes.set(part,at);at+=part.byteLength;}
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  } finally {signal.removeEventListener('abort',interrupt);reader.releaseLock();}
}
const paths = new Set(['status','challenge','login','preview','prepare','approve','signing','sign','submit','poll','get','cancel','recover','invalidate','receipt']);
function fail(status:number,code:string) { return new Response(JSON.stringify({code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"}}); }
export async function proxyExecution(request:Request, action:string, config:ExecutionProxy):Promise<Response> {
  if(!paths.has(action)) return fail(404,'NOT_FOUND');
  const statusAction=action==='status';
  if(!(statusAction ? ['GET','HEAD'].includes(request.method) : request.method==='POST')) return fail(405,'METHOD_REJECTED');
  const origin=config.origin, endpoint=origin+'/api/execution/'+action;
  if (!configuredExecutionProxy({REMAIN_EXECUTION_PROXY_ENABLED:'true',REMAIN_EXECUTION_UPSTREAM_ORIGIN:origin})) return fail(503,'EXECUTION_SETUP_REQUIRED');
  let body:string|undefined;
  if(!statusAction) {
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??'')) return fail(415,'CONTENT_TYPE_REJECTED');
    if(request.headers.has('content-encoding') && request.headers.get('content-encoding')!=='identity') return fail(415,'ENCODING_REJECTED');
    const announced=Number(request.headers.get('content-length')??'0');
    if(!Number.isSafeInteger(announced)||announced>4096) return fail(413,'BODY_TOO_LARGE');
    try {
      body=await boundedText(request.body,4096,AbortSignal.any([request.signal,AbortSignal.timeout(20000)]));
      JSON.parse(body);
    }catch(e){return fail(e instanceof Error && e.message==='BODY_TOO_LARGE'?413:400,e instanceof Error && e.message==='BODY_TOO_LARGE'?'BODY_TOO_LARGE':'INVALID_REQUEST');}
  }
  const headers=new Headers({'origin':origin});
  if(!statusAction) headers.set('content-type','application/json');
  const authorization=request.headers.get('authorization');
  if(authorization) {
    if(authorization.length>1024 || !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) return fail(400,'INVALID_AUTHORIZATION');
    headers.set('authorization',authorization);
  }
  let upstream:Response;
  try {
    upstream=await (config.fetcher??fetch)(endpoint,{
      method:statusAction?'GET':'POST',
      headers, ...(body!==undefined?{body}:{}),
      signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)]),
      redirect:'error',cache:'no-store',credentials:'omit'
    });
    if(!/^application\/json\b/i.test(upstream.headers.get('content-type')??'')) return fail(502,'EXECUTION_UPSTREAM_INVALID');
    const length=Number(upstream.headers.get('content-length')??'0');
    if(!Number.isSafeInteger(length)||length>262144) return fail(502,'EXECUTION_UPSTREAM_INVALID');
    const text=await boundedText(upstream.body,262144,AbortSignal.any([request.signal,AbortSignal.timeout(20000)]));
    const data:unknown=JSON.parse(text);
    if(!data || typeof data!=='object' || Array.isArray(data)) return fail(502,'EXECUTION_UPSTREAM_INVALID');
    if(statusAction) {
      const value=data as Record<string,unknown>;
      if(Object.keys(value).sort().join()!=='available,kind,profile,userConfirmationRequired' ||
        value.kind!=='REMAIN_EXECUTION_STATUS' || typeof value.available!=='boolean' ||
        value.profile!=='COW_BSC_SELL_V1' || value.userConfirmationRequired!==true || upstream.status!==200) return fail(502,'EXECUTION_UPSTREAM_INVALID');
    }
    const allowed=new Set([200,400,401,403,408,409,429,502,503]);
    if(!allowed.has(upstream.status)) return fail(502,'EXECUTION_UPSTREAM_INVALID');
    const result=new Response(request.method==='HEAD'?null:JSON.stringify(data),{
      status:upstream.status,headers:{'content-type':'application/json; charset=utf-8',
        'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
        'x-frame-options':'DENY','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"}});
    return result;
  } catch {return fail(503,'EXECUTION_UPSTREAM_UNAVAILABLE');}
}
