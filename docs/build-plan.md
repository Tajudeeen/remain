# Remain: winning build blueprint

Version: 1.0

Planning date: 6 October 2026

Submission deadline: 11 October 2026, 12:00 UTC
Tagline: Raise cash. Stay invested.

## 1. Executive decision

Remain will be a non-custodial cash-target execution product for tokenized stocks on BNB Smart Chain.

The user states how much stablecoin they need and the position they want to use. Remain works backward from that target, finds the smallest safe sell amount supported by current executable quotes, applies BellGuard policies, obtains the user's wallet signature, submits the RFQ order, reconciles the final balances, and produces a public proof receipt.

The sharp product difference is simple:

- A normal trading interface asks, “How much stock do you want to sell?”
- Remain asks, “How much cash do you need, and how much exposure must remain?”

The primary demo command is:

> Raise 25 USDT from my NVDA tokenized-stock position. Keep at least 70% invested, reject price impact above 0.5%, and warn me if the underlying market is closed.

The demo must end with a real BSC mainnet settlement, actual stablecoin received, the remaining stock balance, and an evidence receipt that another person can inspect.

## 2. Hard truths that change the design

### 2.1 The deadline controls the architecture

At planning time, roughly five days remain. A broad portfolio platform, lending layer, basket manager, autonomous fund, or multi-chain terminal would produce more surface area and less proof.

Remain will ship one complete path:

1. Connect a wallet on BSC mainnet.
2. Detect supported tokenized-stock balances.
3. Enter a stablecoin target and exposure floor.
4. Compute and guard a sell plan.
5. Approve only the required amount when approval is needed.
6. Sign and submit the RWA RFQ order.
7. Reconcile the fill.
8. Publish a verifiable receipt.

### 2.2 Binance's RWA reference price is not an official TradFi quote

The current RWA documentation describes `referencePrice` as a per-share converted value derived from the on-chain token price. Remain must not present it as independent proof of a premium or discount against a traditional exchange.

For this build:

- `tokenPrice` and `referencePrice` are displayed with source and timestamp.
- Market status is used as risk context.
- Weekend or closed-market execution requires a visible warning and user permission.
- Corporate action, maintenance, pause, and unsupported states are hard blocks.
- A true TradFi gap feature is deferred until an independent licensed or reliable market-data source is added.

### 2.3 Tokenized-stock execution is RFQ-based

The current Trading API states that equity and RWA routes return `executionMode=RFQ`. The flow is quote, build EIP-712 data, sign, submit with an idempotency key, then poll the order until a terminal state.

That means:

- There is no blind auto-broadcast from the server.
- The user's wallet signs the RFQ order.
- Submission retries must reuse the same `requestId`.
- Quote expiry is a normal state, not an exceptional crash.
- Transaction simulation and RFQ execution must be reported separately.
- The final proof comes from RFQ status, BSC transaction hash, and before-and-after balance reconciliation.

### 2.4 “Minimum” needs an honest definition

Remain cannot prove a globally minimal sell amount across every venue and every future market state. Quotes change, vendors change, and live liquidity is not perfectly monotonic.

The defensible claim is:

> Remain finds the smallest safe input discovered from current executable routes within the configured quote tolerance and policy limits.

The receipt records the solver attempts and the selected route, so the claim is inspectable.

## 3. Problem statement

Tokenized-stock holders sometimes need a fixed stablecoin amount for another on-chain action. Existing trading tools make them guess the stock quantity to sell. That creates four avoidable problems:

- They may sell too much and lose more exposure than intended.
- They may sell too little and still miss the cash target.
- They may execute during a closed, paused, or poor-liquidity state without understanding it.
- They receive a transaction hash, but no clear proof that their original cash and exposure rules were respected.

Remain turns the cash need into a bounded execution plan.

## 4. Target user and job

Primary user:

- A non-professional tokenized-stock holder on BSC who needs a specific amount of USDT without manually calculating stock quantity.

Secondary user:

- A treasury operator or on-chain agent that needs deterministic partial liquidation within a preserved-exposure rule.

Job to be done:

> When I need a precise amount of stablecoin, help me sell only the necessary part of a tokenized-stock position, stay inside my risk limits, and show me proof of what happened.

## 5. Product contract

### Inputs

- Connected wallet address.
- BSC mainnet, Binance chain ID `56`.
- Supported tokenized-stock contract selected from the wallet.
- Stablecoin output target. USDT is the first mandatory output asset.
- Minimum position to retain, expressed as percentage or token amount.
- Maximum price impact.
- Maximum slippage.
- Whether execution is allowed while the underlying market is closed.

### Outputs

- Proposed token amount to sell.
- Expected stablecoin output.
- Enforceable minimum output when exposed by the route.
- Expected position remaining.
- Quote vendor and expiry countdown.
- BellGuard decision with machine-readable reasons.
- RFQ order ID and state.
- BSC settlement transaction hash.
- Actual input, actual output, overshoot or shortfall, and final position.
- Tamper-evident proof receipt.

### Core invariants

1. The app never asks for or stores a private key or seed phrase.
2. Binance API credentials never reach the browser.
3. The selected sell amount never exceeds the wallet balance.
4. The projected remaining balance never falls below the user's floor.
5. The app never signs on the user's behalf.
6. A submitted order has one durable idempotency key.
7. A quote that has expired is never submitted.
8. A hard BellGuard failure cannot be bypassed by the UI or AI layer.
9. An approval is exact or narrowly bounded. Unlimited approval is forbidden.
10. The receipt clearly separates estimates, simulated results, submitted data, and confirmed on-chain results.

## 6. Explicit non-goals

These are excluded from the contest build:

- Lending or borrowing against stocks.
- Perpetuals, leverage, options, or margin.
- Multi-chain execution.
- Automated tax advice.
- Basket construction and portfolio rebalancing.
- Cross-issuer arbitrage.
- A general-purpose trading terminal.
- Custody, smart accounts, or storing user keys.
- Social features, leaderboards, referrals, and token issuance.
- Claims of official TradFi price parity.
- A chatbot that can bypass deterministic execution rules.

## 7. Winning strategy against the rubric

| Scoring area | Remain evidence |
| --- | --- |
| Technical implementation, 30% | RWA Data, Wallet, Trading, Transaction simulation where applicable, RFQ signing, idempotent order submission, status recovery, balance reconciliation, typed error handling, CI, and BSC mainnet proof. |
| Creativity, 25% | Cash-target liquidation reverses the normal trade input. The user defines needed cash and preserved exposure, while the solver finds the sell amount. |
| DevEx report, 25% | A timestamped engineering log begins with the first API call and includes latency, documentation gaps, exact errors, RFQ behavior, market-hours behavior, and concrete platform fixes. |
| Product and UX, 20% | One plain-language path, clear guard outcomes, a position split visualization, an approval preview, and a human-readable receipt. |
| Tie-break | Deep use of Binance Web3 APIs and a specific, reproducible DevEx report. |

The main target is a top-five placement. The secondary target is Best Use of Agentic Wallet. BNB Agent Studio is attempted only if the complete main path is already deployed and proven at least 36 hours before submission.

## 8. The user journey

### Screen 1: Position

The wallet connection is followed by a focused list of supported tokenized-stock holdings. Unsupported wallet assets do not pollute the interface.

Each holding shows:

- Issuer or platform.
- Ticker and token symbol.
- Token balance and estimated USD value.
- Token-to-share ratio.
- Underlying market state.
- Freshness timestamp.

Primary action: `Raise cash from this position`.

### Screen 2: Cash target

The main input is a large stablecoin amount field, followed by three guard controls:

- Keep at least X% invested.
- Reject price impact above X%.
- Allow execution outside regular underlying-market hours.

Defaults must be conservative. Advanced details stay collapsed until requested.

### Screen 3: BellGuard plan

This is the product's signature screen. It shows one horizontal position bar:

- The small cash slice leaving the position.
- The larger retained portion.
- The stablecoin target and minimum acceptable receipt.

The verdict has three states:

- Clear: all hard policies pass.
- Caution: execution is possible, but a soft risk needs acknowledgment.
- Blocked: a hard policy failed and no execute button is rendered.

The confirmation sentence must be specific:

> Sell up to 0.1184 NVDAon to receive at least 25.00 USDT. Your projected remaining position is 73.2%.

### Screen 4: Sign and settle

The interface shows the actual steps instead of a fake spinner:

1. Checking allowance.
2. Approving the exact amount if needed.
3. Preparing an RFQ order.
4. Waiting for wallet signature.
5. Submitting order.
6. Waiting for vendor.
7. Waiting for BSC confirmation.
8. Reconciling balances.

Refresh or reconnect must resume from the saved order state.

### Screen 5: Proof receipt

The receipt answers five questions immediately:

- What did the user request?
- What rules were active?
- What was quoted and signed?
- What settled on-chain?
- Were the target and retained-position rules met?

It links to the BSC explorer transaction and exposes a downloadable redacted JSON evidence bundle.

## 9. BellGuard policy engine

BellGuard is a deterministic domain module. The UI, the API routes, and the Agentic Wallet adapter all call the same engine.

### Hard blocks

- Wallet is not on BSC mainnet.
- Token is missing from the current supported RWA token set.
- Wallet address in the quote, signer, and intent do not match.
- Wallet balance is insufficient.
- Proposed sell amount violates the remaining-position floor.
- Output target cannot be reached inside the maximum sell amount.
- RWA status is market paused, maintenance, asset paused, unsupported, or a corporate-action block.
- Quote has expired or is too close to expiry for safe signing.
- Price impact exceeds the user's cap.
- Price impact is missing and the user did not explicitly allow an unreported value.
- Route vendor, spender, verifying contract, chain ID, or output token fails the allowlist checks.
- Required approval simulation fails.
- Wallet lacks enough BNB for required gas.
- Enforceable minimum output is below the cash target.
- Intent changed after the quote was created.

### Soft warnings

- Underlying market is closed, premarket, postmarket, or overnight.
- Reference data is older than the configured freshness threshold.
- Price impact is close to the user's maximum.
- Expected overshoot is larger than the normal tolerance.
- Quote changed materially from the previous planning quote.

### Decision precedence

`BLOCK` outranks `CAUTION`, and `CAUTION` outranks `CLEAR`. Acknowledging a caution creates a new signed intent version. It never mutates the original intent silently.

## 10. Cash-target solver

The Trading API takes an exact sell-token amount. Remain therefore needs an inverse quote solver.

### Solver method

1. Convert the requested stablecoin target to base units using the verified output-token decimals.
2. Compute the maximum sell input allowed by the remaining-position floor.
3. Use current RWA price only for the first estimate.
4. Request an executable RFQ quote for that sell input.
5. Calculate a conservative expected minimum using route output, slippage, fees, and any explicit minimum supplied by the swap response.
6. If the minimum is below target, scale the input upward proportionally and round up.
7. If the minimum is above target, search downward between the last failing and first passing inputs.
8. Stop after a strict request budget, time budget, or tolerance threshold.
9. Rebuild the final RFQ payload immediately because quote IDs live for roughly 30 seconds.
10. Run BellGuard again against the final payload before enabling the signature.

### Solver limits

- Maximum quote attempts per plan: 4.
- Maximum planning time: 8 seconds before a clean timeout.
- Quote operations remain below the documented endpoint rate limit.
- Currency math uses integer base units and decimal libraries, never JavaScript floating point.
- The selected input must be the lowest passing input found inside the tested interval, not a falsely claimed global minimum.

### Acceptance tolerance

- Minimum acceptable output must be at least the requested target.
- Desired overshoot is no more than the greater of 0.02 USDT or 0.15% of the target.
- If the solver cannot meet both target and exposure floor, it returns `TARGET_UNREACHABLE` with the maximum safe cash estimate.

## 11. System architecture

### Repository shape

```text
remain/
  apps/
    web/                  Next.js app, server routes, wallet UI
  packages/
    domain/               CashIntent, quote solver, BellGuard, state machine
    binance-client/       Typed Web3 API client and HMAC signer
    evidence/             Canonical evidence bundle and hashing
    ui/                   Remain design primitives
  contracts/
    src/RemainProofRegistry.sol
    test/
  docs/
    product-lock.md
    architecture.md
    threat-model.md
    devex-log.md
    runbook.md
    submission-evidence.md
  scripts/
    smoke-binance.ts
    verify-receipt.ts
```

### Trust boundaries

Browser:

- Holds the connected wallet session.
- Displays data and collects intent.
- Requests signatures from the wallet.
- Never receives Binance API secrets.

Remain server:

- Validates every request with strict schemas.
- Signs Binance Web3 API requests.
- Runs the quote solver and BellGuard.
- Stores redacted state and evidence.
- Never holds the user's signing key.

Binance Web3 API:

- Supplies RWA discovery, wallet balances, quotes, swap or RFQ payloads, transaction simulation, order submission, and order status.

BSC mainnet:

- Settles the vendor RFQ transaction.
- Holds the real token and stablecoin balances.
- Optionally anchors the final proof hash in `RemainProofRegistry`.

Database:

- Stores intent versions, sanitized quote metadata, idempotency keys, order states, and receipt bundles.
- Never stores API secrets, wallet private keys, seed phrases, or a reusable unexpired signature in public data.

## 12. State machine

```text
DRAFT
  -> PLANNING
  -> BLOCKED | CAUTION | READY
  -> APPROVAL_REQUIRED | SIGNATURE_REQUIRED
  -> SUBMITTING
  -> PENDING_VENDOR
  -> PENDING_ONCHAIN
  -> FILLED
  -> RECONCILED
  -> PROVED

Terminal failure states:
EXPIRED | CANCELLED | FAILED
```

Rules:

- A state transition is validated server-side.
- Replanning creates a new intent version.
- `requestId` is unique per execution attempt and reused only for retrying that same attempt.
- Duplicate clicks return the current order rather than creating a second order.
- Pending orders can resume after refresh.
- A terminal order cannot be submitted again.

## 13. API integration map

| Need | Binance module | Evidence captured |
| --- | --- | --- |
| Discover supported stock tokens | RWA token list and search | Contract, symbol, issuer, decimals, ticker, status, timestamps |
| Read stock and market state | RWA price and underlying market data | Token price, reference field with correct label, status, reason, next open time |
| Read wallet position | Wallet token balances | Raw balance, decimal balance, token contract, timestamp |
| Find sell size | Trading aggregated quote | Attempts, input, output, vendor, price impact, fees, quote time |
| Build execution | Trading swap endpoint | Execution mode, RFQ vendor, typed-data hash, exact approval data |
| Test approval | Transaction simulation | Predicted status, allowance changes, fail reason |
| Submit safely | RFQ order submit | Durable request ID, upstream order ID, initial status |
| Confirm settlement | RFQ order status | Terminal state, tx hash, actual input and output, filled time |
| Reconcile result | Wallet balances plus BSC receipt | Before and after balances, calculated deltas, confirmation height |

The server uses the documented `/build` prefix in both the request URL and HMAC signed path. Unit tests must lock this behavior because Binance identifies a missing prefix as the most common signature failure.

## 14. Data model

### `intents`

- `id`
- `wallet_address`
- `chain_id`
- `source_token`
- `output_token`
- `target_output_raw`
- `min_remaining_raw`
- `max_price_impact_bps`
- `max_slippage_bps`
- `allow_closed_market`
- `version`
- `intent_hash`
- `status`
- timestamps

### `quote_attempts`

- `intent_id`
- `attempt_number`
- `input_raw`
- `expected_output_raw`
- `conservative_output_raw`
- `vendor`
- `price_impact`
- `trade_fee`
- `quote_timestamp`
- `response_hash`

The raw quote ID is short-lived and private. It must not be placed in public logs.

### `orders`

- `intent_id`
- unique `request_id`
- unique upstream `order_id`
- `vendor`
- `typed_data_hash`
- `signature_hash`
- `status`
- `tx_hash`
- `actual_input_raw`
- `actual_output_raw`
- timestamps

### `receipts`

- public receipt ID
- intent hash
- evidence hash
- redacted JSON bundle
- settlement tx hash
- optional proof-registry tx hash
- verification result

## 15. Proof model

The receipt is a chain of evidence, not a marketing screenshot.

### Evidence bundle

1. User intent and policy version.
2. Starting wallet balances.
3. RWA asset identity and market-state snapshot.
4. Quote attempts with server timestamps and response hashes.
5. Selected RFQ route and typed-data hash.
6. Approval simulation result when approval was required.
7. Idempotency key hash and upstream order ID.
8. Terminal RFQ status and BSC transaction hash.
9. Final wallet balances.
10. Derived target result, overshoot or shortfall, and remaining exposure.

### Public verification

`/proof/{id}` will:

- Recompute the evidence hash.
- Confirm that the displayed JSON matches the stored hash.
- Link to the BSC transaction.
- Show whether actual stablecoin output met the target.
- Show whether the remaining position respected the floor.
- Label every value as requested, estimated, simulated, signed, or settled.

### Optional proof registry

`RemainProofRegistry` adds timestamp and tamper evidence. It does not claim that off-chain API data was truthful.

The contract:

- Accepts an intent hash, evidence hash, and execution transaction hash.
- Emits one indexed event.
- Stores one minimal record per evidence hash.
- Rejects zero hashes and duplicates.
- Accepts no BNB and holds no tokens.
- Makes no external calls.
- Has no proxy, admin upgrade, or withdrawal function.

This design removes reentrancy by construction. If any later contract version introduces an external call, it must use checks-effects-interactions, exact allowances, and `ReentrancyGuard`, followed by a new audit. The contest version will not introduce that risk.

## 16. Security and threat model

### Protected assets

- User tokenized stocks and stablecoins.
- Wallet signature intent.
- Binance Web3 API key and secret.
- Order idempotency and state integrity.
- Receipt correctness.
- Production availability during judging.

### Primary threats and controls

| Threat | Control |
| --- | --- |
| API secret leaks into browser or logs | Server-only environment access, log redaction, secret scanning, bundle inspection |
| HMAC signature mismatch | One canonical signer, raw path and body fixtures, clock checks, `/build` prefix tests |
| Replay or duplicate order | Unique nonce, durable `requestId`, intent hash binding, unique DB constraints |
| Stale quote | Server timestamp, 30-second TTL handling, signing safety window, mandatory requote |
| Malicious route or spender | Chain, token, vendor, verifying-contract, receiver, and spender allowlists |
| Unlimited approval | Exact approval amount only, allowance display, optional post-fill revoke guidance |
| Wrong wallet signs | Recover signer or verify wallet provider account before submission |
| UI changes after confirmation | Hash the normalized intent and compare before signature and submit |
| Price impact missing | Block by default or require an explicit policy override recorded in the intent |
| Corporate action or pause | Hard block from RWA reason codes |
| Server retries cause second trade | Same request ID for the same order, no automatic retry with a new ID |
| Database tampering | Canonical JSON hashing, receipt hash, optional on-chain anchor |
| Reentrancy | No custodial execution contract. Proof registry has no external calls or value transfer |
| Dependency compromise | Lockfile, minimal packages, audit, license check, Dependabot after submission |
| XSS or injection | React escaping, strict CSP, Zod validation, no raw HTML, fixed upstream endpoints |
| API abuse | Per-IP and per-wallet rate limits, request budget, timeouts, circuit breaker |
| Clock drift | Health check against server time, NTP on runtime, explicit timestamp error handling |

### Signature inspection

Before showing the wallet prompt, Remain verifies and displays:

- Chain ID.
- Signer and receiver.
- Source and output token contracts.
- Sell amount.
- Minimum or quoted output encoded in the order when available.
- Deadline.
- Vendor and verifying contract.

Unknown fields or a decoding mismatch block execution.

## 17. Error system

Every error has:

- Stable internal code.
- Safe user message.
- Developer detail stored in redacted logs.
- Trace ID.
- Whether retry is safe.
- The next recovery action.

### Required error classes

- `AUTH_KEY_INVALID`
- `AUTH_SIGNATURE_INVALID`
- `AUTH_CLOCK_DRIFT`
- `RATE_LIMITED`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_UNAVAILABLE`
- `UNSUPPORTED_ASSET`
- `WRONG_CHAIN`
- `INSUFFICIENT_POSITION`
- `INSUFFICIENT_GAS`
- `TARGET_UNREACHABLE`
- `MARKET_BLOCKED`
- `PRICE_IMPACT_EXCEEDED`
- `PRICE_IMPACT_UNKNOWN`
- `QUOTE_EXPIRED`
- `QUOTE_CHANGED`
- `APPROVAL_FAILED`
- `USER_REJECTED`
- `SIGNER_MISMATCH`
- `ORDER_ALREADY_SUBMITTED`
- `ORDER_EXPIRED`
- `ORDER_FAILED`
- `RECONCILIATION_MISMATCH`

### Retry rules

- Read-only API calls may retry twice with capped exponential backoff and jitter.
- HTTP 429 respects `Retry-After`.
- A stale quote triggers a new plan version, not a silent retry.
- Order submission retries reuse the same request ID.
- Wallet signature prompts never retry automatically.
- A terminal RFQ failure never auto-creates a new order.
- Polling slows down over time and returns a resumable pending state instead of hanging.

## 18. Testing strategy

### Unit tests

- Decimal and base-unit conversion.
- Upward rounding for target protection.
- Solver convergence and request budget.
- Exact boundary at the target.
- Remaining-position floor boundary.
- Insufficient-position path.
- Quote reversal or non-monotonic response handling.
- Missing price impact.
- Closed market versus paused asset.
- BellGuard decision precedence.
- Intent normalization and hashing.
- Order-state transitions.
- Error mapping.
- HMAC signing with fixed vectors and exact raw bodies.

### Property tests

- Solver never returns input above the maximum safe sell amount.
- Passing input always satisfies the conservative output target in the supplied quote set.
- Normalization produces the same hash for semantically identical intent data.
- State machine cannot move from terminal back to submitting.
- Duplicate evidence hashes cannot be anchored.

### Contract tests

- Valid proof emits the exact event and stores the record.
- Zero values revert.
- Duplicate evidence hash reverts.
- Sending BNB reverts.
- Fuzzed hashes cannot overwrite existing records.
- Static analysis confirms no external call, delegatecall, selfdestruct, or payable entry point.

### Integration tests

- RWA token search and list parsing.
- Wallet balance lookup.
- Quote response with multiple vendors.
- Quote expiry.
- RFQ payload parsing.
- Approval transaction building and simulation.
- Idempotent order submission.
- Pending, filled, failed, expired, and cancelled polling.
- Balance reconciliation.
- API rate limit and 5xx behavior.

Fixtures are recorded and redacted. Live integration tests are opt-in and never run on pull requests without protected credentials.

### End-to-end tests

- Read-only demo without wallet funds.
- Connected-wallet planning flow.
- Wrong-chain recovery.
- User rejects approval.
- User rejects RFQ signature.
- Page refresh during pending order.
- Filled order produces a receipt.
- Receipt verifier detects modified JSON.
- Mobile widths at 320 and 375 pixels.
- Tablet and desktop layouts.
- Keyboard-only navigation and visible focus.
- No clipped confirmation or signing button.

### Mainnet proof test

Use a dedicated contest wallet with only the small amount needed for the demo.

1. Fund minimal BNB gas and USDT.
2. Acquire a small supported tokenized-stock position if the wallet has none.
3. Run a small Remain sale.
4. Capture upstream order ID, BSC transaction hash, actual token sold, actual USDT received, and final stock balance.
5. Verify the public receipt from a clean browser.
6. Repeat once only if the first flow exposes a fixable product defect.

## 19. UI and brand system

### Visual direction

Remain should look like a controlled liquidity instrument, not a template crypto dashboard.

- Base background: BNB black `#0B0E11`.
- Primary action and proof accents: BNB yellow `#F0B90B`.
- White for primary type.
- Muted warm gray for secondary information.
- Green appears only for confirmed safety or settlement.
- Red appears only for hard blocks or failure.
- Dense financial numbers use tabular figures.
- Motion is short, purposeful, and disabled when reduced motion is requested.

The official BNB logo is not modified or blended into Remain's identity. Any official mark is used only beside accurate wording such as “Built on BNB Chain,” subject to the published brand rules.

### Original logo brief

The Remain logomark has no text. It is an asymmetric geometric core with one small segment separated from a larger protected body. The detached segment represents the exact cash slice. The larger body represents the position that remains.

Constraints:

- Original silhouette at 16, 32, and 128 pixels.
- Flat vector geometry.
- No gradient, shadow, coin, candlestick, shield, robot, or copied Binance diamond.
- One-color and reversed versions.
- Yellow-on-black primary application.
- SVG source, optimized SVG, PNG exports, favicon, and social avatar.

### Interface signature

The retained-position bar is the visual center of the product. It moves from current position to proposed cash slice to confirmed final state. It must carry the story without a judge reading a paragraph.

Required pages:

- `/` position and cash-target flow.
- `/activity` durable execution history for the connected wallet.
- `/proof/[id]` public proof receipt.
- `/evidence` judge-facing integration and mainnet evidence index.

No empty analytics dashboard, fake chart, filler KPI, or dead navigation item is allowed.

## 20. Agentic Wallet layer

Agentic Wallet is added after the deterministic web flow passes on mainnet.

### Purpose

It lets a user say:

> Raise 25 USDT from NVDAon, keep at least 70%, and stop if impact exceeds 0.5%.

### Boundary

The AI converts language into a typed `CashIntent`. It cannot choose a looser policy, approve a hard BellGuard failure, or submit a changed order.

### Deliverables

- A `remain-raise-cash` skill following Binance Skills Hub conventions.
- Use of tokenized-securities information and Agentic Wallet execution primitives.
- A preview-only command.
- A confirmed execution command.
- One tested transcript linked to a proof receipt.
- Clear setup and uninstall instructions.

### BNB Agent Studio decision

Agent Studio is only added if every mandatory release gate has passed by 9 October, 00:00 UTC.

The only justified Studio feature is `Wait until safe`:

- Register a blocked or deferred cash intent.
- Recheck market status and quote conditions on a bounded schedule.
- Execute only inside the signed policy and Agentic Wallet limits.
- Notify the user when it executes or expires.

If identity, runtime, x402 self-funding, and a real end-to-end action cannot all be demonstrated, this feature is cut. A shallow Agent Studio badge would weaken the entry.

## 21. Developer Experience report

The report starts during the first API spike, not after development.

For every integration record:

- Date and time.
- Endpoint and documentation URL.
- Time from opening docs to first success.
- Request purpose.
- Asset and market state.
- Latency.
- HTTP status and Binance business code.
- Exact failure message.
- Reproduction steps.
- Expected behavior.
- Actual behavior.
- Workaround.
- Suggested documentation or API fix.

Required report sections:

1. Authentication and the `/build` signing trap.
2. Token discovery and issuer differences.
3. Wallet balance behavior.
4. Quote depth, vendors, latency, impact, and expiry.
5. RFQ typed-data and settlement behavior.
6. What Transaction API can and cannot simulate for RFQ routes.
7. Behavior during regular and closed underlying-market states.
8. Error quality and recovery.
9. Agentic Wallet setup and execution.
10. A proposed first-call developer journey.

The report includes raw numbers and specific page references. Polite filler is removed.

## 22. Milestone discipline

Every milestone uses a dedicated branch named `milestone/NN-short-name`.

The sequence is fixed:

1. Write acceptance criteria.
2. Implement the smallest complete change.
3. Add or update tests.
4. Run formatting, lint, typecheck, unit tests, integration tests, and build.
5. Run the milestone-specific security check.
6. Update documentation and evidence.
7. Review the diff for secrets and unrelated files.
8. Commit with a scoped message.
9. Push the branch.
10. Confirm remote CI is green.
11. Confirm the preview or deployed behavior.
12. Record the commit SHA and evidence link.
13. Merge only after every gate passes.

No next milestone starts while a previous gate is red. A blocked feature is either fixed or explicitly cut from the locked scope and documented.

### Global definition of done

A milestone is done only when:

- Its acceptance tests pass locally and in CI.
- The production build succeeds.
- No secret or private credential is committed.
- New user-facing states have loading, empty, success, failure, and recovery behavior.
- New transaction paths have duplicate-submit protection.
- New trust assumptions appear in the threat model.
- README and DevEx log reflect the real behavior.
- The branch is pushed and its final commit SHA is recorded.

## 23. Build milestones

### Milestone 0: Contest and feasibility lock

Deliverables:

- Registration and geographic eligibility confirmed.
- API project and protected credentials available.
- Product lock and non-goals committed.
- BSC contest wallet chosen.
- Smoke script proves authentication.
- Live RWA token list returns BSC assets.
- One wallet-balance call succeeds.
- One tokenized-stock to USDT quote returns an RFQ route.
- One swap build returns EIP-712 data.
- DevEx timer and log begin.

Gate:

Do not scaffold the full UI until the RFQ feasibility spike passes. If no supported BSC sell route can be produced, raise the issue in the builder Telegram with exact request and redacted response, then choose another supported token. Do not fake the route.

### Milestone 1: Trusted repository foundation

Deliverables:

- TypeScript workspace and Next.js application.
- Domain, Binance client, evidence, and UI packages.
- Foundry contract folder.
- Environment schema and safe `.env.example`.
- CI for format, lint, typecheck, test, build, and secret scan.
- Error boundary, structured logging, trace IDs, and health endpoint.
- Initial architecture and threat-model documents.

Gate:

Fresh clone, install, test, and production build must pass from documented commands.

### Milestone 2: Typed Binance Web3 client

Deliverables:

- Canonical HMAC signer.
- Typed clients for RWA, Wallet, Trading, Transaction, and RFQ order status.
- Runtime response validation.
- Error-code normalization.
- Timeouts, safe retries, rate-budget control, and redacted telemetry.
- Fixed test vectors for path encoding, query order, raw body, nonce, and timestamp.
- Read-only live smoke suite.

Gate:

All fixtures pass, live read calls pass, the `/build` signature behavior is proven, and no credential appears in client bundles or logs.

### Milestone 3: Domain engine

Deliverables:

- `CashIntent` schema.
- Integer money and token arithmetic.
- Quote solver with strict attempt and time budgets.
- BellGuard rules and reason codes.
- Execution state machine.
- Canonical intent and evidence hashing.
- Unit and property tests for every invariant.

Gate:

The solver and guard engine pass boundary, fuzz, missing-data, and adversarial quote tests without network access.

### Milestone 4: Wallet discovery and planning product

Deliverables:

- BSC wallet connection.
- Supported RWA holding discovery.
- Cash-target form.
- Remaining-exposure and impact controls.
- Market-status handling.
- Live solver integration.
- BellGuard plan screen with position split.
- Mobile, keyboard, loading, empty, and failure states.

Gate:

A funded wallet and an empty wallet can both complete their intended read-only flows on the deployed preview. No execute control appears for a blocked plan.

### Milestone 5: RFQ execution

Deliverables:

- Allowance check.
- Exact approval building and simulation.
- Approval wallet flow.
- Final quote refresh.
- Typed-data inspection and hash.
- EIP-712 wallet signature.
- Idempotent RFQ submission.
- Durable polling and refresh recovery.
- Terminal-state handling.
- Post-fill balance reconciliation.

Gate:

One small BSC mainnet sale fills from the deployed app. Its target, actual output, remaining balance, order ID, and transaction hash all reconcile.

### Milestone 6: Proof receipt

Deliverables:

- Canonical redacted evidence bundle.
- Public receipt page.
- Downloadable JSON.
- Independent verification script.
- Minimal `RemainProofRegistry` contract and tests.
- Verified BSC mainnet deployment if the contract gate passes.
- Optional proof anchor for the demo fill.

Gate:

A clean browser can verify the receipt. Modifying one evidence field breaks verification. Contract source is verified, and the README states exactly what the anchor proves and does not prove.

### Milestone 7: Brand and experience finish

Deliverables:

- Original textless Remain mark.
- Full icon export set.
- Final BNB-aligned visual system.
- Purposeful motion and reduced-motion mode.
- Responsive audit at 320, 375, 768, 1024, and 1440 pixels.
- Copy audit for financial and technical accuracy.
- No dead links, fake values, filler cards, or hidden primary action.

Gate:

The happy path is understandable without narration, and the four-minute demo can be recorded without editing around broken states.

### Milestone 8: Agentic Wallet adapter

Deliverables:

- Remain skill.
- Natural-language to typed-intent mapping.
- Preview and confirmed execution paths.
- BellGuard reuse.
- One live or fully credible tested transcript.
- Setup guide and evidence.

Gate:

The agent cannot weaken policy values, skip user confirmation, change the wallet, or submit a second order. Its successful action links to the same proof system as the web UI.

### Milestone 9: Break and rebuild pass

Attack the deployed product with:

- Wrong chain.
- Wrong signer.
- Empty wallet.
- Insufficient stock.
- Insufficient BNB.
- Unsupported token.
- Market pause.
- Corporate action.
- Closed market warning.
- Missing impact.
- Impact over limit.
- Quote expiry during wallet prompt.
- Two rapid clicks.
- Repeated request ID.
- API 429, 500, and 503.
- Clock drift.
- Wallet rejection.
- Page refresh during every execution state.
- Tampered receipt.
- Database or RPC outage.

Every discovered issue gets a failing regression test before the fix.

Gate:

No critical or high-severity issue remains. Medium issues are fixed unless they are clearly documented, non-exploitable limitations.

### Milestone 10: Release and submission

Deliverables:

- Production deployment.
- Public repository.
- Mainnet proof index.
- Professional README.
- Complete DevEx report.
- Demo script and backup recording under four minutes.
- Submission form draft reviewed against every field.
- Links tested from a signed-out browser.
- Deployment kept stable through the judging window.

Gate:

Another person can open the repo, deployed app, video, report, explorer transaction, and proof receipt without private access or verbal help.

## 24. Deadline schedule

| Deadline | Required state |
| --- | --- |
| 6 Oct, 12:00 UTC | Milestone 0 passed. Real BSC RWA RFQ route proven. |
| 6 Oct, 23:59 UTC | Milestones 1 and 2 passed. Trusted client and CI ready. |
| 7 Oct, 18:00 UTC | Milestone 3 passed. Solver and BellGuard fully tested. |
| 8 Oct, 12:00 UTC | Milestone 4 passed. Read-only product deployed. |
| 9 Oct, 00:00 UTC | Milestone 5 passed. Small mainnet sale proven. |
| 9 Oct, 18:00 UTC | Milestones 6 and 7 passed. Proof and polished UX ready. |
| 10 Oct, 06:00 UTC | Milestone 8 passed or formally cut. |
| 10 Oct, 18:00 UTC | Milestone 9 passed. Release candidate frozen. |
| 11 Oct, 06:00 UTC | Video, DevEx report, README, and form final. |
| 11 Oct, 09:00 UTC | Submit, three hours before lock. |

If Milestone 5 misses 9 October, the proof contract and Agent Studio are cut immediately. The working live trade, receipt, DevEx report, and video remain protected.

## 25. Observability and production operations

### Health checks

- Application build version and commit SHA.
- Database connectivity.
- Binance signed read-only call.
- Clock skew status.
- BSC RPC connectivity.
- No secret values in response.

### Structured events

- `intent.created`
- `solver.attempted`
- `bellguard.blocked`
- `quote.expired`
- `approval.simulated`
- `approval.confirmed`
- `rfq.signed`
- `order.submitted`
- `order.status_changed`
- `order.reconciled`
- `receipt.verified`

Logs contain hashes and trace IDs instead of secrets or raw wallet signatures.

### Deployment safeguards

- Production environment variables are validated at startup.
- Preview and production use separate databases and credentials.
- Production is pinned to a known commit.
- Migrations run explicitly, not silently during page load.
- A rollback target is recorded before each production deploy.
- The deployed link and API stay awake and accessible throughout judging.

## 26. README and demo structure

### README opening

1. One sentence: what Remain does.
2. The user problem.
3. A 30-second visual flow.
4. Live app and proof links.
5. Real mainnet transaction.
6. Binance API modules used.
7. Architecture and security.
8. Local setup.
9. Tests and verification.
10. Known limits and DevEx report.

### Four-minute video

0:00 to 0:20: The problem. “I need 25 USDT, but trading apps make me guess how much stock to sell.”

0:20 to 0:45: Connect wallet and select a real tokenized-stock holding.

0:45 to 1:20: Enter cash target and preserved-exposure rule. Show the position split.

1:20 to 1:50: BellGuard explains a market state and the exact policy checks.

1:50 to 2:40: Sign, submit, and show the real RFQ state transition.

2:40 to 3:15: Show actual USDT received, stock remaining, and BSC transaction.

3:15 to 3:40: Open the proof receipt and verify its hash.

3:40 to 4:00: Show Agentic Wallet command if complete, then close with the tagline.

No architecture lecture occurs before the working product is visible.

## 27. Final acceptance criteria

Remain is submission-ready only when all of these are true:

- At least one supported bStock, Ondo, or xStock is central to the real flow.
- The complete flow runs on BSC mainnet.
- A small live amount has settled.
- The app uses live RWA, Wallet, Trading, and RFQ status data.
- Transaction simulation is used where technically applicable and described honestly where it is not.
- The cash-target solver uses integer arithmetic and tested bounds.
- BellGuard blocks hard failures in every interface.
- A duplicate action cannot create a second order.
- API credentials stay server-side.
- A public receipt reconciles target, fill, and remaining position.
- The UI works on mobile and desktop.
- The logo is original, textless, and visually distinct from the BNB logo.
- The DevEx report contains concrete observations, measurements, and fixes.
- Repo, deployed app, video, receipt, and explorer links work while signed out.
- The submission is sent at least three hours before the deadline.

## 28. First coding action

Coding begins with Milestone 0, not with UI scaffolding.

The first commit will contain:

- `docs/product-lock.md`
- `docs/devex-log.md`
- `.env.example`
- `scripts/smoke-binance.ts`
- Tests for HMAC signing and the required `/build` prefix

The first external proof is a redacted smoke result showing:

- Successful authentication.
- BSC RWA asset discovery.
- Wallet balance query.
- Tokenized-stock to USDT quote.
- `executionMode=RFQ`.
- Successful EIP-712 RFQ payload construction.

Only after that proof passes do we build the product around it.

## Sources

- Hackathon page: https://www.bnbchain.org/en/hackathons/tokenized-stocks
- Hackathon scoring and submission details: https://www.bnbchain.org/en/blog/bnb-hack-tokenized-stocks-edition-with-binance-web3-wallet
- Binance Web3 API overview: https://web3.binance.com/en/dev-docs/introduction
- Authentication: https://web3.binance.com/en/dev-docs/authentication
- RWA Data: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data
- Trading API: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api
- Transaction API: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api
- Wallet API: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/wallet-api
- Agentic Wallet tokenized securities: https://developers.binance.com/en/docs/products/agentic-wallet/use-cases/trading/stock-trading
- Binance Skills Hub: https://github.com/binance/binance-skills-hub
- BNB Chain brand guidelines: https://www.bnbchain.org/en/brand-guidelines
