import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { FixtureOrderJournal } from '../../src/orders/journal.ts';
import { OrderError } from '../../src/orders/model.ts';

const [mode, file, inputFile] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inputFile!, 'utf8'));
try {
  if (mode === 'rollback-crash') {
    const db = new DatabaseSync(file!);
    db.exec('BEGIN IMMEDIATE; UPDATE orders SET revision=999;');
    process.kill(process.pid, 'SIGKILL');
  } else {
    const journal = new FixtureOrderJournal(file!);
    if (mode === 'reserve') journal.reserve(input.requestId, input.binding);
    else journal.append(input.requestId, 0, input.event);
    if (mode === 'commit-crash') process.kill(process.pid, 'SIGKILL');
    journal.close(); process.stdout.write('OK');
  }
} catch (error) { process.stdout.write(error instanceof OrderError ? error.code : 'UNEXPECTED'); process.exitCode = 2; }
