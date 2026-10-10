import { cp, mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist/web', { recursive: true });
for (const file of ['index.html', 'app.js', 'proof.js', 'response.js', 'live.js', 'wallet.js', 'wallet-providers.js', 'wallet-ui.js', 'position.js', 'preview.js', 'order-review.js', 'trade.js', 'onchain.js', 'balance-evidence.js', 'balance-evidence-ui.js', 'catalog.js', 'service-status.js', 'portfolio.js', 'demo-engine.js', 'demo.js', 'demo.css', 'studio.html', 'demo-receipt.json', 'styles.css', 'logo.png']) await cp(`web/${file}`, `dist/web/${file}`);
// Pages Functions must invoke only the bounded fixture API, not static assets.
await writeFile('dist/web/_routes.json', JSON.stringify({version:1,include:['/healthz','/api/*'],exclude:[]},null,2)+'\n');
// Cloudflare Pages static responses get the same fail-closed policies as Netlify.
await writeFile('dist/web/_headers',`/*
  Cache-Control: no-store
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'
`);
const commit = process.env.COMMIT_REF;
// Bundle the immutable build identity rather than retaining an old runtime env value.
await mkdir('netlify', { recursive: true });
await writeFile('netlify/build-id.ts', "// Overwritten at build time using Netlify's public COMMIT_REF, never credentials.\nexport const buildSha: string = '" +
  (commit && /^[a-f0-9]{40}$/.test(commit) ? commit : 'unknown') + "';\n");
