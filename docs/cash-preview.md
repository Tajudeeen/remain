# Read-only cash-target preview

Gate 14 connects the cash-first intent to the prepared Binance read path. It is available only on an explicitly opted-in loopback server. The public Netlify deployment serves the interface and denies `/api/live/preview` before reading its body. No credentials are hosted.

The owner can discover an account, select one supported BSC stock, enter a USDT target, select an exposure floor and request a preview. The agent has not connected a real wallet, read authenticated Binance data or supplied live holdings. An injected provider remains `TEST_FIXTURE` throughout.

## Contract

The exact request contains `wallet`, `token`, `cashTarget`, `retainBps`, `maxImpactBps` and `allowClosedMarket`. Cash uses a positive plain decimal string. Retention is 0–10,000 basis points. The reported impact magnitude limit is 0–500 basis points. Neither value is coerced at the server boundary.

Every attempt reads the supported-stock catalog and selected raw balance afresh using Gate 13's bounded pagination and honest unknown states. It never accepts a browser-supplied balance or decimals. The floor is `ceil(balanceRaw × retainBps / 10,000)`. Every requested input is positive and no greater than `balanceRaw − floorRaw`. This bounds requested stock input only. Unknown fees or concurrent activity can invalidate an eventual retained balance.

The selected market is read before any quote. Pause, unknown metadata, maintenance/restriction reasons and contradictory open/status/reason flags block. A closed market requires explicit permission. These are API observations, not an independent exchange calendar or a guarantee of eligibility to trade.

The search samples at most eight distinct inputs with 200 ms spacing and one 12-second wall/elapsed deadline covering metadata, pagination, requests and waits. The first probe is the exposure cap. A proportional seed and bounded gap sampling improve the next observations. Price curves need not be monotonic. The result identifies the smallest qualifying **observed input**, breaking ties by greater estimated output. No global minimum or proof of target impossibility is claimed.

Only BSC stock-to-USDT RFQ routes from the existing recognized vendor set are admitted. Chain, input amount, token addresses, catalog stock decimals, quote IDs and cash decimals are checked. Decimals come from the matching quote metadata and must stay consistent across routes and probes. Sparse/accessor data, duplicate IDs, unexpected custom-fee fields, honeypots or missing/nonzero reported transfer tax discard the entire attempt. Null impact is retained as a nonqualifying observation. Signed positive or negative impact is compared by absolute magnitude with integer cross multiplication, without rounding a fraction of a basis point down.

No quote ID, route payload, network fee estimate, raw response, signature or API key is returned. The selected holding and estimated economics are returned only to the same-origin local page, with `no-store`. They are ephemeral and cleared on stock, account, cash-policy, page or server changes. Cancellation aborts the prepared reader and spacing. A disconnected, timed-out, clock-regressing or stale attempt cannot expose an earlier candidate. Body size, duplicate-key, origin, host, concurrency and HTTP deadline limits remain in force.

The shared server/browser validator recomputes the floor, cash target and selected candidate from all returned observations before display. This establishes consistency of supplied data, not authenticity or ownership. Preview errors expose only fixed local error codes through the same bounded response reader. Expiry clears the displayed candidate. No preview automatically copies a sell amount, requests an unsigned build or calls an execution path.

## Estimated output is a separate capability

The [official Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), checked 2026-10-08, documents `toTokenAmount` as estimated output. `tradeFee` is an estimated network fee in USD. A cached quote's approximate 30-second TTL is not an exact signed deadline. Custom `feeAmount` being null does not prove all vendor fees are zero.

This module therefore cannot implement the executable planning `QuoteProvider`. It does not manufacture `minimumGrossOutputRaw`, input/output fee bounds, verified order binding or expiry from estimates. Its minimum-output binding, fees, ownership and live gate remain unverified, and execution remains false. BellGuard's existing `MINIMUM_OUTPUT_UNVERIFIED` block is unchanged. Signed vendor economics and independently reconciled settlement remain future gates.

## Verification scope

Adversarial tests cover integer precision, rounded retention, finite/non-monotonic searches, route-set atomicity, unknown impact, identities, cash-precision drift, repeated IDs, accessors, fee/tax fields, market permission and contradictions, freshness, clock regression, deadlines, cancellation of uncooperative readers, local HTTP isolation, fixed errors and response projection. Browser-source tests cover exact display, forged floors/minimums, late response suppression, clear/cancel/expiry and error privacy. CI exercises the actual interface with a controlled wallet and injected read-only provider. These are fixture checks, never authenticated feasibility or mainnet proof.
