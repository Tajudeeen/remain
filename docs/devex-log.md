# Binance developer experience log

Real findings and unanswered questions. No fabricated live measurements.

## Documentation review, 2026-10-06

| Observation | Product consequence | Evidence or follow-up |
| --- | --- | --- |
| Signing prehash includes `/build` and exact raw query/body | Dedicated signing unit with known vectors; no URL normalization after signing | [Authentication](https://web3.binance.com/en/dev-docs/authentication) |
| RWA referencePrice is derived from token data | No premium-to-independent-market display | [RWA Data](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data) |
| Tokenized-equity routes use RFQ | Signature and asynchronous order lifecycle needed | [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api) |
| Example typedDataToSign can be an opaque hex string while signing guidance references EIP-712 | Opaque payloads blocked; ask which endpoint returns complete typed-data object for each vendor | Trading API example and live schema confirmation pending |
| A read-only build is not transaction simulation or settlement | Report labels separate these capabilities | Trading API and [Transaction API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api) |
| Quote lifetime is short | Single-shot quote/build, local 20-second build cutoff | Trading API; real latency and TTL observations pending |

## Live observations

2026-10-06 04:26 UTC: [live discovery run 37413704037](https://github.com/Tajudeeen/remain/actions/runs/37413704037) reached the signed stock-list request and returned business code 40304. No quote, build, signature or trade was performed. Credentials were present in the GitHub job, but their validity is not established by the failure. The generic log originally hid the useful compliance classification. The follow-up adds documented compliance-code mapping and persists redacted discovery evidence on failures. Real successful stock coverage, latency, issuer comparison and settlement remain pending.

The official [full documentation](https://web3.binance.com/en/dev-docs/llms-full.txt), compliance errors section, describes 40304 as a compliance restriction without a more specific rule. [Service restrictions](https://web3.binance.com/en/dev-docs/web3-api-prohibited-regions) state that both portal and API enforce IP location checks. A runner-location issue is a hypothesis, not a verified root cause. Never record the failure as a bad signature or claim changing a host solved it without a successful live result.

## Measurement protocol

Run discovery, then held-stock feasibility. Record run IDs, permitted endpoint paths, status, latency and redacted evidence. Record chain/ticker/issuer coverage and empty-list cases. Compare issuers only if two real BSC wrappers for the same underlying are discoverable. Preserve API errors as classified outcomes. Distinguish documentation ambiguities from actual runtime failures.

Questions for Binance support: full RFQ typed-data schema per vendor, minimum-output/fee enforceability, spender contracts, market reason-code taxonomy, idempotency behavior, cancellation semantics, partial fills, and availability of meaningful RFQ simulation.
