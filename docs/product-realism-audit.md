# Product-realism audit

Audited on 2026-10-09. This document separates **actual data paths** from test fixtures and service prerequisites. UI changes alone cannot establish a successful order.

| Area | User-facing behavior | Evidence / remaining limit |
|---|---|---|
| Home | Displays service status fetched from the deployed, same-origin live-read and execution status APIs. Does not display a fabricated holding or cash balance. | Status means configured/unavailable, **not** authenticated, executable or settled. A timeout produces unknown. |
| Wallet | An explicit user action connects an injected BSC wallet. Changing or clearing the account clears previous position and preview state. | Account selection alone does not prove off-chain authorization. No private key is read or stored. |
| Token balance | Explicit ERC-20 `balanceOf` and `decimals` reads via the user's own BSC wallet RPC. Optional block-pinned balance snapshots can be downloaded and replayed against another RPC; reorg mismatches fail closed. | RPC agreement is **not** a cryptographic storage proof, stock classification, price, wallet signature, or completed trade. |
| Supported stock discovery | An authorized server can return a validated BSC RWA catalog. Invalid or stale catalogs and unknown issuer identities are rejected. | Requires `REMAIN_HOSTED_READ_ONLY=true` and authorized, Functions-scoped Binance credentials. No substitute/fictional ticker is injected on failure. |
| Wallet holdings | With the supported RWA catalog loaded, the user can explicitly scan up to 8 contracts per request. Only positive, observed balances are shown. Failed RPC reads remain unknown. Selecting a holding supplies only a token contract to the live workflow. | A partially scanned catalog is labelled as partial. It does not represent all wallet assets or infer dollar valuation. Provider RPC rate limits may reduce scan coverage. |
| Cash-first RFQ | The existing bounded cash search uses a fresh supported position and market and attempts live quotes with user-chosen cash and retention limits. | Server capability and actual holdings/quotes are mandatory. No cached/fabricated quote fallback or guarantee of sellable size. |
| Unsigned review | Independently rechecks the exact candidate and reports changed quote estimates and typed-data structure. | A signed debit, verified fees, minimum payout, nonce and settlement must be established before real execution. |
| Sale | The sale screen queries `/api/execution/status` and does not unlock on URL configuration alone. The separately deployed durable backend owns signing challenges, CoW verification, approvals, submission idempotency, persisted journal and chain reconciliation. | A stateless Netlify function is never represented as the durable execution backend. Activation needs an eligible provider, working HTTPS backend, reviewed pins and dual RPCs, and explicit user confirmations. |
| Demo planner and fixture receipts | Kept as separately labelled routes for educational scenarios, deterministic tests and checking synthetic receipt/accounting math. | The demo can be invented and cannot be promoted into live proof. |
| Landing and footer | Show current service status and a live-wallet-first route. No fixed 75/25 portfolio illustration or fake personal holdings. | Availability is unknown when status requests fail. |

## Required production verification

A connected wallet, configured upstream API and successful CI are not substitutes for a funded end-to-end mainnet trade. Before claiming a production execution flow, collect an eligible holder's authorized test, exact vendor payload, verified contract pins and fees, fresh wallet and market state, explicit wallet signature, durable idempotency record, upstream order observation, and independently reconciled BSC settlement. Keep sensitive user-specific evidence private.

No requirement for the **builder** to personally own a tokenized stock is imposed by this code. Eligible users choose and authorize their own wallet and positions.

For server activation see [hosted live service](hosted-live-readonly.md) and [execution operations](live-operations.md).
