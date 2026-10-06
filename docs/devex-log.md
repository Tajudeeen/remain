# Binance developer experience log

Real findings and unanswered questions. No fabricated live measurements.

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

The official organizer pages were read again before preparation. The live BSC supported-stock requirement remains unfulfilled. An owner-authored final report is mandatory; the organizer explicitly rejects AI-generated reports. `docs/submission/devex-worksheet.md` organizes observed errors and missing measurements for the owner. It is not the final report and invents no first-success time, latency, issuer comparison or live settlement result. The supplied report form could not be retrieved, so its exact questions still need owner review.
