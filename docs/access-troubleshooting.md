# Binance compliance rejection: 40304

## Inspect the newest local result

Run from the updated Remain repository directory on your own PC:

```sh
git pull --ff-only origin main
env -u BINANCE_WEB3_API_KEY -u BINANCE_WEB3_SECRET_KEY npm run discover:binance
npm run inspect:binance
```

The `env -u` command is for Git Bash. It clears inherited credentials for that invocation so Node reads the existing `.env.local`. It does not edit the file. PowerShell users can run `npm run discover:binance` after confirming no stale process-level credential overrides. Use your approved direct connection. Never share `.env.local`.

The inspector needs no credentials and makes no network requests. It reads only matching discovery/smoke filenames in ignored `evidence/`, chooses the newest report by `startedAt`, and shows its run ID, timestamp, self-reported status, age, fixed error/check labels, market issue counts and at most five affected public contracts. Copying an old file does not make it a new observation. It ignores unknown fields rather than echoing their content. Malformed candidates stop automatic selection instead of silently falling back to an older pass. Use `npm run inspect:binance -- evidence/binance-discovery-<run-id>.json` for an explicit report.

All summaries retain `source: LOCAL_FILE_UNAUTHENTICATED`, `liveGate: UNVERIFIED` and `executionEnabled: false`. A file can be edited, fabricated or produced by a mock. The inspector is diagnostic tooling, not authenticated evidence, a trading gate or a signature verifier. A recent timestamp does not refresh an expired quote or establish tradability. Reports older than 15 minutes are marked historical for troubleshooting. This cutoff is unrelated to quote validity.

| Exit | Meaning |
| --- | --- |
| 0 | Inspected a recent self-reported live read-only pass with current format and nonempty discovery coverage, or the exact smoke check list. This does not close Gate 0. |
| 1 | Inspected a blocked, partial, fixture, historical, legacy or empty-catalog report. |
| 2 | Missing, oversized, malformed or inconsistent evidence, unsupported path, symlink, future clock anomaly, or too many candidate files. No raw contents are printed. |

Share this compact output from the new run. For a partial catalog, identify a stock your wallet actually holds, configure its discovered contract and explicit raw amount, then run `npm run smoke:binance`. Fresh selected-stock market validation still precedes balance/quote/build. An unavailable catalog field is never converted into permission to trade. Compliance rejections require support/access review before another live attempt.

## Stock catalog with unavailable market metadata

On 2026-10-07 the owner supplied an excerpt in the updated format. AXTIB (`AXTI`, issuer `bstock`) reported null market status and `receivedType: null`; AALon and DRSon (`ondo`) reported readable `regular`/`true`. No run ID, timestamp, full catalog or top-level count/status was included. These are owner-provided API observations, not a fresh-market feasibility check, trading permission or independent exchange-session evidence. Unknown state for one row does not establish that all stocks from its issuer behave the same way.

The owner supplied run `a19fb351-ae16-4280-b12e-8659e276baeb`, started `2026-10-06T19:09:34.511Z`, with `validationCheck: DISCOVERY_MARKET_STATUS`. This owner-reported run passed the HTTP/envelope checks and reached a BSC stock record whose `statusInfo.marketStatus` was not a string. Its actual type and value remain unknown; the diagnostic does not establish a null field, numeric enum or new mapping.

Discovery now separates validated stock identity from advisory catalog market metadata. Invalid identities still reject the catalog. Unreadable market metadata preserves the identity, emits `marketMetadataStatus: unavailable`, sets both `marketStatus` and `openState` to null, and returns fixed `marketIssues` labels with type names only. No missing or unexpected value is inferred to mean open or closed. Recognized status strings use the documented six-value enum.

A catalog containing any unavailable market record returns `status: partial` and exits 1. Valid records remain visible. `scope: STOCK_IDENTITY_DISCOVERY_ONLY`, notes and `executionEnabled: false` explicitly prevent confusing discovery with tradability, feasibility or a trade. Even a fully readable discovery is not authorization to execute.

Feasibility uses the token list for selected-stock identity, then requires the separate `/rwa/underlying-market` response to pass strict market checks before wallet, quote or unsigned-build requests. Missing/malformed fresh data, unknown enums, paused markets, maintenance and asset restrictions stop that path. Catalog status never replaces this fresh check.

After updating the PC checkout, rerun discovery without modifying valid credentials. Share the sanitized `status`, `unavailableMarketCount`, relevant public stock entries and `marketIssues`. The catalog issues include only received type names, not raw market values. Quotes and inspectable RFQ payloads remain unverified.

## Latest owner-reported discovery result

On 2026-10-06 the owner supplied discovery run `7c80fd96-18b2-4687-92ec-bae8263ed4df`, which returned `UPSTREAM_SCHEMA_INVALID` without an upstream code. This is an owner-reported result, not a request independently executed here. It means a local validation check failed. It does not establish successful authentication, clearance of the earlier compliance rule, a valid stock list, or a quote. HTTP 200 non-JSON pages and malformed API envelopes can reach this error too.

The previous generic error hid which check failed. Errors now emit an additional fixed `validationCheck` label. Advisory catalog market failures instead appear in `marketIssues` on a partial catalog. Neither path emits raw response bodies, arbitrary provider field names, credentials, signatures or wallet material:

| Label | Rejected expectation |
| --- | --- |
| `RESPONSE_BODY`, `RESPONSE_BODY_LIMIT` | A response stream within the size limit |
| `RESPONSE_JSON` | JSON rather than an HTML page or other text |
| `ENVELOPE_CODE` | Numeric business success code `0` |
| `ENVELOPE_SUCCESS` | The response must not declare failure |
| `ENVELOPE_TIMESTAMP` | A finite numeric server timestamp |
| `ENVELOPE_DATA` | A present `data` field |
| `DISCOVERY_LIST`, `DISCOVERY_ROW` | An array of token objects |
| `DISCOVERY_SYMBOL`, `DISCOVERY_TICKER`, `DISCOVERY_ISSUER` | String token identity metadata |
| `DISCOVERY_DECIMALS`, `DISCOVERY_ADDRESS` | Bounded decimals and a valid nonzero token contract |
| `DISCOVERY_STATUS`, `DISCOVERY_MARKET_STATUS`, `DISCOVERY_OPEN_STATE` | Status object with a string market status and boolean open state |
| `MARKET_RECORD`, `MARKET_STATUS`, `MARKET_OPEN_STATE` | Strict fresh market response required by feasibility |

Update your existing checkout with `git pull --ff-only origin main` while on `main`, then run `npm run discover:binance` from the repository directory. Keep credentials in `.env.local`, not only `.env`. Do not copy the blank template over a file that already contains credentials. Share only the sanitized report from the new run. Do not share raw API responses or `.env.local`. If a check fails, investigate that specific shape against the official [RWA REST schema](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data); do not coerce an unobserved alternative shape merely to obtain a pass.

## Verified finding

[Discovery run 37413704037](https://github.com/Tajudeeen/remain/actions/runs/37413704037) failed at 2026-10-06 04:26 UTC after installation and verification passed. Binance returned business code 40304. It was an access rejection before any held-stock quote/build request, signature or submission.

Binance's [complete docs](https://web3.binance.com/en/dev-docs/llms-full.txt) define 40304 as a compliance restriction whose more specific rule is not identified. Its [service restrictions](https://web3.binance.com/en/dev-docs/web3-api-prohibited-regions) enforce client/server IP checks. This run did not establish runner country, valid credentials, key permissions, project approval or the exact restriction.

| Code | Safe classification | Action |
| --- | --- | --- |
| 40301 | Region restricted | Stop and confirm eligibility with Binance |
| 40302 | Proxy/VPN rejected | Use an authorized direct connection or ask support |
| 40303 | IP activity restricted | Stop and contact Binance support |
| 40304 | Compliance rule blocked | Confirm operator and host eligibility and project approval with Binance |

These failures never retry automatically, even inside HTTP 200 or alongside a 5xx status. Messages are local allowlisted descriptions, not echoed provider text. No proxy, VPN, location spoofing or restricted-user access workaround is implemented.

## Fastest diagnostic path

Check your Web3 developer project is approved and the key belongs to that project. Use your own authorized environment with a direct connection in a supported location. Run local discovery there to isolate a GitHub-hosted environment issue. If it also returns 40304, stop and ask Binance support to identify the rule. Do not repeatedly change locations or rotate keys to sidestep an access restriction.

On your own Windows machine, with Node.js 24 installed:

```powershell
git clone https://github.com/Tajudeeen/remain.git
cd remain
npm ci
npm run verify
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
npm run discover:binance
```

Enter the two Binance credentials only in `.env.local`. The three wallet/token/amount values are unnecessary for discovery. The local file and evidence folder are ignored. Never send a private key, seed, raw response or credential to chat. Discovery evidence contains selected public token metadata or a safe error.

## Optional private-repo runner

If you want to keep credentials in GitHub Secrets, register a runner on your own approved host instead of copying the API credentials locally. In [Settings, Actions, Runners](https://github.com/Tajudeeen/remain/settings/actions/runners), choose New self-hosted runner and follow the current generated instructions for that machine. Add the custom label `remain-feasibility` when configuring it. Run only while you intend to accept the reviewed manual job.

The manual Binance workflow accepts runner `self-hosted`, matches that label and remains restricted to `main`. Automated pull-request CI still uses hosted runners without Binance credentials. A missing self-hosted runner leaves the job queued, not passed. Provisioning a runner is an owner action, not something this repo has completed. The host must itself be authorized for the service. This is not proof that Binance will accept it.

Treat this as a dedicated or ephemeral runner, not an unattended general-use machine. Stop/remove this runner before public release and review runner access first. GitHub [recommends private repositories](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners) for self-hosted runners because executing untrusted workflow code can compromise the machine.

## What closes the gate

Discovery success establishes only readable supported stocks. A second feasibility run must read a real held position, obtain a matching stock-to-USDT quote and inspect unsigned typed data. Then gate 0 can close. No signature or trade is authorized by either check.
