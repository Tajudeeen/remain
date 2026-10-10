export declare function serviceSnapshot(market: unknown, execution: unknown): Readonly<{market: string; execution: string; marketLabel: string; executionLabel: string}>;
export declare function statusJSON(endpoint: string, signal?: AbortSignal, fetcher?: typeof fetch): Promise<unknown>;
