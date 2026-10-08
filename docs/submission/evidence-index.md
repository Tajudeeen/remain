# Remain evidence index

Gate 16 covers a strict CoW profile, encrypted recovery and two-RPC reconciliation. [Execution invariants and setup](../execution.md) record scope and limits. Generated accounts, payloads and RPC responses in tests are fictional regression evidence. No new actual vendor response, signature, approval, transaction or settled mainnet receipt has been added to this pack.

This is a private preparation packet, not a release certificate. The current deployment snapshot is 2026-10-08T23:50:00Z. Evidence links are observations and must be rechecked at the release freeze.

The current prepared execution release spans [PR #37](https://github.com/Tajudeeen/remain/pull/37), [PR #38](https://github.com/Tajudeeen/remain/pull/38) and [PR #39](https://github.com/Tajudeeen/remain/pull/39). Runtime commit `94cbb6d569cc4cbb6837e1f73f84d56963e06b00` is served by deploy `6ac82ad344082b00084e11f6`. [Main CI 37861084082](https://github.com/Tajudeeen/remain/actions/runs/37861084082) passed 835 tests, coverage, full reachable-history screening, terminal rehearsals, non-root container smoke and real-browser checks. [Exact-build HTTPS smoke 37861084077](https://github.com/Tajudeeen/remain/actions/runs/37861084077) matched the runtime and confirmed public financial actions remain unavailable. Thirty-one additional regressions cover signing export, exact economic binding, signature recovery, encrypted recovery, uncertain submission, invalidation, settlement accounting and replacement settlements after withdrawing disputed evidence. The setup/runbook and trust limits are in [execution.md](../execution.md), with a durable [sanitized verification record](../observations/execution-release-20261008.json). This runtime is pinned in packet.json. No actual vendor payload or mainnet trade was exercised.

The production page was visually inspected at the earlier Gate 16 code release. CI checked the final page across five widths. The workspace and controlled browser disconnected before a final interactive production recheck, so no final screenshot or local metadata recheck is claimed. Remote CI verifies this evidence-only update separately.

The earlier unsigned cash-order review release is [PR #35](https://github.com/Tajudeeen/remain/pull/35), commit `3b33a2ec7e30657c5ce55cacd8ee96f01d90d869`, deploy `6ac79779d351d20008dd702b`. [Main CI 37782952276](https://github.com/Tajudeeen/remain/actions/runs/37782952276) passed 804 tests, coverage, container and complete real-browser checks. [Exact-build HTTPS smoke 37782952215](https://github.com/Tajudeeen/remain/actions/runs/37782952215) matched the revision and confirmed the public review endpoint remains unavailable. Twenty-six new regressions cover fixed selection, fresh economics, unsigned build binding, timestamps, cancellation, isolation and actual-page tampering/races. The controlled browser explicitly reviewed a fictional 0.5 FIXon input with a 1 USDT estimate, rejected a false signature-authorization label, recovered and cleared results on intent change. The production page showed no account, local setup required and locked preview/review/trading. See [release evidence and screenshot](../netlify-deployment.md#cash-order-review-release-2026-10-08-1315-utc). This is a historical runtime, superseded by Gate 16. No live proof gate is closed.

The earlier cash-target preview release [PR #33](https://github.com/Tajudeeen/remain/pull/33), deploy `6ac78352f1239d00084828ed`, passed 778 tests and [HTTPS smoke 37772634474](https://github.com/Tajudeeen/remain/actions/runs/37772634474). Its [release record](../netlify-deployment.md#cash-target-preview-release-2026-10-08-1149-utc) preserves bounded cash estimates, retained-floor checks and the separate preview boundary.

The earlier selected-position release [PR #31](https://github.com/Tajudeeen/remain/pull/31), deploy `6ac736a6d0023800080e7926`, passed 743 tests and [HTTPS smoke 37737251713](https://github.com/Tajudeeen/remain/actions/runs/37737251713). Its [release record](../netlify-deployment.md#selected-position-release-2026-10-08-0622-utc) preserves position paging, exact decimal conversion and the reproduced freshness regression.

The earlier cash-search release [PR #29](https://github.com/Tajudeeen/remain/pull/29), deploy `6ac6e53bb10d420008bc3d1a`, passed 711 tests and [HTTPS smoke 37708537529](https://github.com/Tajudeeen/remain/actions/runs/37708537529). Its [release record](../netlify-deployment.md#cash-search-release-2026-10-08-0035-utc) preserves the reproduced search defects and fictional 25-cash/75-retained production observation.

The earlier prepared-integration release [PR #27](https://github.com/Tajudeeen/remain/pull/27), [main CI 37659754692](https://github.com/Tajudeeen/remain/actions/runs/37659754692) and [HTTPS smoke 37659754659](https://github.com/Tajudeeen/remain/actions/runs/37659754659) established the separate account/read-only setup surface. Its [production setup evidence](../netlify-deployment.md#prepared-integration-release-2026-10-07-1732-utc) remains historical. The new release preserves its locked public inspection and unverified execution gates.

## Earlier observations

The following table preserves the 2026-10-06 deployment observations and later owner-reported market evidence. These earlier deployments are superseded by the current fixture release above.

| Claim | Evidence | Limit |
| --- | --- | --- |
| Hosted planning demo works | [Netlify demo](https://remain-cash.netlify.app/), commit `b3089947eec2a670e7ef6140d22622239094139e`, deploy `6ac4b08671bf7a60c694865b` | TEST_FIXTURE, no Binance credentials or execution |
| Exact 25 cash / 75 units retained | [HTTPS smoke 37436134911](https://github.com/Tajudeeen/remain/actions/runs/37436134911) | Fictional zero-fee 1:1 rate, not vendor quotes |
| Entry flow and planner regression tested | [Main CI 37435789151](https://github.com/Tajudeeen/remain/actions/runs/37435789151) | Fixture tests; browser screenshots are CI artifacts with finite retention |
| Floor, paused market and impact checks | `tests/bellguard.test.ts`, `tests/solver.test.ts`, `tests/rehearsal.test.ts`, same CI | No live enforcement assertion |
| Durable local journal and receipt checks | `tests/order-journal.test.ts`, `tests/receipt.test.ts`, terminal rehearsals in CI | Not hosted persistence or authenticated chain settlement |
| Binance discovery rejected | [Live discovery 37413704037](https://github.com/Tajudeeen/remain/actions/runs/37413704037) | 40304; no successful stock list, quote or build |
| Local discovery also rejected | Owner-provided run `ac3580b8-1e20-4ad5-b8f7-9a895b6f8dda`, 05:23:34 UTC | Reported by owner, not independently executed here |
| Selected AALon catalog identity and fresh market read reported passed | [Sanitized owner observation](../observations/owner-market-a2a2b549-f749-4779-892e-cd204f37252d.json), run `a2a2b549-f749-4779-892e-cd204f37252d`, 2026-10-07 06:55 UTC | Copied owner local report, not independently authenticated; market-only, no holding/RFQ/build/settlement |
| Source remains private | GitHub repository and Netlify deployment metadata checked on 2026-10-06 | Judges cannot yet access private source |

The history check screens tracked text patterns in the checkout's available refs. It does not establish that secrets are absent from every surface.

## Missing proof

Receipt workspace release: [PR #20](https://github.com/Tajudeeen/remain/pull/20), [main CI 37587576556](https://github.com/Tajudeeen/remain/actions/runs/37587576556) and [HTTPS smoke 37587725694](https://github.com/Tajudeeen/remain/actions/runs/37587725694). Deploy `6ac5f4b5735bab000820b4e7` serves commit `a1e382a62f0310b4c751ca51aedb4984422d6c12`. This establishes fixture receipt consistency and transport behavior only. No live proof gate is closed.

Earlier request-boundary release, 2026-10-07: [PR #23](https://github.com/Tajudeeen/remain/pull/23),
[main CI 37601461126](https://github.com/Tajudeeen/remain/actions/runs/37601461126)
and [exact-build HTTPS smoke 37601461211](https://github.com/Tajudeeen/remain/actions/runs/37601461211).
Deploy `6ac611f78be59c00081c215e` serves commit `b241ad8d2f15cf7489a7079c04998bea87f5d8c4`.
603 tests pass. The public fixture rejects ambiguous planner fields and keeps
execution disabled. It is superseded by Gate 10's fixture release above.

1. Confirm applicable operator/project/host eligibility and supply a supported held position. The owner has reported successful selected-stock market reads, not a funded position or full live feasibility.
2. Real stock-to-USDT RFQ quote, inspectable typed data and verified vendor field semantics.
3. Approved tiny BSC mainnet settlement, actual output, remaining units and independent reconciliation.
4. Owner-authored report and confirmed registration/eligibility. A video is optional and recommended.
5. Owner-approved public source, final history/runner review and signed-out links.

Do not fill these gaps with fixture screenshots, a checksum, a mock token, unsupported issuer comparisons or an agent badge.
