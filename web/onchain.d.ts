export declare const ADDRESS: RegExp;
export declare function formatUnits(raw: bigint, decimals: number): string;
export declare function readWalletToken(provider: { request(input: { method: string; params?: unknown[] }): Promise<unknown> }, token: string): Promise<Readonly<{ owner: string; token: string; raw: string; decimals: number; formatted: string; chainId: number; source: string; observedAt: string }>>;
