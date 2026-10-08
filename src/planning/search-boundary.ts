import { normalizeQuote, PlanningError, timestamp, type PlanningQuote } from './model.ts';

type StopReason = 'SEARCH_TIME_BUDGET' | 'CANCELLED' | 'CLOCK_REGRESSION';
export class SearchStopped extends Error {
  readonly code: StopReason;
  constructor(code: StopReason) { super(code); this.code = code; }
}

// One deadline covers quotes and spacing, even if either ignores cancellation.
// Wall time checks data freshness. Independent elapsed time bounds waiting.
export class SearchBoundary {
  readonly controller = new AbortController();
  readonly elapsedStart = performance.now();
  private lastWallTime: number;
  private timer: ReturnType<typeof setTimeout>;
  private onAbort = () => this.stop('CANCELLED');
  private now: () => number;
  private started: number;
  private durationMs: number;
  private external: AbortSignal | undefined;
  reason: StopReason | undefined;

  constructor(now: () => number, started: number, durationMs: number, external?: AbortSignal) {
    this.now = now; this.started = started; this.durationMs = durationMs; this.external = external;
    this.lastWallTime = started;
    this.timer = setTimeout(() => this.stop('SEARCH_TIME_BUDGET'), durationMs);
    if (external?.aborted) this.stop('CANCELLED');
    else external?.addEventListener('abort', this.onAbort, { once: true });
  }
  private stop(reason: StopReason): void {
    // Cancellation and clock faults invalidate previously observed candidates.
    // A time budget alone only ends exploration.
    if (!this.reason || reason === 'CLOCK_REGRESSION' || (reason === 'CANCELLED' && this.reason === 'SEARCH_TIME_BUDGET')) this.reason = reason;
    this.controller.abort();
  }
  private readWallTime(): number {
    const at = timestamp(this.now());
    if (at < this.lastWallTime) this.stop('CLOCK_REGRESSION');
    this.lastWallTime = at;
    if (this.external?.aborted) this.stop('CANCELLED');
    return at;
  }
  checkpoint(): number {
    const at = this.readWallTime();
    if (at - this.started >= this.durationMs || performance.now() - this.elapsedStart >= this.durationMs) this.stop('SEARCH_TIME_BUDGET');
    if (this.reason) throw new SearchStopped(this.reason);
    return at;
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.reason) throw new SearchStopped(this.reason);
    let onStop: (() => void) | undefined;
    const blocked = new Promise<never>((_resolve, reject) => {
      onStop = () => reject(new SearchStopped(this.reason!));
      this.controller.signal.addEventListener('abort', onStop, { once: true });
    });
    try {
      return await Promise.race([Promise.resolve().then(() => {
        if (this.reason) throw new SearchStopped(this.reason);
        return operation();
      }), blocked]);
    } finally { if (onStop) this.controller.signal.removeEventListener('abort', onStop); }
  }
  finish(): number { return this.readWallTime(); }
  close(): void { clearTimeout(this.timer); this.external?.removeEventListener('abort', this.onAbort); }
}

export function admitQuoteSet(raw: unknown): readonly PlanningQuote[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) throw new PlanningError('INVALID_QUOTE');
  const length = Object.getOwnPropertyDescriptor(raw, 'length')?.value;
  if (!Number.isInteger(length) || length < 0 || length > 16) throw new PlanningError('INVALID_QUOTE');
  if (Reflect.ownKeys(raw).length !== length + 1) throw new PlanningError('INVALID_QUOTE');
  const quotes: PlanningQuote[] = []; const identities = new Set<string>();
  // Read indexed data descriptors, never a provider-defined iterator/accessor.
  // Admit the entire batch before recording any passing candidate.
  for (let index = 0; index < length; index++) {
    const field = Object.getOwnPropertyDescriptor(raw, String(index));
    if (!field || !('value' in field) || field.enumerable !== true) throw new PlanningError('INVALID_QUOTE');
    const quote = normalizeQuote(field.value);
    const identity = `${quote.vendor}:${quote.id}`;
    if (identities.has(identity)) throw new PlanningError('INVALID_QUOTE');
    identities.add(identity); quotes.push(quote);
  }
  return Object.freeze(quotes);
}
