import { cp, mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist/web', { recursive: true });
for (const file of ['index.html', 'app.js', 'proof.js', 'response.js', 'live.js', 'wallet.js', 'position.js', 'preview.js', 'order-review.js', 'trade.js', 'demo-receipt.json', 'styles.css', 'logo.png']) await cp(`web/${file}`, `dist/web/${file}`);
const commit = process.env.COMMIT_REF;
// Bundle the immutable build identity rather than retaining an old runtime env value.
await mkdir('netlify', { recursive: true });
await writeFile('netlify/build-id.ts', "// Overwritten at build time using Netlify's public COMMIT_REF, never credentials.\nexport const buildSha: string = '" +
  (commit && /^[a-f0-9]{40}$/.test(commit) ? commit : 'unknown') + "';\n");
