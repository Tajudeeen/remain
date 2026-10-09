# Hosted live read-only product

Remain's public experience has two deliberately separate paths:

1. **Real user path:** a visitor connects their own BNB Smart Chain wallet, discovers supported tokenized-stock contracts from the live Binance RWA catalog, checks an observed token balance, then asks the configured read-only service for fresh held-position, market, cash-target RFQ, and unsigned-order evidence. Ownership by the builder is not required. The visitor's token holdings are checked at request time.
2. **Fixture path:** the optional original 100-unit cash-planning demonstration stays as an educational, explicitly synthetic test environment. It must never be represented as a person's actual position or quote.

## Enable the real market service on Netlify

The live service is opt-in and off unless all of the following **server-side, Functions-scoped** environment variables are set:

- `REMAIN_HOSTED_READ_ONLY=true`
- `BINANCE_WEB3_API_KEY` set to a valid, authorized Binance Web3 developer key
- `BINANCE_WEB3_SECRET_KEY` set to its matching private signing secret

Configure these in Netlify project settings with Functions scope, mark credentials secret, and redeploy so the runtime receives them. Never prefix them `VITE_`, `NEXT_PUBLIC_`, or expose them via build-time application variables. Keep credentials out of source control and all client JavaScript. No user needs to supply developer API keys.

The public `GET /api/live/status` reports `HOSTED_READ_ONLY` only when server credentials are present and the feature flag is true. That means the server is configured, **not** that the keys work or live trading is proven. Upstream failures return a fixed error code. A failed Binance eligibility, vendor permission, timeout, unavailable quote, zero or unsupported holding, or closed/paused market remains a real blocked result, not a fake success. The Binance catalog is exposed as `GET /api/live/catalog` with a validated, bounded and expiring stock-identity response.

Wallet-native ERC-20 balance verification remains available without the Binance developer API, using read-only `eth_call` through the visitor's provider. It does not prove that the token is a supported stock. The Binance position and quote endpoints only accept exact BSC stock identity and other existing safeguards. The caller's address is public and selected in the browser. Neither path gives this service custody of any asset.

## Validate after deployment

1. Open `/#live`, connect a wallet on BSC chain 56, and click **Verify token balance on BSC** after entering a token contract.
2. When hosted reads are enabled, click **Find supported BSC stocks** and select an actual catalog result.
3. Press **Read position**, then **Explore cash target**. A held supported stock and available quote are needed before any candidate can be offered.
4. Review the unsigned order from a fresh estimate and confirm the UI never equates a quote with settlement.
5. Check `/api/live/status` and `/healthz`, plus GitHub CI, to distinguish readiness and fixture service health.

Do not save or screenshot users' wallet holdings, RFQ payloads, or authentication credentials as general public evidence. Use synthetic tests for CI. Live funded tests should be conducted only by an eligible consenting holder and with a deliberate financial risk budget. Missing inventory must not be fabricated.

## Production trading remains a separate service

CoW execution was already engineered with owner-controlled signing, pinned BSC contracts, independent RPC checks, journaled idempotency, recovery and settlement reconciliation. None of those checks are removed. The Netlify function deliberately returns `EXECUTION_SETUP_REQUIRED` for signing or trading because it has no approved durable execution database. The existing Compose-backed HTTPS service in `docs/live-operations.md` and `docs/execution.md` is the intended production backend once vendor route compatibility, keys, RPCs, persistence, HTTPS, observability, access restrictions and final release checks succeed.

Do not route signed orders through serverless endpoints without porting the durable journal and verified account authentication. An API-connected quote is an estimate, not an executable guarantee. Live trading must not automatically activate with a feature flag intended for reads.

## Limitations

- Binance may restrict APIs by region, project, IP, account permission, or product availability.
- A held ERC-20 token is not necessarily a supported tokenized stock, and a supported stock may have no executable route.
- Public read endpoints are Netlify-rate-limited. Provider quota and region access still require operational testing and monitoring before broad access.
- UI estimates can expire, markets may close, fees may change, and the app should preserve its blocked/unknown states.
- Do not assert live readiness based on the builder's wallet balance, or assert live trade success without observed, reconciled mainnet evidence.
