# Local verification record

Date: 2026-10-06. Runtime: Node.js 24.19.0, npm 11.9.0.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 186 tests passed, zero failures/skips |
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

Remote browser evidence: [branch run 37421082480](https://github.com/Tajudeeen/remain/actions/runs/37421082480) and [PR run 37421085996](https://github.com/Tajudeeen/remain/actions/runs/37421085996) both passed all checks, including the real-browser fixture flow. Screenshots at all five widths were downloaded and desktop/mobile views visually inspected. The initial run timed out while waiting for a blocked state. Adding stage diagnostics and failure capture produced two successful runs without changing the interface code, so the first timeout is not evidence of an identified/fixed application bug. The final revision additionally verifies keyboard entry and downloaded checksum integrity; inspect its new CI result before merging.
