export type ErrorCode =
  | 'CONFIG_MISSING' | 'INVALID_INPUT' | 'READ_ONLY_VIOLATION' | 'REQUEST_CANCELLED'
  | 'AUTH_KEY_INVALID' | 'AUTH_SIGNATURE_INVALID' | 'AUTH_CLOCK_DRIFT'
  | 'AUTH_PERMISSION_DENIED' | 'RATE_LIMITED' | 'UPSTREAM_TIMEOUT'
  | 'ACCESS_REGION_RESTRICTED' | 'ACCESS_PROXY_REJECTED'
  | 'ACCESS_IP_RESTRICTED' | 'ACCESS_COMPLIANCE_RESTRICTED'
  | 'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_REJECTED' | 'UPSTREAM_SCHEMA_INVALID'
  | 'UNSUPPORTED_ASSET' | 'INSUFFICIENT_POSITION' | 'MARKET_BLOCKED'
  | 'QUOTE_EXPIRED' | 'RFQ_UNAVAILABLE' | 'RFQ_OPAQUE';

const messages: Record<ErrorCode, string> = {
  CONFIG_MISSING: 'Required protected configuration is missing. Check variable names in .env.example.',
  INVALID_INPUT: 'A configuration value is invalid. Check the public wallet, token address and raw input amount.',
  READ_ONLY_VIOLATION: 'This milestone allows read-only Binance endpoints only.',
  REQUEST_CANCELLED: 'The read-only inspection was cancelled. No transaction was submitted.',
  AUTH_KEY_INVALID: 'Binance rejected the API key. Check its status in the developer portal.',
  AUTH_SIGNATURE_INVALID: 'Binance rejected the request signature. Check signing configuration.',
  AUTH_CLOCK_DRIFT: 'Binance rejected the timestamp or nonce. Check clock synchronization.',
  AUTH_PERMISSION_DENIED: 'The API key does not have permission for this operation.',
  ACCESS_REGION_RESTRICTED: 'Binance blocked this request location. Stop and check operator and host eligibility with Binance.',
  ACCESS_PROXY_REJECTED: 'Binance rejected the connection as a proxy or VPN. Use an authorized direct connection or contact Binance support.',
  ACCESS_IP_RESTRICTED: 'Binance flagged unusual IP activity. Stop and contact Binance support before another live attempt.',
  ACCESS_COMPLIANCE_RESTRICTED: 'Binance blocked this request under a compliance rule. Check operator eligibility, approved host location and developer-project access with Binance. The exact rule is not established by this code.',
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

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(messages, value);
}

// Only fixed local labels may be exposed. Never use provider keys, messages or
// values as diagnostic labels, even if callers bypass TypeScript at runtime.
const schemaChecks = [
  'RESPONSE_BODY', 'RESPONSE_BODY_LIMIT', 'RESPONSE_JSON',
  'ENVELOPE_CODE', 'ENVELOPE_SUCCESS', 'ENVELOPE_TIMESTAMP', 'ENVELOPE_DATA',
  'DISCOVERY_LIST', 'DISCOVERY_ROW', 'DISCOVERY_SYMBOL', 'DISCOVERY_TICKER',
  'DISCOVERY_ISSUER', 'DISCOVERY_DECIMALS', 'DISCOVERY_ADDRESS',
  'DISCOVERY_STATUS', 'DISCOVERY_MARKET_STATUS', 'DISCOVERY_OPEN_STATE',
  'MARKET_RECORD', 'MARKET_STATUS', 'MARKET_OPEN_STATE', 'MARKET_RESPONSE', 'MARKET_IDENTITY', 'RFQ_BUILD_BINDING'
] as const;
export type SchemaCheck = typeof schemaChecks[number];
export function isSchemaCheck(value: unknown): value is SchemaCheck {
  return typeof value === 'string' && (schemaChecks as readonly string[]).includes(value);
}

export class RemainError extends Error {
  readonly code: ErrorCode;
  readonly upstreamCode: number | undefined;
  readonly validationCheck: SchemaCheck | undefined;
  constructor(code: ErrorCode, upstreamCode?: number, validationCheck?: SchemaCheck) {
    super(messages[code]);
    this.name = 'RemainError';
    this.code = code;
    this.upstreamCode = upstreamCode;
    this.validationCheck = code === 'UPSTREAM_SCHEMA_INVALID' && isSchemaCheck(validationCheck) ? validationCheck : undefined;
  }
}

export function safeError(error: unknown): { code: ErrorCode; message: string; upstreamCode?: number; validationCheck?: SchemaCheck } {
  const e = error instanceof RemainError ? error : new RemainError('UPSTREAM_SCHEMA_INVALID');
  return { code: e.code, message: e.message, ...(e.upstreamCode === undefined ? {} : { upstreamCode: e.upstreamCode }),
    ...(e.code === 'UPSTREAM_SCHEMA_INVALID' && isSchemaCheck(e.validationCheck) ? { validationCheck: e.validationCheck } : {}) };
}

export function schemaError(check: SchemaCheck): RemainError {
  return new RemainError('UPSTREAM_SCHEMA_INVALID', undefined, check);
}

export function upstreamError(status: number, code?: number): RemainError {
  // Gateway compliance codes can arrive inside HTTP 200. Never retry or
  // misclassify them as transient failures or ordinary API permissions.
  if (code === 40301) return new RemainError('ACCESS_REGION_RESTRICTED', code);
  if (code === 40302) return new RemainError('ACCESS_PROXY_REJECTED', code);
  if (code === 40303) return new RemainError('ACCESS_IP_RESTRICTED', code);
  if (code === 40304) return new RemainError('ACCESS_COMPLIANCE_RESTRICTED', code);
  if (code === 40101) return new RemainError('AUTH_KEY_INVALID', code);
  if (code === 40102) return new RemainError('AUTH_SIGNATURE_INVALID', code);
  if (code === 40103) return new RemainError('AUTH_CLOCK_DRIFT', code);
  if (status === 403 || code === 40104) return new RemainError('AUTH_PERMISSION_DENIED', code);
  if (status === 429 || code === 42900) return new RemainError('RATE_LIMITED', code);
  if (code === 40401) return new RemainError('QUOTE_EXPIRED', code);
  if (status >= 500 || code === 50000 || code === 50001) return new RemainError('UPSTREAM_UNAVAILABLE', code);
  return new RemainError('UPSTREAM_REJECTED', code);
}
