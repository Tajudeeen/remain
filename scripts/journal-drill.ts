import { inspectExecutionBackup } from '../src/execution/backup.ts';
try {
  if (process.argv.length !== 3 || !process.env.REMAIN_STORAGE_KEY) throw new Error();
  console.log(JSON.stringify(await inspectExecutionBackup(process.argv[2]!, process.env.REMAIN_STORAGE_KEY), null, 2));
} catch { console.error('JOURNAL_DRILL_BLOCKED: backup integrity, original key or private path checks failed. No rows or key values are printed.'); process.exitCode = 1; }
