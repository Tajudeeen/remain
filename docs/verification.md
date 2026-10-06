# Local verification record

Date: 2026-10-06. Runtime: Node.js 24.19.0, npm 11.9.0.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 86 tests passed, zero failures/skips |
| `npm run build` | Passed |
| `npm run check:security` | Basic source policy passed |
| `npm run test:coverage` | Passed; source line 100%, branch 90.57%, function 94.44% as measured by Node |
| `npm audit --omit=dev` | Zero reported production dependency vulnerabilities; no runtime third-party dependencies |
| `npm run smoke:binance` with absent credentials | Expected blocked exit 1, CONFIG_MISSING, zero API observations, execution disabled |

Coverage percentages measure the synthetic suite, not real API correctness or production safety. The security check is not an audit. A successful read-only smoke would still not prove order semantics or settlement.

Remote CI status is obtained from the actual GitHub Actions run after pushing, rather than fabricated into this pre-push record. Live credentials, route feasibility, wallet execution, UI and settlement remain unverified.

The 12 additional regression cases cover compliance codes 40301-40304 under HTTP 200, 403 and 503. Every case verifies one request, zero retries and no provider-message leakage. The real discovery rejection 40304 is recorded in docs/access-troubleshooting.md. A safe credential-missing discovery CLI run also writes a sanitized failure artifact and exits 1. Live access and the optional operator-provisioned runner remain unverified.
