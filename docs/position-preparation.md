# Selected-position preparation

Gate 13 lets the owner prepare an RFQ inspection amount without guessing token decimals. The existing fictional cash planner stays separate. This is a selected-position API observation, not an ownership proof, executable quote or settlement.

## Flow

On the owner's opt-in loopback server, discover an account, enter a supported BSC stock contract and press Read position. The local backend requests the current RWA catalog and the documented single-chain wallet-balance endpoint. It returns only the selected supported identity, actual decimals and reported raw balance. No market, quote or build request occurs in this preflight.

For a positive raw holding, enter a plain decimal stock amount and press Set inspection amount. Remain converts with integer arithmetic, rejects excessive precision instead of rounding, and requires the amount to fit uint256 and the reported balance. Setting the input makes no RFQ request. The later explicit RFQ inspection independently rereads the holding and market.

The manual raw-unit field remains available for a user who independently verified the amount. This screen prepares stock input, not a USDT cash target or a trade.

## Honest states

| Status | Meaning | Amount preparation |
| --- | --- | --- |
| HELD_OBSERVED | A matching row reports positive canonical raw units | Available for a fresh observation |
| ZERO_OBSERVED | A matching row explicitly reports raw zero | Disabled |
| RAW_UNAVAILABLE | A matching row reports an empty rawBalance | Disabled, balance unknown |
| NOT_REPORTED | The selected stock is absent when a returned page ends | Disabled, balance unknown |
| INCOMPLETE | Ten full pages were read without finding it | Disabled, balance unknown |

Missing rows never establish zero. Risk filtering, API indexing and concurrent activity limit every observation. A holding observation does not independently establish custody or authenticate the provider's truth.

## Boundaries

- POST `/api/live/position` accepts exactly wallet and token, rejects duplicate JSON keys and is available only with opt-in configuration, loopback binding/peer/host and matching Origin. It inherits the 4 KiB request limit, body deadline, 20-second read deadline, four concurrent slots, cancellation and rate limit.
- The catalog and balance responses are bounded ordinary-data snapshots. Selected catalog ambiguity, duplicate contracts, wrong account/chain, risk rows, malformed uint256 values and incorrect page/pageSize echoes fail closed. Only one chain group is accepted. Pages contain at most 100 assets and the reader stops after ten pages.
- The documented native-asset empty contract is allowed as an unrelated row. The selected stock always requires a supported nonzero contract. Displayed balances use raw units, never the provider's rounded balance field.
- Freshness requires a valid upstream timestamp no more than 15 seconds old, no future timestamp and no observed local clock regression. Response projection binds the exact submitted account and stock and preserves TEST_FIXTURE on injected local readers.
- Conversion rechecks account/stock binding, wall-clock age and monotonic elapsed age. A 15-second expiry disables preparation. Edits, account changes, server rechecks, route exits and page lifecycle changes cancel/clear the selected position. Late replies cannot restore it.
- Credentials stay in the ignored local configuration. Selected identity and balance exist only in local request/page memory. There is no persistence, provider-body logging, balance export or receipt creation on this path. RFQ diagnostics remain redacted.
- Netlify always rejects this endpoint with 503 LOCAL_SETUP_REQUIRED and never parses its body, imports the local factory or reads Binance credentials. Account discovery on the public setup page does not enable position reads.

All responses keep executionEnabled false, liveGate UNVERIFIED and ownership NOT_AUTHENTICATED. No signing, approvals, orders, broadcast or funding is added. The agent performed no real account discovery or authenticated Binance read. Gate 0 still needs actual held-position RFQ evidence and vendor semantics remain unverified.

## Documentation and verification

The official [Wallet API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/wallet-api) and [RWA Data](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data) were reviewed on 2026-10-08. The wallet reference documents GET `/api/v1/dex/balance/all-token-balances-by-address`, single-chain pagination with page/pageSize, and an empty rawBalance when raw units are unavailable. The chosen ten-page limit is Remain's bounded resource policy.

Tests exercise zero/missing/unavailable/incomplete results, paging, duplicate identity, wrong account/chain/risk flags, schema/getter attacks, clocks, aborts, uint256 bounds, exact conversion beyond floating-point precision, HTTP isolation/deadlines/redaction and the actual integration-page code. Real-browser CI adds a controlled fictional position, overprecision rejection, explicit amount preparation and zero-holding states. Every injected provider/wallet remains TEST_FIXTURE.

Local verification on 2026-10-08 passed all 743 tests, full `npm run verify`, coverage and tracked-history screening. There are 32 new adversarial tests. The position reader has 98.94% line coverage and the shared position/amount boundary has 100% line coverage. VM page tests exercise the actual page source, while their execution is not reflected in instrumented JS line coverage. A reproduced freshness defect accepted raw 100 when upstream age plus elapsed time exceeded 15 seconds after wall-clock rollback. Counting both ages fixes it and the regression now rejects that preparation.

Remote CI and release verification remain pending. No test establishes successful live API access or execution.
