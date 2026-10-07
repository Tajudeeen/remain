# Remain engineering rules

Remain is a cash-target tokenized-stock product with BellGuard risk checks. The repository is private until its owner explicitly approves public release.

## Gated work

- Read docs/milestone-status.md and docs/product-lock.md before changes.
- Each milestone requires implementation, adversarial tests, local verification, a commit, a remote push and green remote checks. Live gates need live evidence too.
- Fixture tests are not live integration evidence. Keep TEST_FIXTURE labels.
- Milestone 0's live gate remains blocked until a real stock-to-USDT RFQ route is observed with inspectable typed data. Never represent a blocked live gate as passed.
- The owner requested continuation on 2026-10-06 after the live rejection was explained. Milestone 1 may proceed as a standalone, tested planning engine with an injected quote provider. Its live integration remains blocked by gate 0. This authorization does not enable execution or bypass access restrictions.
- The owner again requested continuation on 2026-10-06 after local discovery also returned 40304. Milestone 2 may build a clearly labelled synthetic planning interface and local rehearsal server. No live wallet connection or Binance adapter is enabled. Fixture UI tests do not close gate 0.
- Do not add live execution, agents or smart contracts before the feasibility gate is satisfied.
- The owner's next-milestone request authorizes milestone 3 as a standalone TEST_FIXTURE order journal and settlement rehearsal. It has no submission, signing, wallet, RPC or Binance execution adapter. Synthetic reconciliation does not satisfy live settlement evidence.\n- The owner's 2026-10-06 request to continue authorizes milestone 4 as a TEST_FIXTURE proof-receipt and independent-verifier layer only. It may recompute fixture settlement and integrity checks, but must not add wallet, signing, approval, submission, RPC or live execution.
- The same continuation request authorizes milestone 5 fixture hardening, portable deployment packaging, health checks, runbooks and deployed TEST_FIXTURE smoke verification. Public deployment must keep execution disabled and must not receive Binance credentials, wallet keys or signing material.
- The owner explicitly chose Netlify and approved browser setup on 2026-10-06. Gate 5 may add a tested stateless fixture function adapter, import this private repository into the existing Netlify team and deploy the synthetic demo. This does not authorize public source release or live execution.
- The owner's next-milestone request after Gate 5's entry experience authorizes Gate 6 private submission preparation, evidence indexing and tracked-history pattern screening. Keep actual submission readiness blocked. The final DevEx narrative must be owner-authored per the organizer's rules. Public source release, form submission and live financial actions remain separate decisions.
- No secrets, private keys, seeds, raw signed payloads or wallet balances in committed files or public logs.
- Never sign, approve, submit, broadcast or make live trades without explicit user approval.
- Read-only quote/build endpoints are permitted for feasibility, never order/submit.
- The owner's 2026-10-07 continuation authorizes a holding-free selected-stock market diagnostic. It may read current stock identity and fresh token-specific market data only. It requires no wallet, balance, sell amount, quote or build and cannot satisfy the held-position RFQ gate.
- The owner's subsequent continuation authorizes Gate 7 fixture receipt inspection in the app and stateless HTTP adapter. Uploads are bounded, duplicate-key parsing precedes verification, raw bodies are never persisted or logged, and a consistency pass remains UNAUTHENTICATED. No live wallet, signing, order, RPC or Binance client is added to the hosted service.
- Run npm run verify and npm run test:coverage before proposing a merge.
- Any changed signing, wallet or settlement code needs adversarial tests and documented invariants.
- Preserve user changes. Use apply_patch. No force-push or destructive git operations.
- Do not claim audited, formally verified, production ready or contest winning from a test pass.

## Product honesty

- Binance RWA referencePrice is derived from token data. It is not independent exchange price evidence.
- A SHA-256 JSON digest is an evidence checksum, never an EIP-712 signing hash or proof of truth.
- RFQ simulation and AMM transaction simulation are separate capabilities.
- Exposure floors bound a planned token balance. Future concurrent wallet activity can invalidate it.
- "Minimum" means the smallest safe observed candidate within the bounded solver search, not a global optimum.
- Binance-inspired colors do not imply Binance sponsorship or endorsement.
