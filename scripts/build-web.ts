import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/web', { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css', 'logo.png']) await cp(`web/${file}`, `dist/web/${file}`);
