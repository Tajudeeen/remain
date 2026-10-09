# Verifiable BSC token balance evidence

Remain has two distinct types of financial evidence:

1. **Live ERC-20 wallet observation:** a provider read of the balance of an identified token contract at a recorded BNB Smart Chain block.
2. **Real sale settlement:** a signed, eligible order with independently reconciled BSC transaction and transfer evidence. This is a separate, stricter process; it is not proven by a wallet-balance snapshot.

## Capture a live block snapshot

Open [your wallet workspace](https://remain-cash.netlify.app/#live), select **Connect BSC wallet**, choose a compatible wallet on chain **56**, and paste or select an ERC-20 token contract. Use **Capture block-pinned balance** under the wallet.

Remain first asks the wallet RPC for a finalized block (where supported), falls back to the latest canonical block, and pins its block number for `balanceOf(owner)` and `decimals()`. It checks the same block hash again after the reads and ensures the account and chain did not change. An RPC timeout, wrong chain, reorg or invalid return is a failure, never a fabricated balance.

**Download private evidence** writes JSON locally; no evidence file is uploaded to the Remain server. The file records `owner`, `token`, `chainId=56`, `raw`, `decimals`, `blockNumber`, `blockHash`, `source`, and a client-observed timestamp. The timestamp comes from the user's device and isn't authenticated. Anyone with the JSON can learn the address and recorded holding size, so do not post it without the holder's permission.

## Recheck instead of trusting screenshots

1. In a BSC wallet browser, use **Recheck a local balance evidence JSON** to choose the private file.
2. Where possible, select a different independent wallet RPC or wallet provider to avoid trusting the RPC that originally created the file.
3. Tap **Recheck evidence against BSC**. Remain requests the canonical header at the saved block number and replays the two ERC-20 calls using the exact recorded block tag.
4. `RPC_REPLAY_MATCH` means the RPC returned the same block hash, token balance, and decimal precision. `BLOCK_MISMATCH` or `BALANCE_MISMATCH` must **not** be promoted as valid evidence. Unsupported historical calls/timeouts remain unverified, not an automatic pass.

A matching RPC replay is **not a cryptographic storage proof or chain-consensus proof**. A malicious shared RPC could lie, and reorgs or archive availability matter. For independently provable token state, use trusted archive nodes and authenticated storage-trie proofs with verified block headers. This module does not pretend to implement those.

A positive arbitrary ERC-20 balance does not imply the contract is a legitimate tokenized stock, has a live market, a conversion rate into USDT, or is sellable to any platform. For those separate steps, see [real market activation](hosted-live-readonly.md) and [durable execution](live-operations.md).

## Production evidence matrix

| Feature | Can be reproduced without the builder owning stock? | Activation or proof requirement |
|---|---|---|
| Wallet connection / BSC network verification | Yes | User connects their own EIP-1193 wallet |
| Token balance observation | Yes | Supported wallet provider and a real token address |
| Block-pinned evidence recheck | Yes | Archive-capable BSC RPC that answers at the recorded block |
| Supported-stock recognition | Yes, once configured | Approved Binance Web3 credentials and live catalog |
| Cash quote / cash retained floor | Yes, with an eligible user's holdings | Fresh live market RFQ and on-chain position, neither invented |
| Wallet-signed sale / settlement | Only with a consenting eligible stock holder | Authenticated durable trading backend, user signature and independently reconciled mainnet receipt |

## Operator prerequisites left outside code

The deployed market API still needs `REMAIN_HOSTED_READ_ONLY=true`, `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY` in Netlify Functions-scoped settings. Recheck real catalog and RFQ responses before declaring operational readiness. Real trades require a separately hosted durable HTTPS executor and upstream venue/contract verification. The user must explicitly authorize any approval, signature and submission.

WalletConnect QR and external-app pairing (separate from mobile wallet **in-app browser handoff**) requires a real Reown project identifier, the audited wallet protocol SDK bundled locally and a tested relay policy. It cannot be demonstrated without real project configuration and wallets.
