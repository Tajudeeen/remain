# Milestone status

Updated 2026-10-06. Submission target: 2026-10-11 12:00 UTC per the supplied brief. Official eligibility, deadline, rubric and deliverables must be confirmed before public submission.

| Gate | Implementation | Evidence needed | Status |
| --- | --- | --- | --- |
| 0: API feasibility | Signing client, discovery, read-only stock-to-USDT RFQ harness, CI | Local suite, remote CI, real authenticated route with inspectable payload | Code implemented; live discovery BLOCKED by Binance compliance code 40304 |
| 1: Cash solver and BellGuard | Pending | Property tests, bounded quote search, enforced minimum output and retained-token floor | BLOCKED by gate 0 |
| 2: Original interface and wallet flow | Pending | Browser tests, mobile/accessibility, signature field verification | BLOCKED |
| 3: Order durability and settlement | Pending | Idempotency, cancellation/expiry, reconciliation, approved tiny live trade | BLOCKED |
| 4: Receipt and provenance | Pending | Canonical evidence, independent verifier, fraud/tamper tests | BLOCKED |
| 5: Hardening and deployment | Pending | End-to-end failures, runbooks, security review, deployed smoke tests | BLOCKED |
| 6: Submission and public release | Pending | Owner approval, eligibility, demo, DevEx report, secret/history scan | BLOCKED |

## Implemented in gate 0

- Exact signed path includes `/build`, raw query order and body bytes.
- Endpoint/origin allowlist. Redirects disabled. No execution endpoints.
- Timeout, streaming body limit, bounded reads retry, no quote/build retry.
- Strict API envelope and clock-skew checks. Upstream errors are redacted.
- Stock identity, market state, held raw input and RFQ route binding.
- Structural typed-data validation only. Opaque data fails closed.
- Discovery requires only API credentials. Smoke additionally requires public wallet, held stock contract and raw amount.
- Fixture reports have TEST_FIXTURE labels. Reports contain no raw wallet state or order payload.

## Gate 0 closure criteria

Live discovery run [37413704037](https://github.com/Tajudeeen/remain/actions/runs/37413704037), 2026-10-06 04:26 UTC: installation and all 74 original tests passed, then discovery returned upstreamCode 40304. The stock quote/build step did not run. Required credential values were available to the workflow, but this rejection does not prove their validity, permissions or approval. The exact compliance rule and runner location were not established. See [access troubleshooting](access-troubleshooting.md).

Local and remote checks green, then a real authenticated smoke result with supported held stock, matching RFQ quote and inspectable unsigned typed data. Record sanitized live artifact and reproducible run identifier. Investigate schema drift with Binance support. Do not weaken validation just to obtain a green run.

Gate 0 completion does not authorize trading or prove signature semantics. Those require vendor field binding, actual approval/settlement analysis and explicit owner approval later.

## Blueprint clarifications

`docs/build-plan.md` preserves the original blueprint. This status file is authoritative for implemented capabilities. A JSON checksum is not a formal proof, a structural check is not a signature audit, and a projected token floor does not control concurrent wallet activity. No premium-to-TradFi claim is possible from RWA referencePrice alone.
