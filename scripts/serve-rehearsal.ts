import { createRehearsalServer } from '../src/rehearsal/server.ts';

const server = createRehearsalServer();
server.listen(3000, '127.0.0.1', () => {
  console.log('Remain rehearsal: http://127.0.0.1:3000. TEST_FIXTURE only. Live access and execution disabled.');
});
server.on('error', () => { console.error('Rehearsal server could not start. Check whether local port 3000 is in use.'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
