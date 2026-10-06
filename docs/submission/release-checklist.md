# Release checklist

Preparation is authorized. Public source release, form submission and live financial actions are separate actions. No such action is performed by these checks.

## Close the real integration gap first

1. Confirm operator, project and host access with Binance. Follow `docs/access-troubleshooting.md`; do not bypass a restriction.
2. Run discovery and the read-only held-stock RFQ feasibility harness from the authorized environment. Preserve sanitized evidence.
3. Review actual signing fields, minimum-output/fee enforcement, allowance/spender and settlement attribution. Build the live adapter only after the feasibility gate passes.
4. Obtain specific approval for any tiny live sale and reconcile its actual outcome. Fixture receipts cannot close this step.

## Prepare the owner decisions

- Confirm hackathon registration and applicable eligibility/terms.
- Write the final DevEx narrative personally and complete the AI stack section.
- Record and test a video under four minutes.
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

The last command currently exits 1 with `submissionStatus: BLOCKED`. The packet validator is deliberately limited to the fixture preparation packet and cannot be changed into a live release certificate by flipping status fields. Replace it through a reviewed live-evidence milestone after the real flow is proven.

`screen:history` scans available reachable Git refs. Run it on a non-shallow checkout after the final commit, then examine its sanitized artifact and review all release surfaces. Its pattern pass is not a formal audit or proof of secret absence. Ignored files, binary content, dangling objects and external workflow/deployment logs are not cleared. Any credential ever exposed needs rotation, regardless of a later clean scan.

Recheck the deployed SHA, run the HTTPS smoke, and test the final repo/video/report links signed out. Archive durable evidence before expiring CI artifacts disappear. Keep the deployment stable throughout judging. The final public-release and submission actions remain pending owner approval.
