# Remain

Public web app: [remain-paper.pages.dev](https://remain-paper.pages.dev/). The main deployment serves the explicitly labelled synthetic planning tools by default. This public repository now also contains an opt-in real-user wallet and hosted Binance read path, and a fail-closed gateway to the separately hosted durable execution service. Enabling either live backend requires real server-side deployment credentials and verified eligibility. Do not interpret the fixture planner or a configured gateway as proof of a funded trade. See [hosted-live product operations](docs/hosted-live-readonly.md) and [existing deployment evidence](docs/netlify-deployment.md).

Raise cash. Stay invested.


### Current public deployment (10 October 2026)

- **[Cloudflare Pages](https://remain-paper.pages.dev/)** is the current GitHub-connected free public host. **[Paper Studio](https://remain-paper.pages.dev/studio.html)** and same-origin TEST_FIXTURE planning/receipt APIs passed an independent, signed-out browser walkthrough at build `04a62622768d3c7407cbd51cc48402e76d58a025`.
- [Deployment runbook](docs/cloudflare-pages-hosting.md) explains how Pages keeps the hosted demo separate from the existing, execution-disabled Cloudflare Durable Object service.
- Legacy [Netlify deployment](https://remain-cash.netlify.app/) is outdated due to an exhausted or unavailable deployment allowance and **must not** be used for current judging. The code's live-RFQ and mainnet gates remain blocked.

## Paper Studio: complete risk-checked simulation

**[Launch the full interactive Paper Studio](https://remain-paper.pages.dev/studio.html)** or open `/studio.html` on a local build. Three fictional stock positions, a demo USDT ledger, cash-target search, user-controlled retained floor, six market conditions, a 45-second synthetic quote, explicit simulation-only order confirmation, a fictional fill and an inspectable SHA-256 receipt. No wallet or Binance API required; no on-chain trade is performed. Receipts verify supplied simulated accounting but have no blockchain authenticity. Full walkthrough and constraints: [Paper Studio specification](docs/paper-studio.md).



**Current audit:** [October 10 verification, remaining feature gaps and production blocker](docs/submission/audit-20261010.md). **Historical live-release status:** [Dated snapshot (October 9)](docs/submission/current-readiness-20261009.md). The newest GitHub code is not yet published by the Netlify production site because multiple builds were marked Skipped; consult the live `/healthz` commit before claiming the latest wallet and evidence features work publicly. The historical `docs/submission/packet.json` is not a current deployment certificate.

## Verified deployment and trust boundaries (October 9, 2026)

| Service | Public URL | Verified behavior |
| --- | --- | --- |
| Usable planning frontend | [Remain on Netlify](https://remain-cash.netlify.app/) | Live pages, a clearly labelled `TEST_FIXTURE` planner, optional wallet discovery and status reporting |
| Durable execution infrastructure | [Cloudflare health](https://remain.tajudeenowoeteniyan.workers.dev/healthz) | `journal: READY`, exact Git `buildSha`, private AES-GCM SQLite-backed Durable Object |
| Execution readiness | [Cloudflare execution status](https://remain.tajudeenowoeteniyan.workers.dev/api/execution/status) | `available: false`; no real-world sale or wallet signature can be initiated |
| External backup | [Cloudflare operations](docs/cloudflare-execution.md) | Format and isolated restore tested; external R2 bucket still `NOT_CONFIGURED` |

**This is a real deployed application with a clearly bounded rehearsal**, not a demonstration of a funded BSC stock sale. Binance's hosted RWA catalog has recently returned `ACCESS_COMPLIANCE_RESTRICTED`; moving to Cloudflare does not grant access. No sample RFQ, simulated receipt or green CI result should be represented as a completed live order.

The non-vendor release checklist is [here](docs/submission/non-vendor-evidence.md); the recommended truthful [3-minute demo walkthrough](docs/submission/demo-script.md) includes specific screens and cursor actions. The final developer-experience report must be written by the builder from their actual observations.



Remain works backward from a USDT cash target to a bounded partial sale of a tokenized-stock position on BNB Smart Chain. BellGuard checks market state, quote freshness and user limits. The intended result is a reconciled settlement receipt showing cash received and exposure retained.


### Verifiable on-chain balance observations

The wallet workspace can capture an ERC-20 balance at a specific BSC block, download a private JSON record, and recheck it against another BSC RPC without signing, custody, a fabricated holding or a price estimate. This is a replayable RPC observation, **not** a Merkle storage proof or settlement proof. See [how to verify recorded balances](docs/onchain-balance-evidence.md).

### Wallets on mobile and desktop

Remain now discovers EIP-6963 wallets (with a legacy injected fallback), lets you choose the provider, and can hand off a phone browser to MetaMask or Trust Wallet's in-app browser. An explicit BSC network-switch prompt is available when the chosen wallet is on the wrong chain. [Mobile wallet setup and remaining WalletConnect limitation](docs/mobile-wallet.md). All connection requests require user action; app handoff is not a WalletConnect QR pairing session.

## Current architecture, October 2026

This branch's [product-realism audit](docs/product-realism-audit.md) explains which screens read actual chain or market data and which optional routes remain test fixtures. The homepage reports actual service configuration, the wallet can verify ERC-20 balances and scan supported RWA identities in bounded batches, and real cash targets are entered by the user rather than defaulted to the fictional demo numbers. No deployed backend availability, price, or settlement is invented.

Users do not need the builder to hold stocks. BSC wallets can verify a held ERC-20 token balance through their injected wallet RPC, and the supported-stock picker can retrieve identities from a configured Binance RWA catalog. Hosted position reads, cash previews, and unsigned order checks are available when Netlify Functions receives authorized Binance credentials and `REMAIN_HOSTED_READ_ONLY=true`. The separate CoW execution path can be connected through `REMAIN_EXECUTION_PROXY_ENABLED=true` only after its persistent HTTPS execution service has independently passed the release gates. The demo remains available and labelled as fiction. No funded mainnet sale is asserted. Details: [Hosted live product](docs/hosted-live-readonly.md).

## Earlier milestones and release evidence

Gate 17 adds [live preflight and operations tools](docs/live-operations.md): an offline configuration doctor, read-only CoW payload check, encrypted SQLite backup/drill, exact-build execution-host smoke, independent live-evidence recheck and `submission:status -- --live` for genuine-evidence owner review. The configured execution browser path also has a separate synthetic end-to-end harness. None of these tools requests a financial action or changes activation flags. Actual held-stock compatibility, persistent hosting and funded settlement still require real evidence.

The [prepared execution service](docs/execution.md) adds a strict CoW BSC sell profile, authenticated wallet review, exact approvals, owner-recovered EIP-712 signatures, a one-attempt encrypted journal, cancellation checks and two-RPC settlement accounting. The [sale-review page](https://remain-cash.netlify.app/#trade) is included in this release, with execution unavailable on Netlify. Persistent HTTPS Node hosting is packaged separately. Actual vendor compatibility, funded settlement and operator activation remain unverified. Read its contract before configuration. The prepared release passed 835 tests, full real-browser/container verification and exact-build HTTPS smoke. See [the pinned release evidence](docs/netlify-deployment.md#prepared-execution-release-2026-10-08-2344-utc). Retained-floor and market checks are preflight conditions rather than atomic on-chain guarantees.

The cash solver, BellGuard, fixture order journal, settlement accounting and receipt verifier are implemented and deployed as a fictional rehearsal. The integration workspace adds opt-in browser account discovery and a loopback-only held-stock inspection using the existing read-only Binance harness. The public UI cannot be treated as proof of a successful Binance inspection or quote; read-only hosting is configured but live catalog access is currently restricted. Execution is disabled. After historical compliance/schema rejections, the owner reported a successful AALon stock-identity and fresh-market read on 2026-10-07. A real held-position RFQ/build, vendor signing semantics and independently reconciled settlement remain unverified. See [milestone status](docs/milestone-status.md), [integration setup](docs/integration-workspace.md) and [access troubleshooting](docs/access-troubleshooting.md).

This repository is public; confidential API keys and wallet signatures must stay outside the source. Nothing here is financial advice or a claim of Binance endorsement.

The local integration workspace also has a [selected-position preflight](docs/position-preparation.md). It distinguishes reported raw holdings from unknown data and prepares exact inspection units using actual token decimals. It performs no quote/build request, preserves every unverified live gate and is unavailable on the hosted demo.

The prepared [cash-target preview](docs/cash-preview.md) reads a fresh selected holding and market, then explores up to eight stock-to-USDT RFQ estimates within your retained-input cap. Enter the cash you want, percentage to keep and reported-impact limit in the local workspace. It shows the smallest qualifying observed input and estimated cash, with fees, total debit, minimum payout and vendor deadline still unverified. It never requests a build or enables a trade. The public endpoint stays unavailable and BellGuard's executable-minimum requirement is unchanged. Release verification passed 778 tests plus remote real-browser, container and exact-build HTTPS checks.

A separate [Review unsigned order](docs/cash-order-review.md) action now connects a fresh cash candidate to the prepared build path. It rereads the holding and market, refreshes the exact selected input and venue, checks the unsigned build against that quote and displays changed estimates separately. It never substitutes a venue or requests a signature. Live trading stays locked while actual held-position and vendor economic evidence are pending.

The unsigned-review release passed 804 tests, complete remote browser/container checks and exact-build HTTPS verification. [PR #35](https://github.com/Tajudeeen/remain/pull/35) is merged and deployed. See [release evidence](docs/netlify-deployment.md#cash-order-review-release-2026-10-08-1315-utc). The new review action is local-only and no live proof gate is closed.

Private submission preparation is available in [the evidence index](docs/submission/evidence-index.md), [demo storyboard](docs/submission/demo-script.md) and [DevEx worksheet](docs/submission/devex-worksheet.md). The final report must be owner-authored. `npm run check:submission` validates the packet while reporting `submissionStatus: BLOCKED`. `npm run submission:status` exits 1 until the actual gates can be reviewed through a later live-evidence milestone. `npm run screen:history` produces a sanitized tracked-text pattern report, not a proof that secrets are absent. See [release requirements and checks](docs/submission/release-checklist.md).

![Synthetic Remain planning interface. No live stock holdings or settlement.](docs/assets/planning-desktop.png)

[Mobile rehearsal screenshot](docs/assets/planning-mobile.png). Both images use fictional data.

## Local verification

Requires Node.js 24 and npm.

```sh
npm ci
npm run verify
npm run test:coverage
```

The kit includes exact-byte HMAC signing, a read-only endpoint allowlist, bounded responses and retries, input/schema validation, synthetic adversarial tests and sanitized evidence reports. The separate prepared execution adapter never retries submission automatically and requires explicit owner wallet confirmation. It stays disabled by default and unavailable on Netlify.

## Cash-planning rehearsal

Open the interactive interface without API credentials or a wallet:

```sh
npm run dev
```

Visit `http://127.0.0.1:3000`. A brief, skippable logo introduction leads to the landing page. Choose “Try the cash planner” to open the dashboard, or use `/#dashboard` directly. The splash skips repeat visits within a tab session and reduced-motion users. Navigation supports browser back/forward and keyboard focus. Both views share a footer with project status, limitations and builder links.

Enter a cash target, choose a retained floor and test regular, closed or paused market scenarios. BellGuard shows a bounded synthetic result. Changing an input clears the old result. The inspection window expires after 15 seconds. Downloads are labelled synthetic planning records, never settlement receipts. An original textless mark and graphite, cream and Binance-inspired yellow define the interface. Read the [interface contract](docs/planning-interface.md).

For automated browser verification, install its pinned development-only browser tool first:

```sh
npx --yes agent-browser@0.38.2 install
npm run test:web
```

On Linux, browser system dependencies may require `install --with-deps`. This tool is isolated from the production dependency tree. GitHub CI installs it, tests the real browser flow and uploads five labelled synthetic screenshots. Local development binds to loopback. Public fixture deployment requires an explicit host allowlist and remains a rehearsal service, never a production trading backend.

For a terminal-only rehearsal:

```sh
npm run rehearse:plan
```

This synthetic rehearsal raises a 25 USDT target while preserving a token floor, rejects an unreachable 40 USDT target and blocks a closed market without permission. It uses no API keys, HTTP requests or wallet. The planning engine handles exact integer units, cash and stock fee bounds, quote search budgets, stale facts, cancellation and immutable evidence. It selects the smallest safe total debit observed, never claims a globally minimal fill and always disables execution. Read the [planning contract and limitations](docs/planning-engine.md) before integrating it.

## Order recovery and settlement rehearsal

```sh
npm run rehearse:orders
```

This standalone backend rehearsal binds a passing fixture plan, persists an uncertain attempt in SQLite, reopens it with the same request ID, observes a fictional fill and independently checks its fictional transfer/balance evidence. A later fictional reorg invalidates the match. The temporary database is removed. There are no network calls or browser order controls. Read the [journal contract, invariants and storage limitations](docs/order-journal.md). Synthetic matches never establish a settled mainnet trade.

## Proof receipt rehearsal

The [receipt workspace](https://remain-cash.netlify.app/#proof) adds browser inspection of fixture receipts. Load the fictional demo or select a fixture JSON file, replay its journal/accounting checks and download a bounded inspection result. The source remains UNAUTHENTICATED after a pass. Remote browser/container checks and independent HTTPS verification passed. See [workspace contract](docs/receipt-workspace.md) and [deployment record](docs/netlify-deployment.md).

```sh
npm run rehearse:receipt
```

This fixture-only flow creates a canonical receipt only after synthetic settlement reconciliation passes. Its independent verifier recomputes settlement, binding and receipt integrity and rejects tampering. Read [proof receipt and provenance](docs/proof-receipt.md).

## Fixture deployment hardening

The rehearsal can be packaged in the committed non-root Docker image. A public bind fails closed unless `REMAIN_ALLOWED_HOSTS` names the exact public hostname. `/healthz` exposes only fixture readiness, execution remains disabled, and `npm run smoke:deployed` verifies the deployed surface from outside. See the [deployment runbook](docs/deployment-runbook.md).

The Netlify fixture deployment passed an independent external HTTPS smoke. See [deployment evidence](docs/netlify-deployment.md). This establishes the synthetic demo surface only; live integration remains blocked.

Gate 9 hardens the public planning boundary with duplicate-key rejection, strict data/enums and bounded upload lifetimes. Runtime releases automatically wait for their exact build identity before external HTTPS checks. See [request handling and verification limits](docs/request-boundary.md).

Gate 10 hardens the receiving browser: bounded streamed responses, duplicate-aware parsing, checks against the submitted cash intent, atomic receipt validation and retry after malformed responses. A monotonic timer prevents a wall-clock rollback extending the review window. These checks establish fixture display consistency only. See [browser response contracts and limits](docs/browser-response.md).

## Live discovery and feasibility

The app's [Live setup workspace](https://remain-cash.netlify.app/#live) explains each activation gate. Optional wallet account discovery never requests a signature. To use the local inspector later, keep working credentials in ignored `.env.local`, set `REMAIN_LOCAL_READ_ONLY=true`, run `npm run dev`, and open `http://127.0.0.1:3000/#live`. Select BSC in your wallet, provide a supported stock contract you actually hold and its raw input amount. No stock holding is needed for the separate market diagnostic below. A read pass keeps execution disabled. See the [setup and trust boundary](docs/integration-workspace.md).

Latest owner-reported market run `a2a2b549-f749-4779-892e-cd204f37252d`, started 2026-10-07 06:55:47 UTC, passed current stock identity and fresh selected-stock market checks for AALon. It reported `overnight`/`true`; observed endpoint durations were 1,294 ms for the catalog and 236 ms for the fresh market read. This is one owner-provided local sample, not independently executed or authenticated here. See [sanitized observation](docs/observations/owner-market-a2a2b549-f749-4779-892e-cd204f37252d.json).

Discovery preserves validated stock identities and labels unreadable catalog market fields as unavailable/null. Partial catalogs exit 1 and do not certify tradability. Held-position feasibility still requires a separate fresh selected-stock market response, real balance, matching RFQ and inspectable unsigned build. The owner reports no stock holding, so the full live gate remains blocked. See [access diagnostics](docs/access-troubleshooting.md).

Apply for a Web3 API key at [Binance developer portal](https://web3.binance.com/en/dev-portal). Keep both credentials outside git. Put these in an ignored local `.env.local`, or GitHub Actions secrets:

- `BINANCE_WEB3_API_KEY`
- `BINANCE_WEB3_SECRET_KEY`

First discover supported public stock metadata. This requires only those two credentials:

```sh
npm run discover:binance
```

If you do not hold a stock yet, check one discovered token's fresh market data instead of running the held-position smoke. Pass the public stock contract explicitly:

```sh
npm run market:binance -- 0xYOUR_DISCOVERED_STOCK_CONTRACT
npm run inspect:binance
```

This uses only the API key and secret. Your wallet and raw sell amount are ignored. It validates the selected BSC stock identity, then the token-specific fresh market response, and saves `evidence/binance-market-<run-id>.json`. Unknown, paused, restricted, stale or mismatched responses remain blocked. A pass means this limited market read succeeded, with `scope: SELECTED_STOCK_MARKET_READ_ONLY`, `liveFeasibility: NOT_ESTABLISHED` and execution disabled. Closed-market data can be readable without granting trading permission. It makes no balance, quote, build, signing or submission call. See [holding-free market checks](docs/access-troubleshooting.md#market-check-without-a-stock-holding).

Inspect the newest local discovery or smoke report without credentials or networking:

```sh
npm run inspect:binance
```

The inspector chooses the newest discovery, market or smoke report by start time, marks old reports historical, summarizes fixed validation labels and caps affected stock samples at five. It never echoes arbitrary error text, notes, raw payloads or balances. Files are untrusted local claims, so every summary keeps `liveGate: UNVERIFIED`. Exit 1 preserves blocked, partial, fixture, historical, legacy or empty-catalog status. Exit 2 means missing/unsafe evidence. Exit 0 only means a recent self-reported pass was inspected, not that Gate 0 closed. Market summaries show observation age separately and leave held-position RFQ pending. To inspect a specific saved report, pass its path after `--`. See [local evidence inspection](docs/access-troubleshooting.md#inspect-the-newest-local-result).

Then configure these three non-secret values locally or in GitHub Actions repository variables:

- `REMAIN_WALLET_ADDRESS`: your public BSC wallet address. Never a key or seed.
- `REMAIN_RWA_TOKEN_ADDRESS`: a supported BSC stock contract returned by discovery, already held by this wallet.
- `REMAIN_SELL_AMOUNT_RAW`: positive integer raw-token units within that balance. Calculate using that token's observed decimals, never assume 18.

```sh
npm run smoke:binance
```

Smoke reads chain support, stock metadata, market state and holdings, requests a stock-to-USDT RFQ quote and builds an unsigned payload. It requires inspectable EIP-712 structure. It never approves, signs, submits or broadcasts. Evidence lands in ignored `evidence/` with private file permissions. This gate proves read-only feasibility only. Semantic order verification, signature safety, settlement and live trades are later gates.

Gate 8 adds bounded recursive type/value validation, duplicate-key rejection and unsigned build-to-quote binding. Run `npm run rehearse:rfq` without credentials for the fictional tamper rehearsal. Smoke reports expose a redacted `rfqReview` with signature semantics UNVERIFIED and execution disabled. Older saved reports require a rerun. Read the [RFQ inspection contract and remaining vendor checks](docs/rfq-review.md).

GitHub has a manual **Binance read-only feasibility** workflow with `discover` and `feasibility` modes on `main`. It offers `github-hosted` or an owner-configured `self-hosted` runner with label `remain-feasibility`. Use only a host authorized for Binance's service. Automated CI never receives Binance secrets. The manual workflow rejects missing configuration before networking and stops on compliance errors. Both modes preserve sanitized evidence even when they fail. Public discovery output contains only selected public token metadata. Smoke artifacts contain hashes and checks, never wallets, balances or raw payloads. Do not share an artifact as a settlement receipt.

## Plan and evidence

- [Build blueprint](docs/build-plan.md)
- [Product lock](docs/product-lock.md)
- [Security boundaries](docs/security.md)
- [Planning engine](docs/planning-engine.md)
- [Planning interface](docs/planning-interface.md)
- [Order journal and settlement rehearsal](docs/order-journal.md)
- [Proof receipt and provenance](docs/proof-receipt.md)
- [Fixture deployment runbook](docs/deployment-runbook.md)
- [Developer experience log](docs/devex-log.md)

The dependency lockfile is committed. `npm run check:security` is a small source-policy check, not a security audit. No deployed custom contracts exist at this milestone.


Prepared integration release: [PR #27](https://github.com/Tajudeeen/remain/pull/27), 693 tests, complete remote browser/container checks and an exact-build HTTPS pass. [Setup workspace](https://remain-cash.netlify.app/#live) is deployed. Public inspection stays locked. See [release evidence](docs/netlify-deployment.md#prepared-integration-release-2026-10-07-1732-utc).
