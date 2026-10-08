import { createRehearsalServer } from '../src/rehearsal/server.ts';
import { localInspector } from '../src/integration/local.ts';
import { localPositionReader } from '../src/integration/position.ts';
import { localCashPreviewer, localCashReviewer } from '../src/integration/preview.ts';

function port(value: string | undefined): number {
  if (value === undefined) return 3000;
  if (!/^[1-9][0-9]{0,4}$/.test(value)) throw new Error('INVALID_PORT');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 65535) throw new Error('INVALID_PORT');
  return parsed;
}

function bindHost(value: string | undefined): '127.0.0.1' | 'localhost' | '0.0.0.0' {
  if (value === undefined) return '127.0.0.1';
  if (value === '127.0.0.1' || value === 'localhost' || value === '0.0.0.0') return value;
  throw new Error('INVALID_BIND_HOST');
}

function allowedHosts(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') return [];
  const values = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!values.length || new Set(values).size !== values.length) throw new Error('INVALID_ALLOWED_HOSTS');
  return values;
}

try {
  const listenPort = port(process.env.PORT);
  const host = bindHost(process.env.HOST);
  const hosts = allowedHosts(process.env.REMAIN_ALLOWED_HOSTS);
  if (host === '0.0.0.0' && hosts.length === 0) throw new Error('PUBLIC_BIND_REQUIRES_ALLOWED_HOSTS');
  if (host === '0.0.0.0' && process.env.REMAIN_LOCAL_READ_ONLY === 'true') throw new Error('LOCAL_INSPECTION_REQUIRES_LOOPBACK');
  const inspector = localInspector(process.env);
  const positionReader = localPositionReader(process.env);
  const cashPreviewer = localCashPreviewer(process.env);
  const cashReviewer = localCashReviewer(process.env);

  const configuredBuildSha = process.env.REMAIN_BUILD_SHA;
  const server = createRehearsalServer({ allowedHosts: hosts,
    ...(configuredBuildSha ? { buildSha: configuredBuildSha } : {}), ...(inspector ? { inspector } : {}), ...(positionReader ? { positionReader } : {}), ...(cashPreviewer ? { cashPreviewer } : {}), ...(cashReviewer ? { cashReviewer } : {}) });

  server.listen(listenPort, host, () => {
    const address = host === '0.0.0.0' ? 'configured public host' : `http://${host}:${listenPort}`;
    console.log(`Remain listening on ${address}. Fixture planner; ${inspector ? 'local read-only inspection available' : 'live inspection disabled'}. Execution disabled.`);
  });
  server.on('error', () => {
    console.error('Rehearsal server could not start. Check the bind address, port and deployment host configuration.');
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
} catch (error) {
  const code = error instanceof Error ? error.message : 'INVALID_SERVER_CONFIG';
  console.error(`Remain rehearsal startup blocked: ${code}`);
  process.exitCode = 1;
}
