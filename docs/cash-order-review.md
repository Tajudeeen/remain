# Cash candidate to unsigned order

Gate 15 connects the cash-target preview to an explicit unsigned review. The owner requested trading activation on 2026-10-08. The current evidence establishes an owner-reported holding-free market read, not a real stock sale or the meaning of a vendor signature. Trading therefore remains disabled.

## Working path

On the opted-in loopback server, Explore cash target reads the selected position, market and bounded estimates. A qualifying candidate enables Review unsigned order. The browser derives an immutable selection from the validated, still-fresh preview. It sends the original cash intent, selected raw stock input, venue, previous estimated output and observed cash decimals. It never sends a quote ID or signed payload.

The local service rereads the catalog, raw holding and selected market, recomputes the retained floor, then requests one fresh quote for that exact input. All returned routes are validated atomically. Exactly one route must match the selected venue. Its estimated cash must meet the target and its reported impact must fit the limit. A smaller fresh holding, precision drift, closed-market permission failure, missing venue, ambiguous venue or broken economics stops before the build. Another venue or input is never substituted.

The unsigned build uses that fresh quote ID, account and exact tokens/amount. Approval generation and automatic slippage are disabled. Its chain, tokens, amount, estimated output, decimals, fee/tax observations, venue and reported impact must agree with the selected quote. The bounded EIP-712 structure reviewer then checks inspectability. This performs no simulation, signature, approval, order submission or broadcast.

The response shows the previous and fresh estimate separately and marks any change. It includes only projected observations and a SHA-256 JSON artifact checksum. The raw order, quote ID and auxiliary signature data never reach the browser. The checksum is neither an EIP-712 hash nor an authenticated attestation.

## Invariants

- One immutable cash selection, one refreshed quote request, one unsigned build request, no application-level retry or venue fallback.
- Fresh positive raw holding, exact integer cap, explicit closed-market permission and precise reported-impact comparison are required again.
- One 12-second wall/monotonic deadline covers the full operation. Observations have a 15-second freshness cap. Cancellation interrupts even an uncooperative injected reader.
- The browser validates the complete result before displaying any fields. Input/account/page changes and the original candidate's expiry abort review and clear its values. A separate review timer can only shorten the display lifetime.
- HTTP accepts duplicate-free exact JSON within 4 KiB, with the existing body deadline, same-origin loopback checks, concurrency limit and rate limit. Results are no-store and ephemeral.
- The public Netlify review endpoint returns 503 before reading the private request body. Credentials and holdings are never hosted or persisted by this flow.
- Execution, signed economic semantics, minimum-output enforcement, fees and ownership remain unverified. The reviewer has no submitter or wallet signing capability.

## Evidence needed to activate trading

Use a wallet that actually holds a supported BSC tokenized stock. On the owner's computer, use working, newly rotated developer credentials, `REMAIN_LOCAL_READ_ONLY=true`, `npm run dev` and `http://127.0.0.1:3000/#live`. Explore a small cash target and explicitly review its unsigned order. An empty holding cannot complete a sale review.

A successful local structural result still needs a real vendor profile backed by an inspectable payload and primary vendor documentation. That profile must bind the account/receiver, chain and verifying contract, stock/cash identities, total stock debit including fees, enforced minimum net cash, spender/allowance scope, nonce and deadline. Approval analysis, durable submission/recovery and independent settlement need their own implementation and evidence. The agent has not performed those financial actions.

Binance's [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), checked 2026-10-08, describes RFQ quoting, unsigned build, EIP-712 signing and order submission as distinct steps. Estimated output and an unsigned router result do not establish signed enforcement. No fictional vendor schema is used as live authorization.

## Verification

Local and remote release results are recorded in [milestone status](milestone-status.md) and [deployment evidence](netlify-deployment.md). Tests exercise exact selection, changed estimates, fresh balance shrinkage, market permission, absent/ambiguous venues, precision drift, route/build tampering, opaque data, deadlines, cancellation, request isolation and browser races. Synthetic typed data intentionally contains an unrelated amount in one regression. Structure can pass while economic semantics stay UNVERIFIED, demonstrating why this result cannot authorize a signature.
