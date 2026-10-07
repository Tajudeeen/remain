# Binance developer experience log

Real findings and unanswered questions. No fabricated live measurements.

## Owner-reported successful selected-stock market read, 2026-10-07

The owner supplied run `a2a2b549-f749-4779-892e-cd204f37252d`, started `2026-10-07T06:55:47.742Z`, with `status: passed`, `mode: LIVE_READ_ONLY` and `scope: SELECTED_STOCK_MARKET_READ_ONLY`. It passed current BSC stock identity and fresh selected-stock market checks for the AALon contract from the earlier catalog. The reported market response at `06:55:49.176Z` contained `marketStatus: overnight` and `openState: true`. This is an API observation, not independent exchange-session evidence or trade permission.

| Endpoint | Reported duration | Result |
| --- | --- | --- |
| `/api/v1/dex/market/rwa/tokens` | 1,294 ms | Accepted report with selected stock identity validated |
| `/api/v1/dex/market/rwa/underlying-market` | 236 ms | Accepted report with selected chain/contract and market state validated |

These are one local timing sample per endpoint, not median/p95 measurements, issuer-wide coverage or an execution benchmark. The [sanitized owner observation](observations/owner-market-a2a2b549-f749-4779-892e-cd204f37252d.json) preserves the supplied run ID, timestamps, public contract, checks and response digests. It was copied from chat and was not independently executed or authenticated here. The report shows no compliance/signature rejection on those two local requests; the cause of the historical 40304 rejection and access from other hosts remain unestablished.

The local inspector correctly retained `source: LOCAL_FILE_UNAUTHENTICATED`, `liveGate: UNVERIFIED` and `liveFeasibility: NOT_ESTABLISHED`. Its job is to safely read files, not authenticate them. The owner still reports no stock holding. No wallet balance, RFQ quote/build, signature semantics, approval, submission or settlement has been verified. Gate 0 remains blocked by the held-position RFQ/build requirement, rather than treating this market-only pass as full feasibility.

## Holding-free market diagnostic, 2026-10-07

The owner reported that the configured wallet currently holds no tokenized stock, then authorized continued market-data work. The held-position smoke still requires an actual balance before requesting a quote. Added a separate selected-contract market command requiring only API credentials, current stock identity and fresh underlying-market data. It makes exactly the two kinds of metadata calls and never touches a wallet, amount, quote or build. No successful live call is claimed from the synthetic tests.

Source review found that the prior shared validator coerced `platformId` and `reasonCode` through `String()`. Arrays containing `ondo` or `TRADING` could pass despite violating the documented primitive types. These are verified validator defects reproduced with synthetic regression cases, not observed Binance response shapes. Both fields now require primitive strings when used, and market identity binding is shared across the new diagnostic and existing held-position smoke. Tests prove mismatched/null fresh responses stop before balances or quotes. Market reports and inspection retain limited-scope labels and cannot close Gate 0. A funded held-position RFQ, inspectable unsigned payload and later explicitly approved real settlement remain unverified.

## Local evidence diagnosis, 2026-10-07

The repository and remote CI were checked again after the catalog patch. No new authenticated report was available in this workspace at that check. The owner then supplied a current-format catalog excerpt: AXTIB (`AXTI`, issuer `bstock`) had `marketStatus: null` and a type-only `DISCOVERY_MARKET_STATUS` issue. AALon and DRSon (`ondo`) had readable `regular`/`true` fields, and the shown LLYon fields were also readable. This is owner-provided excerpt evidence without a run ID, timestamp, full catalog or overall status/count. It confirms the observed null shape for that AXTIB row, not a global issuer defect or independent US-exchange opening state. Real held-stock RFQ/build evidence remains absent.

Added `npm run inspect:binance` to summarize the latest local report by its recorded start time. It exposes only validated diagnostic fields and labels the source as an unauthenticated local file. Historical, fixture, legacy, partial and blocked results remain nonzero; malformed candidates cannot silently select an older pass. Tests exercise stale copied files, unsafe paths, symlinks, oversized data, inconsistent status/counts, and arbitrary hidden properties. These are tooling tests, not live API measurements. The next required observation is the owner's updated discovery, followed by a held-stock read-only RFQ/build check on their approved host.

## Owner-reported catalog market-field mismatch, 2026-10-06

Run `a19fb351-ae16-4280-b12e-8659e276baeb`, started `2026-10-06T19:09:34.511Z`, reached `DISCOVERY_MARKET_STATUS` in the owner's PC checkout. This identifies a non-string catalog market field after envelope and preceding stock-identity checks. The actual field type/value and which token triggered it are still unknown. This is owner-provided evidence, not a call independently made in this workspace.

The follow-up separates identity enumeration from market readiness. Discovery retains validated stock identities, emits unavailable market fields as null with fixed type-only issues, and keeps partial catalogs nonzero/exit 1. The selected-stock feasibility path still requires a separately fetched, strictly validated market response before quoting or building. No numeric status mapping, guessed default, raw-response logging or execution was introduced. A fresh catalog run and held-stock feasibility observation are pending.

## Owner-reported schema rejection, 2026-10-06

Discovery run `7c80fd96-18b2-4687-92ec-bae8263ed4df` was supplied by the owner with `UPSTREAM_SCHEMA_INVALID` and no numeric upstream code. The exact response body and failed validation field are unknown. This does not prove authentication or stock coverage, and does not close Gate 0. A source review against the current RWA REST reference found no confirmed parser mismatch: it documents numeric `code: 0`, numeric `timestamp`, array `data`, string token decimals and boolean `statusInfo.openState`. Existing parsing accepts that documented shape.

The follow-up adds fixed safe `validationCheck` labels at the response/envelope and discovery metadata boundaries, with adversarial regression tests for non-JSON pages, missing fields and malformed token records. No raw body logging, credential logging, shape coercion or live execution was added. A fresh owner run with the updated source is required to identify the rejection. See [diagnostic labels](access-troubleshooting.md).

## Documentation review, 2026-10-06

| Observation | Product consequence | Evidence or follow-up |
| --- | --- | --- |
| Signing prehash includes `/build` and exact raw query/body | Dedicated signing unit with known vectors; no URL normalization after signing | [Authentication](https://web3.binance.com/en/dev-docs/authentication) |
| RWA referencePrice is derived from token data | No premium-to-independent-market display | [RWA Data](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data) |
| Tokenized-equity routes use RFQ | Signature and asynchronous order lifecycle needed | [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api) |
| Example typedDataToSign can be an opaque hex string while signing guidance references EIP-712 | Opaque payloads blocked; ask which endpoint returns complete typed-data object for each vendor | Trading API example and live schema confirmation pending |
| A read-only build is not transaction simulation or settlement | Report labels separate these capabilities | Trading API and [Transaction API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api) |
| Quote lifetime is short | Single-shot quote/build, local 20-second build cutoff | Trading API; real latency and TTL observations pending |
| RFQ request deduplication is documented for 30 minutes | Preserve request IDs durably; unresolved outcomes after that window require investigation | Trading API documentation reviewed 2026-10-06; no real submission tested |
| Submit quoteId refers to built rfq.orderId; status uses returned platform orderId | Keep planning quote, built order and platform order identities separate | Trading API; actual vendor mapping remains unverified |
| RFQ statuses list PENDING_VENDOR, PENDING_ONCHAIN, FILLED, FAILED, EXPIRED and CANCELLED | Model these observations conservatively; do not invent partial-fill or cancellation endpoint support | Trading API; live lifecycle, cancellation and partial fills still need support confirmation |

## Live observations

2026-10-06 04:26 UTC: [live discovery run 37413704037](https://github.com/Tajudeeen/remain/actions/runs/37413704037) reached the signed stock-list request and returned business code 40304. No quote, build, signature or trade was performed. Credentials were present in the GitHub job, but their validity is not established by the failure. The generic log originally hid the useful compliance classification. The follow-up adds documented compliance-code mapping and persists redacted discovery evidence on failures. Real successful stock coverage, latency, issuer comparison and settlement remain pending.

The official [full documentation](https://web3.binance.com/en/dev-docs/llms-full.txt), compliance errors section, describes 40304 as a compliance restriction without a more specific rule. [Service restrictions](https://web3.binance.com/en/dev-docs/web3-api-prohibited-regions) state that both portal and API enforce IP location checks. A runner-location issue is a hypothesis, not a verified root cause. Never record the failure as a bad signature or claim changing a host solved it without a successful live result.

## Measurement protocol

Owner-reported local observation, 2026-10-06 05:23:34 UTC: discovery run `ac3580b8-1e20-4ad5-b8f7-9a895b6f8dda` returned the same 40304 compliance rejection. This weakens an explanation limited to GitHub hosting, but does not identify the compliance rule or prove valid credentials. No successful endpoint, stock coverage or latency measurement was established. The owner was given a concrete support request with project ID, timestamp and code. Operator approval and access review remain unresolved.

The owner authorized independent interface work while access is blocked. The interface displays TEST_FIXTURE, labels the position fictional and keeps execution disabled. No fixture price, impact, fee, market status, coverage or quote result is recorded as a Binance observation.

The next authorized independent module uses a real local SQLite journal with synthetic order and settlement evidence. Tests show local process/crash consistency and conservative accounting behavior. They do not measure Binance execution or demonstrate settlement. No typed payloads, signatures or actual balances are persisted by the rehearsal. The fixture confirmation threshold is a demo policy; live BSC finality and vendor order attribution remain research/adapter work.

Run discovery, then held-stock feasibility. Record run IDs, permitted endpoint paths, status, latency and redacted evidence. Record chain/ticker/issuer coverage and empty-list cases. Compare issuers only if two real BSC wrappers for the same underlying are discoverable. Preserve API errors as classified outcomes. Distinguish documentation ambiguities from actual runtime failures.

Questions for Binance support: full RFQ typed-data schema per vendor, minimum-output/fee enforceability, spender contracts, market reason-code taxonomy, idempotency behavior, cancellation semantics, partial fills, and availability of meaningful RFQ simulation.

## Submission preparation, 2026-10-06

Gate 7, 2026-10-07: the owner authorized independent work while held-stock RFQ feasibility is pending. The app now exposes the existing fixture receipt verifier with bounded uploads and explicit unauthenticated labels. Local checks passed 453 tests. This adds no Binance measurement or live observation. The local browser environment could not launch/install its runner. Remote PR/main CI passed browser/container checks, external HTTPS run 37587725694 passed with the correct deployed SHA, and the production browser checked the fictional demo. See [deployment evidence](netlify-deployment.md).

The official organizer pages were read again before preparation. The live BSC supported-stock requirement remains unfulfilled. An owner-authored final report is mandatory; the organizer explicitly rejects AI-generated reports. `docs/submission/devex-worksheet.md` organizes observed errors and missing measurements for the owner. It is not the final report and invents no first-success time, latency, issuer comparison or live settlement result. The supplied report form could not be retrieved, so its exact questions still need owner review.
