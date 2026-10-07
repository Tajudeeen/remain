# Remain evidence index

This is a private preparation packet, not a release certificate. The deployment snapshot is 2026-10-06 08:26:53 UTC. Evidence links are historical observations and must be rechecked at the release freeze.

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

The new submission/history checks will generate CI evidence after their commit. No result for that future run is invented here. The history check screens tracked text patterns in the checkout's available refs. It does not establish that secrets are absent from every surface.

## Missing proof

1. Confirm applicable operator/project/host eligibility and supply a supported held position. The owner has reported successful selected-stock market reads, not a funded position or full live feasibility.
2. Real stock-to-USDT RFQ quote, inspectable typed data and verified vendor field semantics.
3. Approved tiny BSC mainnet settlement, actual output, remaining units and independent reconciliation.
4. Owner-authored report, final video and confirmed registration/eligibility.
5. Owner-approved public source, final history/runner review and signed-out links.

Do not fill these gaps with fixture screenshots, a checksum, a mock token, unsupported issuer comparisons or an agent badge.
