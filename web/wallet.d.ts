export type WalletState = Readonly<{ status: 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'WRONG_CHAIN' | 'CHANGED' | 'ERROR'; address: string | null; chain: string | null; error: string | null }>;
export type AccountProvider = {
  request(input: { method: string }): Promise<unknown>;
  on?(event: string, listener: () => void): void;
  removeListener?(event: string, listener: () => void): void;
};
export function walletSession(provider: AccountProvider | undefined, onChange: (state: WalletState) => void, options?: { timeoutMs?: number }): {
  readonly state: WalletState; connect(): Promise<WalletState>; forget(): void; destroy(): void;
};
