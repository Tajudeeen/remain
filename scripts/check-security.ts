import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const excluded = new Set(['.git', 'node_modules', 'dist', 'coverage', 'evidence']);
const failures: string[] = [];
async function scan(folder: string): Promise<void> {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    if (excluded.has(item.name)) continue;
    const path = join(folder, item.name);
    if (item.isSymbolicLink()) { failures.push(`symlink: ${path}`); continue; }
    if (item.isDirectory()) { await scan(path); continue; }
    if (item.name.startsWith('.env') && item.name !== '.env.example') {
      // Local ignored credentials are legitimate. Never read their contents.
      try { execFileSync('git', ['check-ignore', '-q', path], { stdio: 'ignore' }); }
      catch { failures.push(`unignored credentials file: ${path}`); }
      continue;
    }
    if (/\.(pem|key)$/.test(item.name)) failures.push(`key file: ${path}`);
    const content = await readFile(path, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) failures.push(`private-key material: ${path}`);
    if (/BINANCE_WEB3_(?:API_KEY|SECRET_KEY)[ \t]*=[ \t]*[^\s#\r\n]+/.test(content)) failures.push(`credential assignment: ${path}`);
    if (path.startsWith('src/') && /console\.(?:log|error|debug|info)|eth_sendRawTransaction|eth_sendTransaction|eth_signTypedData|privateKeyToAccount/.test(content)) failures.push(`execution or logging API in read-only source: ${path}`);
  }
}
await scan('.');
const ignore = await readFile('.gitignore', 'utf8');
for (const entry of ['.env', '.env.*', '!.env.example', 'evidence/']) {
  if (!ignore.split('\n').includes(entry)) failures.push(`missing ignore: ${entry}`);
}
if (failures.length) {
  console.error('Source policy checks failed. Paths only, no file contents:');
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else console.log('Basic source policy checks passed. This is not a security audit or proof of secret absence.');
