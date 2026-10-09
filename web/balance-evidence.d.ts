export interface TokenBalanceEvidence {kind:'REMAIN_TOKEN_BALANCE_EVIDENCE';version:1;mode:'LIVE_READ_ONLY';source:'WALLET_RPC_BLOCK_PINNED';chainId:56;owner:string;token:string;blockNumber:string;blockHash:string;raw:string;decimals:number;observedAt:string;}
export declare function decodeWord(value: unknown): bigint;
export declare function validateTokenBalanceEvidence(value: unknown): TokenBalanceEvidence;
export declare function captureTokenBalanceEvidence(provider: any,token:string):Promise<TokenBalanceEvidence>;
export declare function recheckTokenBalanceEvidence(provider:any,evidence:unknown):Promise<{status:'BLOCK_MISMATCH'|'BALANCE_MISMATCH'|'RPC_REPLAY_MATCH';message:string}>;
