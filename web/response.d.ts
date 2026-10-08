export function parseFixtureJSON(text: string): unknown;
export function readFixtureText(response: Response, signal: AbortSignal): Promise<string>;
export function readFixtureJSON(response: Response, signal: AbortSignal): Promise<unknown>;
export function readReadOnlyJSON(response: Response, signal: AbortSignal): Promise<unknown>;
export type ReceiptReport = {
  mode: 'TEST_FIXTURE'; executionEnabled: false; source: 'UNAUTHENTICATED'; signature: 'NOT_REQUESTED';
  status: 'CONSISTENT_FIXTURE' | 'INVALID_RECEIPT'; reasons: string[]; receiptChecksum: string | null; canonicalBytes: number;
  facts: null | { eventCount: number; providerStatus: null | 'PENDING_VENDOR' | 'PENDING_ONCHAIN' | 'FILLED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
    settlementStatus: 'MATCHED_FIXTURE' | 'NOT_RECONCILED' | 'WAITING' | 'MISMATCH'; stockRemainingRaw: string | null; netCashReceivedRaw: string | null };
};
export function validateReceiptReport(value: unknown): ReceiptReport;
export function validatePlanningRecord(value: unknown, submitted: import('../src/rehearsal/plan.ts').RehearsalInput): Awaited<ReturnType<typeof import('../src/rehearsal/plan.ts').rehearsePlan>>;
