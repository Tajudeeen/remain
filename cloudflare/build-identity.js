// The Wrangler [build] step replaces this value with git rev-parse HEAD.
// If that step is bypassed, production build identity remains unverified.
export const BUILD_SHA = 'unverified';
