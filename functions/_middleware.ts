import { handleNetlifyFixture } from '../src/rehearsal/netlify-handler.ts';
import { BUILD_SHA } from '../cloudflare/build-identity.js';

// This is the free-tier Pages API boundary. No hosted vendor credentials,
// external execution proxy, or financial action is enabled.
export async function onRequest(context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> {
  const {request}=context;
  const url=new URL(request.url);
  if (url.pathname === '/healthz' || url.pathname.startsWith('/api/')) {
    // Cloudflare Pages serves only this project's exact origin. The shared
    // fixture handler still validates the request Origin and Sec-Fetch-Site.
    return handleNetlifyFixture(request,{
      origins:[url.origin],
      buildSha: BUILD_SHA
    });
  }
  return context.next();
}
