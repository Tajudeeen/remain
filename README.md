# Remain

Hosted rehearsal: [remain-cash.netlify.app](https://remain-cash.netlify.app/). Netlify deployment uses the existing synthetic planner through a bounded serverless function. See [deployment evidence](docs/netlify-deployment.md). The source remains private and the hosted demo keeps live execution disabled.

Raise cash. Stay invested.

Remain works backward from a USDT cash target to a bounded partial sale of a tokenized-stock position on BNB Smart Chain. BellGuard checks market state, quote freshness and user limits. The intended result is a reconciled settlement receipt showing cash received and exposure retained.

## Current state

Milestone 0 feasibility kit, Milestone 1's standalone cash solver and BellGuard, Milestone 2's interactive planning rehearsal, Milestone 3's standalone fixture order journal and settlement checks, and Milestone 4's canonical fixture proof receipt with an independent verifier. Execution is disabled. There is no live wallet flow or deployed trading product. The interface uses an explicitly fictional position and the actual planning engine. After historical compliance/schema rejections, the owner reported a successful AALon stock-identity and fresh-market read on 2026-10-07. A real held-position RFQ/build remains required before live integration. See [milestone status](docs/milestone-status.md) and [access troubleshooting](docs/access-troubleshooting.md).

This repo stays private until the owner approves public release. Nothing here is financial advice or a claim of Binance endorsement.

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

The kit includes exact-byte HMAC signing, a read-only endpoint allowlist, bounded responses and retries, input/schema validation, synthetic adversarial tests and sanitized evidence reports. No wallet-signing or trade-submission methods exist.

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

## Live discovery and feasibility

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
