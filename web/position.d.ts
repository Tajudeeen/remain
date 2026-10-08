export type PositionInput = Readonly<{ wallet: string; token: string }>;
export type PositionRead = Readonly<{
  kind: 'REMAIN_POSITION_READ'; mode: 'LIVE_READ_ONLY' | 'TEST_FIXTURE'; wallet: string;
  stock: Readonly<{ chain: '56'; token: string; symbol: string; ticker: string; issuer: 'ondo' | 'bstock' | 'xstocks'; decimals: number }>;
  status: 'HELD_OBSERVED' | 'ZERO_OBSERVED' | 'RAW_UNAVAILABLE' | 'NOT_REPORTED' | 'INCOMPLETE';
  balanceRaw: string | null; observedAtMs: number; pagesRead: number;
  executionEnabled: false; liveGate: 'UNVERIFIED'; ownership: 'NOT_AUTHENTICATED';
}>;
export function validatePosition(value: unknown, submitted: PositionInput, now?: number): PositionRead;
export function formatPositionUnits(raw: string, decimals: number): string;
export function preparePositionAmount(amount: string, snapshot: unknown, submitted: PositionInput, now?: number, elapsedMs?: number): string;
