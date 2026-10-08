# Prepared sale execution

The owner authorized the remaining engineering on 2026-10-08. This release adds a prepared CoW BSC sell profile, explicit browser wallet confirmations, encrypted durable recovery and two-RPC reconciliation. It is not a passed live feasibility gate, a security audit or evidence of a funded mainnet transaction. No real credential, wallet, approval, signature or trade was used to build or test it.

Netlify serves the sale-review interface but returns `EXECUTION_SETUP_REQUIRED` for financial operations. Its function never imports the execution store or credentials. Existing planner and receipt-inspection views remain fictional. A separately configured Node 24 service can run the prepared path with durable storage. An activation flag is operator configuration, not proof that the vendor is usable.

## Supported profile

One held BSC stock token, one EOA owner, BSC USDT with 18 on-chain decimals, one CoW full-fill sell order. Domain `Gnosis Protocol`, version `v2`, chain 56, settlement `0x9008d19f58aabd9ed0d60971565aa8510560ab41`. Relayer `0xc92e8bdf79f0507f65a392b0ab4667716bfe0110`. All twelve ordered GPv2 fields must match the documented profile.

Stock debit is `sellAmount + feeAmount`. The receiver is the owner, `buyAmount` meets the cash target, both balances use `erc20`, partial fills are disabled and `appData` is zero. A nonzero hash can carry unreviewed hooks or fee semantics and is rejected. A real Binance payload might therefore be unsupported even with an available RFQ. No real payload has been observed in this environment. Other RFQ vendors, AMM calldata, smart wallets, buy orders, internal balances, beacon proxies and unknown proxy implementations are unsupported.

CoW identity is the real EIP-712 digest plus owner and uint32 expiry, forming the 56-byte UID. SHA-256 evidence checksums have no signing authority. No invented nonce field is added. Binance submission `quoteId` is the swap response's `rfq.orderId`, not the quote-cache ID.

Authoritative references checked 2026-10-08:

- [Binance trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api)
- [CoW contract addresses](https://docs.cow.fi/cow-protocol/reference/contracts/core)
- [GPv2 order schema](https://github.com/cowprotocol/contracts/blob/main/src/contracts/libraries/GPv2Order.sol)
- [Settlement implementation and events](https://github.com/cowprotocol/contracts/blob/main/src/contracts/GPv2Settlement.sol)

## Invariants

| Boundary | Check | Failure behavior |
| --- | --- | --- |
| Session | Single-use signed challenge binds owner, origin, purpose and 60-second expiry. Bearer session lasts ten minutes. | No private order access without owner authentication. Restart requires fresh login. |
| HTTP | Exact host/origin, JSON-only bounded body, duplicate rejection, four in-flight requests and bounded request budget. | Fixed redacted errors. No reflected provider bodies or credentials. |
| Position | Fresh catalog, balance and market. Two independent RPCs agree on balance, allowance and on-chain token decimals. | Unknown, stale, changed or disputed facts stop the flow. |
| Contract | Pinned runtime SHA-256 bytecode hashes and exact EIP-1967 implementation address/hash. Beacon slot must be zero. | Upgrades and unknown contracts stop execution. An observed hash is not source review. |
| Economics | Exact total stock debit, capped fee, owner receiver, cash minimum, snapshot floor and short full-fill validity. | Reject the whole payload before a wallet order prompt. |
| Approval | Exact relayer and debit. Insufficient nonzero allowance requires zero-reset first. | Each approval is a separate wallet transaction. Wait, discard the unsigned draft and refresh. No unlimited approvals. |
| Signature | Browser rechecks wallet/chain/fields. Server recovers the exact EOA owner. Quote lifetime is 30 seconds. | Stale signatures cannot be submitted by Remain. Signing and submitting require separate clicks. |
| Submission | UUID and encrypted signature persist before the network call. SQLite compare-and-swap prevents competing attempts. | Timeout or malformed response becomes `UNKNOWN`. No automatic retry, new UUID or fallback venue. |
| Storage | AES-256-GCM, random IV, request-ID authenticated data, HMAC indexes, private files, WAL and FULL synchronisation. | Wrong key or tampering blocks reads. Volume and key backups remain operator responsibilities. |
| Settlement | Both RPCs agree on canonical block, exact Trade UID/economics, transfers, before/after balances and twelve confirmations. | Missing, concurrent, removed, duplicated or insufficient evidence stays waiting/mismatched. Failed rechecks withdraw success. |
| Invalidation | Owner explicitly sends `invalidateOrder(bytes)`. Both RPCs confirm unique owner/UID event, revoked authority and twelve confirmations. | Revocation may follow a fill. Unresolved orders stay locked for investigation. |

The retained-token floor is a preflight and receipt invariant. Standard CoW orders do not encode remaining-wallet-balance conditions. Other wallet transfers, orders, token restrictions or upgrades before settlement can invalidate it. Reconciliation refuses to certify a breach. Absolute enforcement needs a separately reviewed on-chain guard profile, which this release does not implement. Visible remaining quantity uses the reviewed snapshot until actual balances reconcile.

There is no custom fund-holding contract or server wallet key. CoW's settlement uses its documented solver restrictions and reentrancy guard. Remain's durable submit claim handles application concurrency, not a new on-chain defence. BNB approval/invalidation gas is separate from the USDT target and confirmed in the wallet.

Two RPC operators provide a cross-check, not consensus proof. Historical calls and canonical block-hash calls must work. Concurrent transfers in the same settlement block are rejected conservatively. Deep reorgs, compromised RPCs, token mechanics and key/volume loss remain risks. A reorg after a wallet lock was released withdraws the old receipt but cannot undo a later wallet action. Use one service replica on one local durable volume. Distributed orchestration/throttling is outside this profile.

## Local setup after live review

1. Keep working credentials and public RPC configuration in ignored `.env.local`. Never reuse credentials shared in chat. No wallet private key is requested.
2. Confirm an actual supported holding and perform the local read-only cash preview/unsigned review. Inspect a real vendor payload against every profile field. If domain, fee rules, hooks or vendor differ, engineer that profile before activation.
3. Configure two independently operated HTTPS BSC RPCs with historical calls. Different hostnames are checked but do not prove independent operators.
4. Run `npm run inspect:contracts -- <stock-contract>`. Output stays `UNVERIFIED`. Review source, deployed bytecode, proxy implementation, upgrade authority and token behavior independently. Save only reviewed pins as the JSON array for `REMAIN_CONTRACT_PINS`.
5. Generate a private storage key using `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`. Enter it locally as `REMAIN_STORAGE_KEY` and securely back it up. Set a reviewed maximum raw stock fee. Never commit either secret or journal.
6. Only after actual payload and pin review, explicitly set `REMAIN_COW_PROFILE_REVIEWED` and `REMAIN_EXECUTION_ENABLED` true. For local use set exact origin `http://127.0.0.1:3000`, run `npm run dev`, and open `/#trade`.
7. Sign the session challenge, enter stock/cash intent, find a candidate and review the order. Approve only if needed. After approval confirmation, discard the unsigned draft and refresh. Sign the fresh order, then submit separately. Save the UUID before submission. Every financial prompt is the owner's decision.

Loopback read-only inspection cannot run on a public bind. Authenticated execution has its own cash composer. Public execution requires an exact HTTPS origin. Browser sessions stay in memory and clear on wallet/page changes.

## Recovery and independent checking

Unknown outcomes retain the original UUID/signature across restart. Sign in again and “Load original order.” Poll an observed platform ID or supply an independently located settlement hash. Recovery requires the exact UID and all accounting checks. The server never guesses a vendor lookup endpoint or creates a replacement sale.

For invalidation, confirm its exact wallet transaction and paste the hash into “Check invalidation.” Confirmed revocation leaves `INVALIDATED` with the sale locked until settlement is understood. A provider failure/expiry/cancellation label cannot revoke an escaped signature. Automatic historical no-fill/expiry unlock is not implemented. Preserve the journal and investigate rather than deleting it to clear a lock.

Download a private receipt and run `npm run verify:chain-receipt -- <local-json-file>`. The verifier reconstructs intent and signed schema, then rereads both RPCs. Downloaded success labels are not trusted. The live CLI rejects fixture receipts and prints bounded status/reasons, not balances or signatures.

## Persistent HTTPS packaging

`compose.execution.yml` supplies a non-root Node service, named durable volume, read-only root filesystem and Caddy HTTPS edge. Caddy is pinned to a version tag, not an immutable image digest. Review and pin image digests before a production release. This packaging has not been deployed with live credentials or a wallet.

On an eligible approved host, privately create `.env.execution` from the example, configure exact HTTPS origin and allowed hostname, and set `REMAIN_PUBLIC_HOST` for Compose substitution/DNS. Keep local read-only inspection false. Start `docker compose -f compose.execution.yml up --build -d`. Never use `down -v` against the journal. Use SQLite's backup mechanism and protect the database backup and key separately. Crash-safe WAL does not protect a lost disk.

`/healthz` describes the fixture planner. `/api/execution/status` reports configured availability separately. Neither establishes a live evidence pass. TLS, host eligibility, RPC independence, source review, restore drills and funded mainnet validation remain release tasks.
