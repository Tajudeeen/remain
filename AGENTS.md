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
- No secrets, private keys, seeds, raw signed payloads or wallet balances in committed files or public logs.
- Never sign, approve, submit, broadcast or make live trades without explicit user approval.
- Read-only quote/build endpoints are permitted for feasibility, never order/submit.
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
