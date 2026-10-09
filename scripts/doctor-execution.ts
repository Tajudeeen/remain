import { executionDoctor } from '../src/execution/configuration.ts';
const report = executionDoctor(process.env);
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'CONFIGURED') process.exitCode = 1;
