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
