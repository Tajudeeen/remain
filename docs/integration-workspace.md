# Read-only integration workspace

Gate 11 prepares the real read path while owner setup and held-position feasibility remain pending. It does not replace the fictional planner with live balances, and no execution adapter is enabled.

## User journey

Open `#live` from navigation or the planner. The public site shows `READ_ONLY_SETUP`, an unconfigured inspector and a disabled inspection action. A user can optionally discover a browser wallet account. This asks only for account access and reads the selected chain and current account. Account discovery does not authenticate ownership.

To inspect later on the owner's computer:

1. Use the existing Remain checkout and Node 24. If needed, copy `.env.example` to `.env.local` without overwriting a configured local file.
2. Put working developer credentials in the ignored local file. Replace credentials previously shared in chat. Set `REMAIN_LOCAL_READ_ONLY=true`.
3. Run `npm run dev`. The server binds to `127.0.0.1` by default. Never enable this inspector on a public host.
4. Open `http://127.0.0.1:3000/#live`. Connect your account and select BNB Smart Chain in the wallet if necessary. Remain never changes chains automatically.
5. Provide a currently supported stock contract actually held by that address and a positive input in the token's smallest units. Use actual token decimals. This amount is a diagnostic sell input, not the USDT cash target.
6. Inspect the result. An empty holding blocks before any quote or unsigned build. A successful structural inspection still leaves signature semantics and the global live gate unverified.

The UI does not fund an account or select a stock on the owner's behalf. A wallet with no stocks cannot complete the held-position inspection. The holding-free `market:binance` diagnostic remains available separately.

## Isolation and invariants

| Boundary | Behavior |
| --- | --- |
| Public deployment | Fixed unconfigured readiness. Inspect POST returns 503 `LOCAL_SETUP_REQUIRED`. No credential reads, Binance requests or local inspector factory import |
| Local opt-in | Server-only credentials captured once. Browser inputs contain only a public account, stock contract and positive uint256 raw amount |
| Network | Server must bind to loopback. Host, peer address, Origin and fetch-site checks reject public/cross-origin inspection. CLI rejects the opt-in with a public bind |
| Read path | Supported chain, catalog, selected market, held balance, matching RFQ and unsigned build only. Approval, signatures, orders and broadcast are absent |
| Requests | Exact three-field data record, duplicate-aware UTF-8 JSON, 4 KiB input cap, bounded body deadline, four concurrent slots and 30 requests per minute |
| Cancellation | Entire inspection capped at 20 seconds. Client disconnect aborts it. Individual upstream fetch/body/backoff reads also observe cancellation and timeout |
| Projection | Only fixed checks, error codes and boundary labels leave the local service. No address, balance, amount, quote ID, typed payload or upstream error message in the report |
| Display | Bounded strict JSON is validated before rendering. Mode is preserved. Any input/account/chain change invalidates the old result. Late replies cannot restore it |
| Account | Only `eth_requestAccounts`, `eth_chainId`, `eth_accounts`. No automatic discovery, signing, permission revocation or chain changes. Clear removes page account and inputs |
| Trust | `executionEnabled:false`, `liveGate:UNVERIFIED`, `signatureSemantics:UNVERIFIED`, `ownership:NOT_AUTHENTICATED` even after a structural read pass |

Provider responses, browser accounts and supplied reports are not independent attestations. Readiness says configuration is present, not that credentials work. Successful inspection is an ephemeral observation, never an execution authorization. The app does not persist inspection inputs or reports. A public wallet provider and ordinary hosting request metadata have their own privacy boundaries.

## Remaining implementation and evidence

Actual vendor EIP-712 field meanings, executable minimum net output, input/output fees, spender, nonce, deadline and receiver binding require a real payload and vendor confirmation. No fictional schema is substituted. A production execution adapter, authenticated wallet ownership, protected hosted inspection, durable hosted order orchestration and independent live settlement adapter remain gated work. An Agent Studio wrapper cannot bypass these requirements.

Official [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), [Wallet API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/wallet-api) and [RWA Data](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data) were reviewed on 2026-10-07. Their integration instructions do not establish vendor-specific enforcement for an unseen payload.

## Verification

Unit/adversarial tests cover opt-in, missing configuration, coercion/getters, zero addresses, uint256 bounds, report redaction, mode preservation, forged execution claims, partial passes, origin/host/public-bind rejection, duplicate/oversized bodies, stalled callback deadlines and cancellation before protected calls. Wallet tests cover explicit discovery, wrong chains, rejected/malformed accounts, timeout recovery, account changes, late responses, event cleanup and read-method restrictions.

Real-browser CI adds the public setup page at five widths and a controlled loopback inspector with an injected fictional wallet. It exercises empty holdings, a fixture inspection pass that still locks signing, malformed responses, account changes, edited inputs during a read and clear. These are fixture tests, not a real wallet connection or Binance measurement. Full suite, remote release and production UI evidence are recorded after completion in the milestone and deployment records.
