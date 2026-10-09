# Release checklist

Preparation is authorized. Public source release, form submission and live financial actions are separate actions. No such action is performed by these checks.

## Close the real integration gap first

Use the prepared [live-operations tools](../live-operations.md): `doctor:execution`, `preflight:execution`, WAL-safe `backup:execution`/`drill:execution`, exact-build `smoke:execution` and fresh `check:live-evidence`. A technical settlement recheck is distinct from submission readiness. The private fixture packet still fails `submission:status` by design.

1. Confirm operator, project and host access with Binance. Follow `docs/access-troubleshooting.md`; do not bypass a restriction.
2. Run discovery and the read-only held-stock RFQ feasibility harness from the authorized environment. Preserve sanitized evidence.
3. Review actual signing fields, minimum-output/fee enforcement, allowance/spender and settlement attribution. The strict CoW adapter is prepared, but its actual vendor compatibility must pass before activation. Review and pin the settlement, relayer and proxy implementation code through the two-RPC inspection tool. Configure the persistent HTTPS Node service described in `docs/execution.md`. Netlify financial routes remain disabled.
4. Obtain specific approval for any tiny live sale and reconcile its actual outcome. Fixture receipts cannot close this step.

## Prepare the owner decisions

- Confirm hackathon registration and applicable eligibility/terms.
- Write the final DevEx narrative personally and complete the AI stack section.
- Optionally record and test a recommended video under four minutes.
- Review the exact source commit, privacy changes and history findings before public release.
- Stop/remove any self-hosted runner and review workflow access before the repository becomes public. No runner is assumed to exist.

## Freeze verification

```sh
npm ci
npm run verify
npm run test:coverage
npm run screen:history
npm run check:submission
npm run submission:status
```

The last command currently exits 1 with `submissionStatus: BLOCKED`. Its default packet validator is deliberately limited to fixture preparation and cannot become a live certificate by flipping status fields. After real evidence exists, the separate `submission:status -- --live state/private-live-manifest.json` path rechecks supported-stock settlement, exact deployed build, signed-out public source commit and owner report existence. Its maximum status is `READY_FOR_OWNER_REVIEW`; manual declarations stay explicitly unauthenticated and publication/submission remain separate owner actions. See [live operations](../live-operations.md).

`screen:history` scans available reachable Git refs. Run it on a non-shallow checkout after the final commit, then examine its sanitized artifact and review all release surfaces. Its pattern pass is not a formal audit or proof of secret absence. Ignored files, binary content, dangling objects and external workflow/deployment logs are not cleared. Any credential ever exposed needs rotation, regardless of a later clean scan.

Recheck the deployed SHA, run the HTTPS smoke, and test the final repo/video/report links signed out. Archive durable evidence before expiring CI artifacts disappear. Keep the deployment stable throughout judging. The final public-release and submission actions remain pending owner approval.
