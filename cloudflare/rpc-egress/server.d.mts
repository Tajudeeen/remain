export declare function handleRpc(body: unknown, config: string, fetcher?: typeof fetch): Promise<{ status: number; contentType: string; data: Buffer }>;
export declare function startServer(config?: string): import('node:http').Server;
