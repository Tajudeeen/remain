# Product lock

Name: Remain. Tagline: Raise cash. Stay invested.

One user, one held tokenized-stock position, one USDT target, one bounded sale, one reconciled receipt. BSC mainnet only, spot only. No custody, borrowing, portfolio allocator, derivatives or autonomous trades.

## Demo contract

1. Connect a wallet holding one supported stock wrapper.
2. Ask for a small USDT amount while retaining a configured stock-token floor.
3. Inspect the cash target, proposed raw input, remaining token quantity, venue, expiry and market context.
4. BellGuard blocks paused/maintenance/unknown status, stale quotes, invalid identities or a breached floor. Closed-market permission must be visible and explicit.
5. User reviews exact approval if required, then semantically verified typed data.
6. Submit once using a durable idempotency key, monitor and reconcile settlement.
7. Receipt separates the original intent, estimates, signature, order state and independently observed settlement.

The hero is the cash-to-partial-sale interaction and inspectable proof. The main UI is a cash composer, preserved-exposure visualization, guard verdict and receipt timeline, rather than a generic trading dashboard.

## Design direction

Dark graphite, warm off-white and Binance-inspired yellow. One distinctive abstract no-text mark about preserved exposure and a small released slice, legible at favicon size. No copied Binance logo or implication of official endorsement. The owner authorized a synthetic planning interface on 2026-10-06 while access remains blocked. It includes an original generated mark, a responsive cash composer and retained-position visualization. Wallet UI and live feasibility still require their own evidence.

## Architecture constraints

Server-only Binance signing. Browser-owned wallet signatures. Fixed chain and token identities. Integer/fixed-point arithmetic. Quote and build payload bound to wallet, chain, exact amounts, receiver, spender, nonce and deadline before any signature. Durable order state. No need for a custom smart contract unless existing RFQ enforcement cannot satisfy a necessary invariant.

The future cash solver must use executable minimum output after fees, bounded request budgets and honest near-minimum claims. It cannot guarantee the stock market price when the underlying market is closed. Approval requirements and minimum-output enforceability are vendor-specific findings, not assumptions.

Milestone 1 now implements the standalone arithmetic/policy/search contract against an injected provider. It minimizes observed total stock debit including stock fees. Its metadata is a provider assertion and does not replace the still-pending real Binance order adapter. The live access gate continues to block execution.
