import type { Config, Context } from '@netlify/functions';
import { handleNetlifyFixture } from '../../src/rehearsal/netlify-handler.ts';
import { buildSha as bundledBuildSha } from '../build-id.ts';
import { configuredHostedReaders } from '../../src/integration/hosted.ts';
import { configuredExecutionProxy } from '../../src/rehearsal/execution-proxy.ts';

export default async (request: Request, context: Context) => {
  const origins: string[] = [];
  for (const value of [context.site.url, Netlify.env.get('DEPLOY_URL'), Netlify.env.get('DEPLOY_PRIME_URL')]) {
    if (!value) continue;
    try { origins.push(new URL(value).origin); } catch { /* Invalid configuration fails closed. */ }
  }
  // DEPLOY_PRIME_URL is not guaranteed to be available at function runtime.
  // Trust only the deployment context and this site's exact Netlify preview hostname.
  // Never accept an arbitrary caller-supplied Host as an allowed origin.
  try {
    const target = new URL(request.url);
    const site = context.site.name;
    const suffix = '--' + site + '.netlify.app';
    const prefix = target.hostname.endsWith(suffix) ? target.hostname.slice(0,-suffix.length) : '';
    if (context.deploy.context === 'deploy-preview' && /^[a-z0-9-]+$/.test(site) &&
      target.protocol === 'https:' && target.port === '' && /^deploy-preview-[1-9][0-9]*$/.test(prefix)) origins.push(target.origin);
  } catch { /* A malformed request URL cannot authorize any origin. */ }
  const buildSha = /^[a-f0-9]{40}$/.test(bundledBuildSha) ? bundledBuildSha : Netlify.env.get('REMAIN_BUILD_SHA');
  const live = configuredHostedReaders({
    REMAIN_HOSTED_READ_ONLY: Netlify.env.get('REMAIN_HOSTED_READ_ONLY'),
    BINANCE_WEB3_API_KEY: Netlify.env.get('BINANCE_WEB3_API_KEY'),
    BINANCE_WEB3_SECRET_KEY: Netlify.env.get('BINANCE_WEB3_SECRET_KEY')
  });
  const executionProxy = configuredExecutionProxy({
    REMAIN_EXECUTION_PROXY_ENABLED: Netlify.env.get('REMAIN_EXECUTION_PROXY_ENABLED'),
    REMAIN_EXECUTION_UPSTREAM_ORIGIN: Netlify.env.get('REMAIN_EXECUTION_UPSTREAM_ORIGIN')
  });
  return handleNetlifyFixture(request, { origins, ...(buildSha ? { buildSha } : {}), ...(live ? { live } : {}), ...(executionProxy ? { executionProxy } : {}) });
};

export const config: Config = {
  path: ['/healthz', '/api/rehearse', '/api/receipt/verify', '/api/live/status', '/api/live/inspect', '/api/live/position', '/api/live/preview', '/api/live/review', '/api/live/catalog', '/api/execution/*'],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
