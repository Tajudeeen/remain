# Local verification record

Date: 2026-10-06. Runtime: Node.js 24.19.0, npm 11.9.0.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 251 tests passed, zero failures/skips |
| `npm run build` | Passed |
| `npm run check:security` | Basic source policy passed |
| `npm run test:coverage` | Passed; use per-file Node coverage output for the planning module and prior source. Percentages do not establish live correctness |
| `npm audit --omit=dev` | Zero reported production dependency vulnerabilities; no runtime third-party dependencies |
| `npm run smoke:binance` with absent credentials | Expected blocked exit 1, CONFIG_MISSING, zero API observations, execution disabled |

Coverage percentages measure the synthetic suite, not real API correctness or production safety. The security check is not an audit. A successful read-only smoke would still not prove order semantics or settlement.

Remote CI status is obtained from the actual GitHub Actions run after pushing, rather than fabricated into this pre-push record. Live credentials, route feasibility, wallet execution and settlement remain unverified.

The 12 additional regression cases cover compliance codes 40301-40304 under HTTP 200, 403 and 503. Every case verifies one request, zero retries and no provider-message leakage. The real discovery rejection 40304 is recorded in docs/access-troubleshooting.md. A safe credential-missing discovery CLI run also writes a sanitized failure artifact and exits 1. Live access and the optional operator-provisioned runner remain unverified.

Milestone 1 adds 58 planning tests. Invariant checks include 10,000 percentage-floor cases and 50 independently exhaustively evaluated nonmonotonic quote landscapes, exact decimals, cash and stock fees, expiry, stale balances, quote identity, immutable caller snapshots, cancellation during requests and spacing, time/request budgets, safe failures and plan tampering. `npm run rehearse:plan` passed all three labelled synthetic scenarios. Remote CI also runs the rehearsal. No live cash target or signed order is proven.

Milestone 2 adds 42 input/HTTP rehearsal cases. Local typechecking, all 186 tests, built assets, browser JavaScript syntax and source checks passed. Coverage reports 100% line coverage for rehearsal plan/server with 89.09% server branch coverage; these percentages do not prove service safety. The local agent-browser installation hit certificate-trust differences, and a directly downloaded official Chrome still could not start the verifier because this execution environment forbids Unix sockets. This is a verification-environment limitation, not a passed browser test. The pinned browser script is included in GitHub CI; its actual remote result must pass before merging. Five responsive screenshots are retained as synthetic CI evidence.

Remote browser evidence: [branch run 37421082480](https://github.com/Tajudeeen/remain/actions/runs/37421082480) and [PR run 37421085996](https://github.com/Tajudeeen/remain/actions/runs/37421085996) passed the initial real-browser fixture flow. Screenshots at all five widths were downloaded and desktop/mobile views visually inspected. A later run reproduced the blocked-state timeout. The first defensive change snapshotted submitted fields and ignored duplicate input events. Branch checks then passed keyboard entry, downloads and response-race tests, but the PR check still failed. Its failure screenshot showed unchanged fields and an unsubmitted form, so the earlier input-notification explanation was insufficient. Global smooth scrolling is now removed from implicit focus/scroll operations; explicit navigation links alone animate. The browser test checks the native scroll mode and actual submit count after changing the target. Failure diagnostics retain event targets, submit count and page state. New branch and PR checks must both pass before merging.

Milestone 2's interaction fix subsequently passed [branch run 37422158229](https://github.com/Tajudeeen/remain/actions/runs/37422158229), [PR run 37422232368](https://github.com/Tajudeeen/remain/actions/runs/37422232368) and [main run 37422405594](https://github.com/Tajudeeen/remain/actions/runs/37422405594). Those runs verified the corrected real-browser flow, including keyboard entry, actual submissions, downloads, expiry, response races and five responsive widths.

Milestone 3 adds 65 order/settlement cases, for 251 total tests. Separate processes exercise actual SQLite files: competing plan reservations, conflicting revisions, identical concurrent retries, SIGKILL after commit and SIGKILL during an uncommitted write. All passed locally. The suite also checks plan revalidation, cancellation/fill races, unresolved outcomes beyond the provider's 30-minute deduplication window, status/transaction binding, local corruption, file boundaries, exact fees/balances/transfers, huge integers, incomplete/duplicate/removed logs, concurrent relevant wallet activity, confirmation waiting and reorg invalidation.

Local `npm run verify`, `npm run test:coverage` and `npm run rehearse:orders` passed. Coverage: order model and settlement 100% lines; journal 98.10% lines. These numbers do not establish authenticated chain evidence, finality, provider behavior or storage safety. No actual trade or network adapter was exercised. Remote milestone 3 status is obtained after pushing; it is not invented in this pre-push record. The existing browser regression suite remains a required remote check even though no UI was changed.


Milestone 4 adds strict TEST_FIXTURE proof receipts and independent verification. Branch run 37427029024 and PR run 37427034323 passed the complete suite, including `npm run rehearse:receipt` and the existing real-browser regression. PR #7 was squash-merged as commit `71fae6169e12d5e0829b19011758f0d692f70d4a`. Receipt verification recomputes fixture settlement and integrity bindings; it does not authenticate the evidence source or establish a live trade.

Milestone 5 adds deployment hardening for the fixture rehearsal: explicit host allowlisting, same-origin checks for HTTP/HTTPS, a narrow `/healthz` contract, validated public-bind startup configuration, a non-root container, a reusable external deployment smoke verifier and a manual GitHub deployment-smoke workflow. CI now builds the container, starts it with execution disabled and runs `npm run smoke:deployed` against the running service before browser regression. The connected Vercel context returned no deployable team, so no external Vercel URL is claimed. Gate 5 remains incomplete until a real public HTTPS deployment passes the same smoke verifier.

## Current preparation checks, 2026-10-06

Gate 5 subsequently passed on Netlify. Its exact deployed commit, HTTPS smoke and entry-flow browser evidence are recorded in [Netlify deployment evidence](netlify-deployment.md). The older pending statements above describe the state at the time of those checks.

Gate 6 adds 29 tests around the private fixture packet and tracked-history screen, bringing the suite to 315 tests. The packet rejects promoted live/release claims, invalid URLs, duplicate evidence, invalid timestamps, missing fields and artifact path traversal. The release-status CLI returns exit 1 for the internally valid but submission-blocked fixture packet.

History tests use real disposable Git repositories. They detect a deleted credential from an earlier commit without printing its value, detect a reused blob behind a historical tracked credential filename, and prevent shallow history from receiving a pattern pass. These are checks on the screening tool's behavior, not a comprehensive secret audit. The local history report covers only the refs present in the local checkout. CI now fetches full history and archives a sanitized report for its actual commit. Its remote result must pass before merge.

The packet and history tools perform no network requests, publish no source and submit no forms. The deployed frontend is unchanged in this preparation milestone, and its already verified build remains pinned through `[skip netlify]`.

## Request-boundary hardening, 2026-10-07

Gate 8's RFQ review passed [PR CI 37590665078](https://github.com/Tajudeeen/remain/actions/runs/37590665078)
and [push CI 37590661010](https://github.com/Tajudeeen/remain/actions/runs/37590661010),
with 576 local tests. Vendor signature semantics remain UNVERIFIED.

Gate 9 reproduced nine failures before changes, then passed 603 local tests,
coverage, full verification, history screening and shared-context HTTP smoke.
The data-record guard, Node server, Netlify adapter and deployment-wait module
each have 100% line coverage. Test scenarios include duplicate escaped keys,
enum coercion, getters/prototypes, stalled streams, aborted uploads, four
concurrent read deadlines, cleanup and old/unsafe deployment health.

[PR CI 37601135508](https://github.com/Tajudeeen/remain/actions/runs/37601135508),
[main CI 37601461126](https://github.com/Tajudeeen/remain/actions/runs/37601461126)
and [external HTTPS smoke 37601461211](https://github.com/Tajudeeen/remain/actions/runs/37601461211)
passed. The deployed build is `b241ad8d2f15cf7489a7079c04998bea87f5d8c4`.
The production browser also confirmed the normal form/accounting result.
See [deployment evidence](netlify-deployment.md#request-boundary-release-2026-10-07-0934-utc).
These checks establish fixture regression and transport behavior, not live
RFQ feasibility, trusted vendor enforcement, authenticated settlement or a
formal security audit.
