import { backupExecutionJournal } from '../src/execution/backup.ts';
try {
  if (process.argv.length !== 3 || !process.env.REMAIN_STORAGE_KEY || !process.env.REMAIN_EXECUTION_DB) throw new Error();
  console.log(JSON.stringify(await backupExecutionJournal(process.env.REMAIN_EXECUTION_DB, process.argv[2]!, process.env.REMAIN_STORAGE_KEY), null, 2));
} catch { console.error('JOURNAL_BACKUP_BLOCKED: use an existing private backup directory, a new filename, the original journal and its protected key. No paths, rows or key values are printed.'); process.exitCode = 1; }
