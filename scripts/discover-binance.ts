import { discoverStocks } from '../src/discovery.ts';
import { safeError } from '../src/errors.ts';

try { console.log(JSON.stringify(await discoverStocks(process.env), null, 2)); }
catch (error) { console.error(JSON.stringify({ status: 'blocked', executionEnabled: false, error: safeError(error) })); process.exitCode = 1; }
