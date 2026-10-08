# Remain evidence index

This is a private preparation packet, not a release certificate. The current deployment snapshot is 2026-10-08T00:39:20Z. Evidence links are observations and must be rechecked at the release freeze.

The latest cash-search release is [PR #29](https://github.com/Tajudeeen/remain/pull/29), commit `1a3d8d64d481acda34516473d2ef7488f2754a90`, deploy `6ac6e53bb10d420008bc3d1a`. [Main CI 37708537517](https://github.com/Tajudeeen/remain/actions/runs/37708537517) passed all 711 tests, coverage, container and complete real-browser checks. [Exact-build HTTPS smoke 37708537529](https://github.com/Tajudeeen/remain/actions/runs/37708537529) passed against that commit and confirmed hosted inspection stays unconfigured. The production browser confirmed the 25-cash/75-retained fixture and rejection of a 40-cash target with a 70-unit floor. Eight defects were reproduced and 18 search-boundary regressions added. See [release evidence and screenshot](../netlify-deployment.md#cash-search-release-2026-10-08-0035-utc). This is the deployment pinned in packet.json. No live proof gate is closed.

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
4. Owner-authored report, final video and confirmed registration/eligibility.
5. Owner-approved public source, final history/runner review and signed-out links.

Do not fill these gaps with fixture screenshots, a checksum, a mock token, unsupported issuer comparisons or an agent badge.
