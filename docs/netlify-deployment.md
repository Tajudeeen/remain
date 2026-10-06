# Netlify fixture deployment

The private GitHub repository can deploy to Netlify without making the source public. Netlify publishes only `dist/web`, plus one stateless fixture function. The Node/container server remains available as an alternative.

`fixture.ts` routes `/healthz` and `/api/rehearse` to the existing synthetic planner. It does not import the Binance client, journal, wallet, signing code or RPC. No SQLite persistence is claimed on serverless instances.

The adapter accepts only HTTPS origins supplied by Netlify's site context or its platform deployment URL variables. It rejects cross-site requests, mismatched Origin, unexpected methods/content types, encoded bodies, query variants and extra input fields. Body reads are bounded to 4096 bytes and a two-second deadline. Platform rate limiting declares 30 requests per IP/domain per minute. Its enforcement must be verified on the actual host, and is not supplied by an in-memory counter.

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
