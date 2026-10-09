# Optional Cloudflare Container egress for read-only BSC RPC

This is an **opt-in, paid-plan** transport, not a compliance workaround.
The default Remain Worker and SQLite Durable Object stay on Workers Free.
Cloudflare Containers require Workers Paid (at least $5/month as of 2026-10-09),
plus usage beyond included allowances. Nothing in this branch activates billing.

## What is routed

- Only existing `HttpRpc` read-only BSC JSON-RPC calls can use a container.
- Binance remains on the direct signed `ReadOnlyBinanceClient` and
  `BinanceExecutionVendor` transports. `40301`-`40304` remain access stops.
  The container is explicitly forbidden to call Binance hosts.
- GeckoTerminal is not used anywhere in Remain's current execution flow.
  Do not add or route a phantom integration.
- No wallet, trading, order submission or financial approval is enabled.
- The egress service does not listen publicly, and it is not a general proxy.

## Architecture

`RemainLedger` -> `HttpRpc` -> optional `REMAIN_RPC_EGRESS`
Cloudflare Service Binding -> private `remain-rpc-egress` Worker
-> named Container -> read-only allowlisted BSC RPC endpoint.

The admission check uses exact configured RPC endpoint URLs, one per
line. The container repeats the policy: HTTPS, exact endpoint allowlist,
no IP hosts, no Binance/GeckoTerminal, GET disabled, eight allowlisted
read-only JSON-RPC methods, bounded bodies and responses, no redirects.
If the bound service fails, there is **no direct fallback**. The route is
an infrastructure option only; it cannot prove two independent RPC
providers, actual on-chain execution, Binance eligibility or a settlement.

## Deployment (requires explicit budget and host approval)

1. Verify that your Cloudflare account has Workers Paid and container access.
   Don't modify the current `remain` Worker until the new service is verified.
2. From `cloudflare/rpc-egress`, run `npm install` once, inspect the lockfile,
   then `npx wrangler secret put REMAIN_RPC_ALLOWED_ENDPOINTS`.
   Its value is the exact two HTTPS RPC URLs, **one per line**; keep query
   credentials in the secret, not in tracked configuration.
3. Deploy the separate service with `npx wrangler deploy` from that folder
   after testing with Docker. It has `workers_dev = false` and no routes.
   Pin the base image by digest in production after review.
4. Add the following **only after verification** to the existing root
   `wrangler.toml`:

   ```toml
   [[services]]
   binding = "REMAIN_RPC_EGRESS"
   service = "remain-rpc-egress"
   ```

5. Set the existing `REMAIN_RPC_PRIMARY` and `REMAIN_RPC_SECONDARY`
   secrets to the same exact URLs and set
   `REMAIN_RPC_EGRESS_ENABLED=true` only after a read-only smoke test.
   Do not change any activation flag. Confirm failures remain closed.
6. If cost is unacceptable, leave the binding and flag absent. Remain
   continues using direct Cloudflare Worker HTTPS RPC as before.

If Binance returns `40304`, stop and seek the specific operator, project,
and host eligibility determination from Binance. Do not reroute requests
through this service to evade Binance's access decisions.

Verification performed by this branch is local/unit test coverage and
GitHub CI. A real Cloudflare Container start, operator-approved egress,
RPC host behavior, costs and production readiness need separate evidence.
