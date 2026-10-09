export type RpcEgressEnv = {
  REMAIN_RPC_EGRESS_ENABLED?: string;
  REMAIN_RPC_PRIMARY?: string;
  REMAIN_RPC_SECONDARY?: string;
  REMAIN_RPC_EGRESS?: { fetch(request: Request): Promise<Response> };
};
export declare function makeRpcEgressFetcher(env: RpcEgressEnv, directFetch?: typeof fetch): typeof fetch;
