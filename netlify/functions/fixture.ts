import type { Config, Context } from '@netlify/functions';
import { handleNetlifyFixture } from '../../src/rehearsal/netlify-handler.ts';
import { buildSha as bundledBuildSha } from '../build-id.ts';

export default async (request: Request, context: Context) => {
  const origins: string[] = [];
  for (const value of [context.site.url, Netlify.env.get('DEPLOY_URL'), Netlify.env.get('DEPLOY_PRIME_URL')]) {
    if (!value) continue;
    try { origins.push(new URL(value).origin); } catch { /* Invalid configuration fails closed. */ }
  }
  const buildSha = /^[a-f0-9]{40}$/.test(bundledBuildSha) ? bundledBuildSha : Netlify.env.get('REMAIN_BUILD_SHA');
  return handleNetlifyFixture(request, { origins, ...(buildSha ? { buildSha } : {}) });
};

export const config: Config = {
  path: ['/healthz', '/api/rehearse', '/api/receipt/verify', '/api/live/status', '/api/live/inspect', '/api/live/position', '/api/live/preview'],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
