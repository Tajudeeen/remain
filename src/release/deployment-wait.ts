import { parseReceiptJSON } from '../receipts/canonical.ts';

type Options = { fetcher?: typeof fetch; attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> };

// Wait for public build identity before running the separate external smoke.
// Never echo provider bodies or errors. This establishes a fixture HTTP claim.
export async function waitForDeployment(origin: string, expectedSha: string, options: Options = {}): Promise<void> {
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error('DEPLOYMENT_CONFIG_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error('DEPLOYMENT_CONFIG_INVALID');
  const attempts = options.attempts ?? 36; const delayMs = options.delayMs ?? 3000;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60 || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error('DEPLOYMENT_CONFIG_INVALID');
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = AbortSignal.timeout(180000);
  for (let i = 0; i < attempts && !deadline.aborted; i++) {
    try {
      const response = await fetcher(new URL('/healthz', url), { redirect: 'error', cache: 'no-store', signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]) });
      if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new Error();
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 4096) { void reader.cancel().catch(() => {}); throw new Error(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const value = parseReceiptJSON(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as Record<string, unknown>;
      if (value && Object.keys(value).sort().join(',') === 'buildSha,executionEnabled,liveGate,mode,service,status' &&
        value.status === 'ok' && value.service === 'remain-rehearsal' && value.mode === 'TEST_FIXTURE' &&
        value.liveGate === 'BLOCKED' && value.executionEnabled === false && value.buildSha === expectedSha) return;
    } catch { /* Bounded polling never reports untrusted response details. */ }
    if (i + 1 < attempts && !deadline.aborted) await sleep(delayMs);
  }
  throw new Error('DEPLOYMENT_NOT_READY');
}
