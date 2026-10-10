# Free Cloudflare Pages deployment for Remain

**Purpose:** Publish the current Remain site and Paper Studio without depending on Netlify's monthly usage quota or upgrading Cloudflare to Workers Paid.

## Host choice

Use **Cloudflare Pages (Free)** with GitHub integration. This is a separate web surface from the existing private Cloudflare Durable Object execution Worker. It does not deploy Cloudflare Containers, add R2, enable financial actions, copy Binance credentials or change the existing Netlify domain.

Cloudflare Pages Free currently permits 500 builds per month, with static asset delivery handled by Pages. Requests invoking Pages Functions share Workers Free invocation limits. Source: https://developers.cloudflare.com/pages/platform/limits/

## Git-connected setup

Connect the public `Tajudeeen/remain` GitHub repository to a new Cloudflare Pages project (suggested name: `remain-paper`).

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `npm run build && node scripts/stamp-cloudflare-build.js` |
| Build output directory | `dist/web` |
| Root directory | repository root |
| Build environment | `NODE_VERSION=24` |
| Functions compatibility date | `2026-10-01` |
| Functions compatibility flags | `nodejs_compat` |

Do not paste Binance credentials or secrets into the Pages project. In particular, `REMAIN_EXECUTION_ENABLED` must not be set to `true`.

The deployment includes `functions/_middleware.ts` for **only** `/healthz` and `/api/*`, routed using output `_routes.json`. All `.html`, `.js`, `.css` and image requests go through ordinary free static asset delivery. The Functions middleware reuses the hardened existing fixture handler, so the paper planner and receipt verifier work alongside `/studio.html`.

## What's live vs still blocked

- Available: homepage, Paper Studio simulated portfolio/trading, fixture cash planner, fictional receipt inspection, read-only wallet/browser RPC flows for a user's explicitly connected wallet.
- Not available: authenticated Binance market catalog, authenticated RFQs, signing, order submission, durable financial execution, mainnet settlement.
- `/api/live/status` reports `inspectionAvailable:false`. `/api/execution/status` reports `available:false`. There is no fake live feed or hidden proxy to the old Netlify deployment.

## Validation after build

1. Open the new `https://<project>.pages.dev/healthz` in a signed-out browser. It must report `service:remain-rehearsal`, `mode:TEST_FIXTURE`, `executionEnabled:false`, `liveGate:BLOCKED` and `buildSha` equal to the deployed GitHub revision.
2. Open `/studio.html`, request 250 simulated USDT and keep 70% stock; review, confirm, download and reverify the simulated receipt.
3. Test a paused market and an unapproved closed market; both must block.
4. Run `REMAIN_BASE_URL=https://<project>.pages.dev/ REMAIN_EXPECTED_BUILD_SHA=<full git sha> npm run smoke:deployed` from a Node 24 terminal.
5. Check `/api/live/status` and `/api/execution/status` still clearly deny real trading.

### Security and limitations

The Pages API is stateless, intentionally contains no secrets, and has no persistent storage. Browser simulation state uses `sessionStorage`, not real shares or payments. When an actual compliant live provider becomes accessible, its credentialed reads and financial execution must be re-architected and independently verified rather than turning on a demo flag.

The original Netlify deployment and Cloudflare execution Worker are unchanged by this hosting migration.
