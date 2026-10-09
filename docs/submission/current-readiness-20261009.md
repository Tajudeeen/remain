# Remain — current release readiness (9 October 2026)

This is a **dated, source-linked operational snapshot**, NOT a submission approval or a funded trade certificate.
The fixture validator `docs/submission/packet.json` is a historical October 8 preparation packet;
its recorded SHA and PENDING labels must **not** be presented as current production facts.

## Deployed and verified

| Surface | Identity on 2026-10-09 | Evidence | Honest meaning |
| --- | --- | --- | --- |
| Public GitHub | `Tajudeeen/remain` main `96c1a197de17cf1f250385cc28fde2da2112357a` after PR #45 (then new changes under review) | [main repository](https://github.com/Tajudeeen/remain) | Public source accessible, no financial signoff |
| Netlify public frontend | `08e5cd79a89fd0af41499f68dd2764ce1b502a09`, deploy `6ac90c72947b9f0008c62e9e` | [health check](https://remain-cash.netlify.app/healthz) | **Older build**. Published browser does NOT yet include latest wallet provider or block-evidence changes |
| Cloudflare private ledger Worker | Source identity checked at `73e2e1e375d6893be9b07dd3b9ed55efe2b2808e`; automatic build follows main | [health check](https://remain.tajudeenowoeteniyan.workers.dev/healthz) | Durable SQLite journal READY, backup NOT_CONFIGURED, financial execution OFF |
| Hosted Binance RWA catalog | Configured access but HTTP 502 from catalog endpoint | [status](https://remain-cash.netlify.app/api/live/status) | Configured credentials alone do NOT prove upstream authorization |
| Production execution | `available:false` on both deployed services | [public status](https://remain.tajudeenowoeteniyan.workers.dev/api/execution/status) | Correct fail-closed trading gate |

## What truly works in an unauthenticated production browser

An independent non-wallet UI walkthrough passed on October 9:
[visible recorded browser-run record](https://agent.tinyfish.ai/runs/a11fa678-1272-49c5-9015-344543971f8d).

- Homepage and navigation render.
- Fixture planner: request 25 synthetic USDT and retain 70% ⇒ 25 synthetic USDT output and 75 units remaining.
- Paused-market scenario blocks.
- Fictional receipt loads for consistency verification.
- Wallet-entry screen and trading-unavailable screen render without fabricated wallet holdings.

**Not verified there:** a genuine extension connection, BSC RPC response from a user wallet, funded stock position, RFQ, signing, mainnet fill, or offsite R2 restore. Browsers without injected wallets need an official in-app browser handoff; WalletConnect QR is not provisioned.

## Current CI

- [Main CI for PR #50](https://github.com/Tajudeeen/remain/actions/runs/37960015571) passed 888 tests, five-width browser fixture, container smoke and synthetic execution/reorg suite.
- [Main CI for truthful-market-status PR #52](https://github.com/Tajudeeen/remain/actions/runs/37962994496) passed after fixing inaccurate “market connected” wording.
- [Production exact-build smoke for #50](https://github.com/Tajudeeen/remain/actions/runs/37960015531) failed `DEPLOYMENT_NOT_READY`: published Netlify SHA differed from GitHub.
- [Actual public site](https://remain-cash.netlify.app/) remains **TEST_FIXTURE**; no live trading available.

## Next tasks that do not require Binance

### Release owner action: Netlify build is being skipped
Connected Netlify metadata and unauthenticated [deploy dashboard](https://app.netlify.com/projects/remain-cash/deploys)
show that **several recent main commits have Skipped deploys**, despite an existing
GitHub connection to `Tajudeeen/remain` and production branch `main`.
The permitted Netlify connector exposes **no deployment-trigger or build-configuration write action**;
the browser profile currently lacks Netlify login. The app owner must sign into
their Netlify dashboard, inspect why builds are marked **Skipped** (look for ignored
build settings, paused automatic builds, branch/commit configuration), and trigger
a normal new production deploy of the newest reviewed `main`, without altering
confidential Functions secrets. Do not move to a new Netlify site or replace a live domain.
Then require `/healthz.buildSha` to equal exact Git SHA, all latest assets to load,
and **Deployed fixture smoke** on GitHub to pass. An older working fixture is not
a verified new release.

### Evidence and resilience
- CI-check and deploy the merged browser extension fix and block-pinned evidence
  from PRs [#50](https://github.com/Tajudeeen/remain/pull/50) and
  [#45](https://github.com/Tajudeeen/remain/pull/45); test with a real user-approved BSC wallet
  without signing or sending.
- Cloudflare account still requires owner-side **R2 enabling**. Until a private
  backup binding, encrypted upload, independent saved backup, and isolated restore
  are verifiably tested, keep `REMAIN_BACKUP_APPROVED=false` and all trading flags OFF.
- Recheck security headers, sensitive-source scan, exact build identities and links
  signed out from a clean browser.
- Record an accurate ≤4-minute demo. The final DevEx report must be written by
  the builder from actual personal API interactions (organizer forbids AI-authored
  final text). Registration and submission forms require owner confirmation.
- Keep all Binance restriction-dependent RFQ, sale, and 12-confirmation mainnet
  evidence out of claimed achievements. No workaround by unauthorized egress.

Tracker: [Issue #51](https://github.com/Tajudeeen/remain/issues/51).
