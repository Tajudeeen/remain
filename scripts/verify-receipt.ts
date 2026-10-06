import { readFile } from 'node:fs/promises';
import { canonicalJSON, parseReceiptJSON, RECEIPT_MAX_BYTES, ReceiptError } from '../src/receipts/canonical.ts';
import { verifyReceipt } from '../src/receipts/verifier.ts';

const path = process.argv[2];
if (!path || process.argv.length !== 3) { console.error('Usage: npm run verify:receipt -- <receipt.json>'); process.exit(2); }
try {
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text) > RECEIPT_MAX_BYTES) throw new ReceiptError('RECEIPT_TOO_LARGE');
  const value = parseReceiptJSON(text); const result = verifyReceipt(value);
  console.log(JSON.stringify({ ...result, inputBytes: Buffer.byteLength(text), canonicalInputBytes: Buffer.byteLength(canonicalJSON(value)), notice: 'Consistency report only. It does not authenticate provider, wallet or chain evidence.' }, null, 2));
  if (result.status !== 'CONSISTENT_FIXTURE') process.exitCode = 1;
} catch (error) { console.error(JSON.stringify({ status: 'INVALID_RECEIPT', executionEnabled: false, code: error instanceof ReceiptError ? error.code : 'READ_FAILED' })); process.exitCode = 1; }
