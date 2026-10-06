export type ErrorCode =
  | 'CONFIG_MISSING' | 'INVALID_INPUT' | 'READ_ONLY_VIOLATION'
  | 'AUTH_KEY_INVALID' | 'AUTH_SIGNATURE_INVALID' | 'AUTH_CLOCK_DRIFT'
  | 'AUTH_PERMISSION_DENIED' | 'RATE_LIMITED' | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_REJECTED' | 'UPSTREAM_SCHEMA_INVALID'
  | 'UNSUPPORTED_ASSET' | 'INSUFFICIENT_POSITION' | 'MARKET_BLOCKED'
  | 'QUOTE_EXPIRED' | 'RFQ_UNAVAILABLE' | 'RFQ_OPAQUE';

const messages: Record<ErrorCode, string> = {
  CONFIG_MISSING: 'Required protected configuration is missing. Check variable names in .env.example.',
  INVALID_INPUT: 'A configuration value is invalid. Check the public wallet, token address and raw input amount.',
  READ_ONLY_VIOLATION: 'This milestone allows read-only Binance endpoints only.',
  AUTH_KEY_INVALID: 'Binance rejected the API key. Check its status in the developer portal.',
  AUTH_SIGNATURE_INVALID: 'Binance rejected the request signature. Check signing configuration.',
  AUTH_CLOCK_DRIFT: 'Binance rejected the timestamp or nonce. Check clock synchronization.',
  AUTH_PERMISSION_DENIED: 'The API key does not have permission for this operation.',
  RATE_LIMITED: 'Binance rate-limited this request. Retry later.',
  UPSTREAM_TIMEOUT: 'The Binance request timed out. No transaction was submitted.',
  UPSTREAM_UNAVAILABLE: 'Binance is temporarily unavailable. No transaction was submitted.',
  UPSTREAM_REJECTED: 'Binance rejected the read-only request. Check the redacted error code.',
  UPSTREAM_SCHEMA_INVALID: 'Binance returned data that could not be validated. The gate remains blocked.',
  UNSUPPORTED_ASSET: 'The selected contract is not a supported BSC tokenized stock.',
  INSUFFICIENT_POSITION: 'The wallet does not hold the requested raw stock amount.',
  MARKET_BLOCKED: 'The asset or market is paused, restricted, unsupported, or in maintenance.',
  QUOTE_EXPIRED: 'The selected quote is too old. Run a fresh planning attempt.',
  RFQ_UNAVAILABLE: 'No matching tokenized-stock RFQ route was returned.',
  RFQ_OPAQUE: 'RFQ data was received but is not inspectable EIP-712 data. Signing remains blocked.'
};

export class RemainError extends Error {
  readonly code: ErrorCode;
  readonly upstreamCode: number | undefined;
  constructor(code: ErrorCode, upstreamCode?: number) {
    super(messages[code]);
    this.name = 'RemainError';
    this.code = code;
    this.upstreamCode = upstreamCode;
  }
}

export function safeError(error: unknown): { code: ErrorCode; message: string; upstreamCode?: number } {
  const e = error instanceof RemainError ? error : new RemainError('UPSTREAM_SCHEMA_INVALID');
  return { code: e.code, message: e.message, ...(e.upstreamCode === undefined ? {} : { upstreamCode: e.upstreamCode }) };
}

export function upstreamError(status: number, code?: number): RemainError {
  if (code === 40101) return new RemainError('AUTH_KEY_INVALID', code);
  if (code === 40102) return new RemainError('AUTH_SIGNATURE_INVALID', code);
  if (code === 40103) return new RemainError('AUTH_CLOCK_DRIFT', code);
  if (status === 403 || code === 40104) return new RemainError('AUTH_PERMISSION_DENIED', code);
  if (status === 429 || code === 42900) return new RemainError('RATE_LIMITED', code);
  if (code === 40401) return new RemainError('QUOTE_EXPIRED', code);
  if (status >= 500 || code === 50000 || code === 50001) return new RemainError('UPSTREAM_UNAVAILABLE', code);
  return new RemainError('UPSTREAM_REJECTED', code);
}
