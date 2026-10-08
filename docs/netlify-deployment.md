# Netlify fixture deployment

The private GitHub repository can deploy to Netlify without making the source public. Netlify publishes only `dist/web`, plus one stateless fixture function. The Node/container server remains available as an alternative.

`fixture.ts` routes `/healthz`, `/api/rehearse` and `/api/receipt/verify` to fixture health, the existing synthetic planner and pure receipt inspection. It does not load the Binance client, SQLite journal, wallet, signing code or RPC. No SQLite persistence is claimed on serverless instances.

The adapter accepts only HTTPS origins supplied by Netlify's site context or its platform deployment URL variables. It rejects cross-site requests, mismatched Origin, unexpected methods/content types, encoded bodies, query variants and extra input fields. Body reads are bounded to 4096 bytes for planning and 256 KiB for receipt inspection, with a two-second deadline. Platform rate limiting declares 30 requests per IP/domain per minute. Its enforcement must be verified on the actual host, and is not supplied by an in-memory counter.

New builds bundle the documented public `COMMIT_REF` into the fixture function. The old runtime `REMAIN_BUILD_SHA` is only a fallback when no valid build identity was bundled.

Static files and function responses both receive restrictive security headers and no-store caching. There is no SPA fallback that could conceal an absent execution endpoint behind a 200 HTML response.

## Configuration

- Import `Tajudeeen/remain`, branch `main`, into the existing `Deeen_Codes` team.
- Build command: `npm run build`.
- Publish directory: `dist/web`.
- Functions directory: `netlify/functions`.
- Node build version: 24, configured in `netlify.toml`.
- Set `REMAIN_BUILD_SHA` to the exact deployed 40-character commit, with Functions scope. Refresh it for each release. The health endpoint reports `unknown` if absent or malformed.
- Do not set any Binance credentials, private keys or signing material.

Netlify Functions follows the valid Node build runtime. `AWS_LAMBDA_JS_RUNTIME`, if needed, must be configured through the dashboard rather than `netlify.toml`.

After deployment run `REMAIN_BASE_URL=https://<site-host>/ npm run smoke:deployed`. Verify the health SHA against Netlify's deployed commit. Exercise the cash composer in a browser, the paused-market guard and an invalid request. Gate 5 remains pending until the external smoke passes. This host proves only a TEST_FIXTURE planning demo, never live trading or authenticated settlement.

## Verified deployment, 2026-10-06

- URL: https://remain-cash.netlify.app/
- Netlify site ID: `8ac48969-8aff-4caf-834a-5b5a8b0e16bf`.
- Production deploy ID: `6ac4abb43b580c2ab559cdb0`.
- Deployed commit: `ddb835ee154a40d18cabe3ca968c4a5479f510d1`.
- Merged code PR: [#10](https://github.com/Tajudeeen/remain/pull/10).
- Main verification: [37433751084](https://github.com/Tajudeeen/remain/actions/runs/37433751084), PASS.
- Independent HTTPS smoke: [37433961850](https://github.com/Tajudeeen/remain/actions/runs/37433961850), PASS at 08:07 UTC.
- Browser checked the 25 USDT / retain 70% path: sell 25 fictional units, retain 75. Paused-market scenario blocked without choosing a sale.
- Netlify deploy metadata confirmed one Node.js 24 function, exact health/planning routes and platform rate-limit configuration. Load-based rejection was not exercised.
- Private source and disabled live execution preserved. No Binance credentials were added.

The workspace's direct HTTP smoke attempt timed out. The committed verifier was then dispatched through GitHub Actions and passed all health/build, static-page, planning-accounting, paused-market, invalid-input and absent-execution-endpoint checks. Returned health SHA matched Netlify's `commit_ref`.

This evidence-only documentation update uses `[skip netlify]` to keep the already verified deployment unchanged. Future application releases must refresh `REMAIN_BUILD_SHA` and rerun the HTTPS gate. Gate 0 remains blocked by Binance code 40304.

## Entry experience release, 2026-10-06 08:26 UTC

The root URL now opens a skippable logo introduction, explanatory landing page and shared footer before the cash workspace. [PR #12](https://github.com/Tajudeeen/remain/pull/12) merged as `b3089947eec2a670e7ef6140d22622239094139e`. Production deploy `6ac4b08671bf7a60c694865b` published at 08:25:56 UTC with that commit. `REMAIN_BUILD_SHA` was refreshed before the final rebuild, and the HTTPS health result matched the deployed commit.

- Local verification and coverage passed all 286 tests. The workspace denied the local browser daemon's socket startup, so local visual checks were not counted as passed.
- [PR browser verification](https://github.com/Tajudeeen/remain/actions/runs/37435468981) and [post-merge main verification](https://github.com/Tajudeeen/remain/actions/runs/37435789151) passed. Entry tests cover automatic splash dismissal, manual skip, repeat-session bypass, reduced-motion bypass, keyboard entry, back/forward history and direct dashboard links. Both views passed overflow checks at 320, 375, 768, 1024 and 1440 pixels, alongside the existing planner regression checks.
- [Independent HTTPS smoke](https://github.com/Tajudeeen/remain/actions/runs/37436134911) passed at 08:26:53 UTC, including exact 25-to-75 planning accounting, paused-market blocking, invalid-input rejection and absent execution endpoints.
- The production browser confirmed landing-to-planner navigation and a plan yielding 25 synthetic USDT while retaining 75 demo units. The shared footer exposes status, limitations and public builder/BNB Chain links without exposing private source.
- The Netlify preview rendered both entry views. Its planning request failed in the cloud browser, and preview health navigation was blocked by the browser client. No preview API pass is claimed. Production verification above is separate.

This documentation-only record uses `[skip netlify]`. The source remains private and all live integration and execution gates remain blocked.

## Receipt workspace release, 2026-10-07 07:30 UTC

[PR #20](https://github.com/Tajudeeen/remain/pull/20) merged as `a1e382a62f0310b4c751ca51aedb4984422d6c12`. Production deploy `6ac5f4b5735bab000820b4e7` published at 07:29:08.794 UTC with that commit. Its metadata confirms one Node.js 24 function with exact health, planning and receipt-verification paths. The runtime health SHA matches the deployed commit without changing the historical environment setting.

- Local verification and coverage passed 453 tests. No local browser pass is claimed because the workspace could not launch/install the runner.
- [PR verification 37587397123](https://github.com/Tajudeeen/remain/actions/runs/37587397123) and [main verification 37587576556](https://github.com/Tajudeeen/remain/actions/runs/37587576556) passed browser, container, source, history and receipt checks. The receipt UI passed at 320, 375, 768, 1024 and 1440 pixels. CI screenshots at 375 and 1440 were visually inspected.
- [Independent HTTPS smoke 37587725694](https://github.com/Tajudeeen/remain/actions/runs/37587725694) passed at 07:30:36 UTC. Checks include accounting replay, altered totals, duplicate-field rejection, a 256 KiB body limit, existing planner guards and absent execution endpoints. Health reports `a1e382a62f0310b4c751ca51aedb4984422d6c12`, `TEST_FIXTURE`, execution false and live gate BLOCKED.
- The production browser at https://remain-cash.netlify.app/#proof loaded and checked the static demo, showing three events, 75 remaining stock raw units and `MATCHED_FIXTURE`, with UNAUTHENTICATED still visible. Extension metadata errors are browser infrastructure messages, separate from the application result.
- Uploaded bodies are not persisted or logged by the application. Rate-limit saturation was not tested on Netlify. No authenticated receipt, wallet, signature, order or settlement was enabled, and no Binance credentials were added to hosting.

The full live gate now awaits a held-position RFQ/build despite owner-reported metadata success. This release closes only the fixture receipt workspace. This evidence-only update uses `[skip netlify]` to preserve the verified deployed artifact.

## Request-boundary release, 2026-10-07 09:34 UTC

[PR #23](https://github.com/Tajudeeen/remain/pull/23) merged as
`b241ad8d2f15cf7489a7079c04998bea87f5d8c4`. Production deploy
`6ac611f78be59c00081c215e` published at 09:33:59.081 UTC with that commit.
Netlify metadata confirmed the exact SHA, private source and one Node.js 24
function with health, planning and receipt-verification paths.

- Full local verification and coverage passed 603 tests. The Node HTTP smoke
  passed from a shared server/test execution context. An earlier attempt from
  separate tool executions could not reach the local listener and was not
  counted as passed. No local browser pass is claimed.
- [PR CI 37601135508](https://github.com/Tajudeeen/remain/actions/runs/37601135508),
  [push CI 37601130817](https://github.com/Tajudeeen/remain/actions/runs/37601130817)
  and [main CI 37601461126](https://github.com/Tajudeeen/remain/actions/runs/37601461126)
  passed full source/history, container and real-browser fixture checks.
- [Independent HTTPS smoke 37601461211](https://github.com/Tajudeeen/remain/actions/runs/37601461211)
  passed at 09:34:03 UTC. Its new automatic gate first matched the exact pushed
  main SHA in public health, then checked normal accounting, ambiguous planner
  fields, coerced market input, receipt integrity and absent execution routes.
- The production browser opened the landing page and submitted the normal
  25-cash/70%-floor form. It returned 25 stock debit, minimum 25.00 synthetic
  USDT and 75 retained units. [The production screenshot](images/request-boundary-20261007.jpg)
  captures that fictional result after its 15-second review window expired,
  with the expiry warning visible. It is a historical fixture snapshot.
- Slow uploads, cancellation cleanup and concurrency-slot release are local
  HTTP/stream regression evidence. Netlify rate-limit saturation and broad
  denial of service resistance were not tested. No hosted credentials,
  wallet, signing, approvals, order submission, RPC or live trade was added.

Gate 9 is complete for the existing TEST_FIXTURE service. Gate 0 and vendor
signature semantics remain open. This evidence-only update uses
`[skip netlify]` to preserve the exact verified production artifact.

## Browser-response release, 2026-10-07 10:06 UTC

[PR #25](https://github.com/Tajudeeen/remain/pull/25) merged as `8e3609e4c0c29131b08f42666ed2936d8e2f5d0b`. Netlify production deploy `6ac61970871cbf0008eb5b2a` published at 10:05:51.462 UTC with that exact commit. The source remains private and the hosted surface remains TEST_FIXTURE with live execution disabled.

- Full local verification and coverage passed 653 tests. Eight actual-page regressions failed before implementation and passed after it. The response module reached 100% line coverage. The shared-context local HTTP smoke passed for local commit `b30ef74c9d672e4b34cb2e9fc97cf9b5b61f67bc`. No local real-browser pass is claimed.
- [PR CI 37604799132](https://github.com/Tajudeeen/remain/actions/runs/37604799132), [push CI 37604793574](https://github.com/Tajudeeen/remain/actions/runs/37604793574) and [main CI 37605083803](https://github.com/Tajudeeen/remain/actions/runs/37605083803) passed all 653 tests, coverage, history/source checks, container smoke and real-browser checks. The new browser checks rejected altered planner amounts and unknown receipt states, recovered through retry and expired a snapshot despite wall-clock rollback. Existing navigation, download and five-width checks also passed.
- [Independent HTTPS smoke 37605083674](https://github.com/Tajudeeen/remain/actions/runs/37605083674) matched the exact merged SHA at 10:05:54 UTC and passed at 10:05:57 UTC. It verified the new browser response module was served, along with existing planning, receipt, request-rejection and absent-execution checks.
- The production browser at `https://remain-cash.netlify.app/#proof` loaded the fictional receipt and showed three events, matched fixture accounting, 75 retained stock raw units and 25000000000000000000 net cash raw units. The source remained UNAUTHENTICATED. [The production screenshot](images/browser-response-20261007.jpg) captures this fixture inspection, not an authenticated trade.
- The same production browser then completed the 25-cash, 70%-floor planner at `https://remain-cash.netlify.app/#dashboard`, showing 25 stock debit, 75 retained units and minimum 25.00 synthetic USDT after browser response validation.
- Oversize/stalled response and unresponsive-cancellation claims are local stream/VM regression evidence. Malformed-response UI recovery and clock rollback are real-browser CI evidence. No production load test or malicious-server authentication guarantee is claimed. No Binance credentials, wallet, signature, allowance, submission, RPC or live trade were added.

Gate 10 is complete for the fixture browser response boundary. Gate 0, vendor signature semantics and actual submission readiness remain blocked. This evidence-only update uses `[skip netlify]` to preserve the exact verified production artifact.


## Prepared-integration release, 2026-10-07 17:32 UTC

[PR #27](https://github.com/Tajudeeen/remain/pull/27) merged as `f083c8b25c093a8a8a259f6277820150614f2efc`. Production deploy `6ac681fc1a2a910008de5df7` published at 17:31:56.111 UTC with that exact commit. The tested tree equals the merged tree. Source remains private. The fictional planner remains `TEST_FIXTURE` and the separate setup page is `READ_ONLY_SETUP`.

- 693 local tests, full verification, coverage and source/history pattern checks passed. The wallet adapter and integration projection have 100% local line coverage. Browser page event handling is covered by remote acceptance rather than claimed as local unit coverage.
- [PR CI 37609868439](https://github.com/Tajudeeen/remain/actions/runs/37609868439), [push CI 37609864317](https://github.com/Tajudeeen/remain/actions/runs/37609864317) and [main CI 37659754692](https://github.com/Tajudeeen/remain/actions/runs/37659754692) passed full verification, coverage, history screen, terminal rehearsals, container smoke and real-browser tests. The new public setup page passed five widths. A controlled fixture wallet/local inspector covered wrong chain, empty holdings, a fixture structural pass with signing still locked, malformed response recovery, account changes, input races and clear.
- [Exact-build HTTPS smoke 37659754659](https://github.com/Tajudeeen/remain/actions/runs/37659754659) matched `f083c8b25c093a8a8a259f6277820150614f2efc` at 17:31:58 UTC and passed at 17:32:01 UTC. It verified new browser modules, fixed unconfigured readiness and a 503 inspection denial alongside existing planner, receipt and execution-absence regressions.
- The production browser opened `https://remain-cash.netlify.app/#live`, displayed local setup required, no selected account, disabled held-stock inspection and unverified signing/execution gates. Recheck server returned the same locked status. [Screenshot](images/integration-workspace-20261007.jpg). No wallet-connect action was taken. Browser extension metadata errors were observed separately from app behavior. A full-page screenshot timed out, so the saved evidence is a viewport capture.
- No credentials were read or hosted, no real Binance request was made, and no signing, approvals, orders or trades were performed. A local read pass cannot establish authenticated ownership, vendor economic enforcement or settlement.

Gate 11 is complete for prepared read-only integration. Actual live RFQ feasibility, signing semantics, execution, settlement and submission readiness remain unresolved. This evidence-only commit uses `[skip netlify]` to preserve the verified production artifact.

## Cash-search release, 2026-10-08 00:35 UTC

[PR #29](https://github.com/Tajudeeen/remain/pull/29) merged as `1a3d8d64d481acda34516473d2ef7488f2754a90`. Production deploy `6ac6e53bb10d420008bc3d1a` published at 00:35:22.405 UTC with that exact commit. The remote proposed and merged trees match the locally tested files. Source remains private and execution remains disabled.

- Eight failures were reproduced before their respective fixes. Eighteen new search-boundary tests bring the suite to 711 passing tests. Full local verification, coverage, source policy and tracked-history pattern checks passed. The search boundary and solver each have 100% line/function coverage, with 95.92% and 95.28% branch coverage respectively. Coverage also caught a scheduler timing edge which was corrected before the final green checks.
- [PR CI 37708342526](https://github.com/Tajudeeen/remain/actions/runs/37708342526), [push CI 37708340170](https://github.com/Tajudeeen/remain/actions/runs/37708340170) and [main CI 37708537517](https://github.com/Tajudeeen/remain/actions/runs/37708537517) passed full verification, coverage, source/history screens, terminal rehearsals, container smoke and complete real-browser tests. The existing 50-landscape exhaustive search oracle remains green.
- [Exact-build HTTPS smoke 37708537529](https://github.com/Tajudeeen/remain/actions/runs/37708537529) matched the merged build at 00:35:26 UTC and passed at 00:35:28 UTC. Normal accounting, paused-market blocking, ambiguous-input rejection, receipt consistency checks and absent execution endpoints passed. Public live inspection remains unconfigured.
- The production browser opened `https://remain-cash.netlify.app/#dashboard` and confirmed the normal 25-cash/70%-floor plan returns 25 stock debit, 75 retained units and minimum 25.00 synthetic USDT. A 40-cash target with the same floor blocked without a selected sell amount. [The viewport screenshot](images/search-boundary-20261008.jpg) captures the passing fictional plan within its review window. No wallet connection was attempted.
- Stuck waits, clock changes, malformed provider arrays and late replies are prepared-module regression evidence. Production did not receive malformed vendor data, and no live adapter, credentials, Binance request, signing, approval, order or trade was added.

Gate 12 is complete for planning/search boundaries. Live RFQ feasibility, vendor economics, signing semantics, settlement and submission readiness remain unresolved. This evidence-only update uses `[skip netlify]` to preserve the verified runtime.
