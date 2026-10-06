# Security boundaries: milestone 0

## Assets and trust

Binance API secret stays in the Node process or protected workflow secrets. Public wallet state is still privacy-sensitive. Binance/RPC data is external evidence, never assumed truthful. An unsigned RFQ payload can request dangerous permissions despite valid JSON shape.

The current client performs read-only GET requests at one fixed Binance origin. `swap` is allowed only for unsigned payload building. There is no allowance, wallet signature, POST order or transaction-broadcast capability.

## Protections and limits

| Threat | Protection now | Remaining work |
| --- | --- | --- |
| Signed URL differs from sent URL | Fixed origin; exact wire path and query; vectors | Real authenticated smoke |
| Redirect leaks credentials | Redirect policy error | Host and platform secret rotation runbook |
| Unbounded upstream work | 8-second timeout, 2 MB body limit, max 3 read attempts, max 10 holdings pages | Rate-budget load tests and observability |
| Sensitive upstream errors | Safe error taxonomy; no raw messages | Logging review after server/UI implementation |
| Malformed or stale response | Strict envelope, clock-skew limit, input binding | Live schema observations |
| Opaque/wrong-chain RFQ | Structural domain inspection, vendor allowlist | Semantic binding of every executable field and real EIP-712 hashing |
| Changed wallet or quote | No signing allowed | Recheck balances, chain, expiry, minimum output, recipient, allowance and nonce at signing |
| Duplicate execution | No submission allowed | Durable state/idempotency, crash recovery, vendor order reconciliation |
| Reentrancy | No contracts or asset-moving methods exist | If contracts become necessary: CEI, guard, malicious token tests, allowance lifecycle, Foundry fuzz/invariants and external review |

Every future signature needs exact chain, token, amount, receiver, spender/verifying contract, fee, expiry and nonce checks. A vendor-specific adapter must extract these from typed data. It must bind the built order back to the selected quote and user intent. A SHA-256 JSON digest is never used to sign.

## Evidence safety

Automated tests use synthetic fixtures and no live credentials. Live reports whitelist endpoint paths, latency, response hashes and safe errors. They omit request queries, wallet, balances, quote IDs, raw responses and typed data. Local evidence directory and credential files are ignored. Discovery emits only whitelisted public token metadata. GitHub manual artifacts have seven-day retention.

## Break and rebuild loop

For every later feature: state the invariant, reproduce a counterexample, add a failing test, implement the smallest fix, rerun the entire gate, commit and check remote CI. An incident that affects signing or fills disables execution until reproduced and verified fixed.

The basic source scanner does not detect all secret forms, supply-chain attacks or logical bugs. Current tests are not formal verification. No independent audit has occurred. Production release requires a separate operational, legal/eligibility and security go/no-go.
