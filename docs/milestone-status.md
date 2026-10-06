# Milestone status

Updated 2026-10-06. Submission target: 2026-10-11 12:00 UTC per the supplied brief. Official eligibility, deadline, rubric and deliverables must be confirmed before public submission.

| Gate | Implementation | Evidence needed | Status |
| --- | --- | --- | --- |
| 0: API feasibility | Signing client, discovery, read-only stock-to-USDT RFQ harness, CI | Local suite, remote CI, real authenticated route with inspectable payload | Code implemented; live discovery BLOCKED by Binance compliance code 40304 |
| 1: Cash solver and BellGuard | Standalone planning engine, integer conversion, immutable trace/checksum and rehearsal | Adversarial tests and exhaustive small-domain oracle; live vendor adapter later | Planning module implemented; live integration BLOCKED by gate 0 |
| 2: Original interface and wallet flow | Synthetic planning interface and local rehearsal server implemented; live wallet flow pending | Real-browser fixture tests, mobile/accessibility; live signature field verification later | Independent rehearsal implemented; live wallet/integration BLOCKED by gate 0 |
| 3: Order durability and settlement | Standalone fixture SQLite journal, conservative provider states, recovery advice and settlement accounting implemented | Crash/concurrency/tamper tests and synthetic reconciliation; hosted storage, vendor adapter and approved tiny live settlement later | Independent module implemented; live order/settlement BLOCKED by gate 0 |
| 4: Receipt and provenance | Canonical TEST_FIXTURE receipt, recomputed settlement verification and tamper checks implemented | Canonical evidence, independent verifier, fraud/tamper tests; authenticated live provenance later | Independent fixture module implemented; live provenance BLOCKED by gate 0 |
| 5: Hardening and deployment | Explicit public-host policy, fixture health contract, portable non-root container, CI container smoke and deployment runbook implemented on milestone branch | End-to-end failures, runbooks, security review, deployed smoke tests | Hardening in progress; external deployed smoke still PENDING |
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

On 2026-10-06 the owner requested continued next-milestone work after the live failure was explained. Milestone 1 was scoped to a standalone planning engine so its arithmetic, policies and bounded search could be fully built and tested independently. This changes the code-work sequence, not the live access or execution gates. No UI, live quote adapter, signature, approval or trade has been enabled. See [planning engine](planning-engine.md).

`docs/build-plan.md` preserves the original blueprint. This status file is authoritative for implemented capabilities. A JSON checksum is not a formal proof, a structural check is not a signature audit, and a projected token floor does not control concurrent wallet activity. No premium-to-TradFi claim is possible from RWA referencePrice alone.

At 2026-10-06 05:23:34 UTC, the owner reported local discovery run `ac3580b8-1e20-4ad5-b8f7-9a895b6f8dda`, also blocked by upstreamCode 40304. This is owner-provided evidence, not a run independently executed here. At 05:41 UTC the owner explicitly requested the next milestone while away from their laptop. Gate 2 now permits a TEST_FIXTURE planning rehearsal without live wallet, API access, signature or order endpoints. The actual solver is exercised through a strictly bounded local HTTP boundary. This changes the work sequence and does not close the live gate. See [interface contract](planning-interface.md).

The owner's subsequent next-milestone request on 2026-10-06 authorizes gate 3 as an independent TEST_FIXTURE backend module. The durable journal and exact settlement checks are available through a terminal rehearsal and tests. No live submitter, RPC adapter or browser execution flow was added. Binance's documented 30-minute deduplication window is treated as a limitation; unknown outcomes never generate a new request ID. A reported fill is separate from reconciliation, and a later reorg invalidates an earlier fixture match. See [order journal](order-journal.md). The live gate and all later live release gates remain open.
\n\nThe owner's 2026-10-06 request to continue the Remain build authorizes gate 4 as another independent TEST_FIXTURE milestone. It may bind the existing fixture plan, journal and settlement evidence into a canonical receipt and independently re-run verification. It does not authorize wallet connection, signing, approval, order submission, RPC reads or live trading. Receipt hashes are integrity checks over supplied data, not authenticated attestations. See [proof receipt](proof-receipt.md).\n

The owner's 2026-10-06 request to continue the Remain build also authorizes Gate 5 fixture hardening and deployment-readiness work. This permits public-host validation, health checks, container packaging, runbooks and TEST_FIXTURE deployment smoke tests. It does not authorize Binance credentials on the rehearsal service, wallet connection, signing, approval, order submission, RPC settlement reads or live trading. A deployment is not counted as proven until an external HTTPS origin passes the committed deployed-smoke verifier.
