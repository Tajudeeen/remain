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

None yet. Credentials have not been configured in this workspace. No API success, issuer comparison, liquidity measurement, simulation or settlement is claimed.

## Measurement protocol

Run discovery, then held-stock feasibility. Record run IDs, permitted endpoint paths, status, latency and redacted evidence. Record chain/ticker/issuer coverage and empty-list cases. Compare issuers only if two real BSC wrappers for the same underlying are discoverable. Preserve API errors as classified outcomes. Distinguish documentation ambiguities from actual runtime failures.

Questions for Binance support: full RFQ typed-data schema per vendor, minimum-output/fee enforceability, spender contracts, market reason-code taxonomy, idempotency behavior, cancellation semantics, partial fills, and availability of meaningful RFQ simulation.
