import { smokeExecutionHost } from '../src/release/execution-smoke.ts';
try {
  if (process.argv.length !== 5) throw new Error();
  console.log(JSON.stringify(await smokeExecutionHost(process.argv[2]!, process.argv[3]!, process.argv[4] as 'enabled' | 'disabled'), null, 2));
} catch { console.error('EXECUTION_HOST_UNVERIFIED: exact origin, build identity, security headers or execution availability did not match. No URL credentials or response bodies are printed.'); process.exitCode = 1; }
