# Fixture deployment runbook

This runbook deploys only Remain's TEST_FIXTURE planning rehearsal. It does not deploy a wallet flow, Binance trading adapter, signing service, RPC settlement observer or live execution path.

## Release gate

A deployment is acceptable only when:

- the exact commit passed `npm run verify`, coverage and browser CI,
- the image builds from the committed Dockerfile,
- `REMAIN_ALLOWED_HOSTS` contains only the public hostname or hostnames serving this deployment,
- `/healthz` reports `mode=TEST_FIXTURE`, `executionEnabled=false` and `liveGate=BLOCKED`,
- `npm run smoke:deployed` passes against the public HTTPS origin,
- no Binance credentials are configured for this rehearsal service.

A public rehearsal does not close Binance Gate 0 and must not be described as a live trading product.

## Runtime configuration

Required for a public container:

- `HOST=0.0.0.0`
- `PORT` supplied by the platform, or `3000`
- `REMAIN_ALLOWED_HOSTS=remain.example.com` using the exact public hostname
- `REMAIN_BUILD_SHA=<deployed git commit sha>`

Multiple hostnames may be comma-separated only when each one genuinely routes to the same deployment.

Do not configure `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_SECRET_KEY`, wallet seeds, private keys or signing material on this fixture service.

The process refuses a public bind when no allowed host is configured.

## Container build

```sh
docker build -t remain-rehearsal .
```

The runtime image runs as the non-root `node` user and contains the application source needed by Node's TypeScript runtime. Local environment files, evidence, state, coverage and git metadata are excluded from the build context.

Example local container check:

```sh
docker run --rm -p 3000:3000 \
  -e REMAIN_ALLOWED_HOSTS=localhost \
  -e REMAIN_BUILD_SHA=<commit-sha> \
  remain-rehearsal
```

Then run:

```sh
REMAIN_BASE_URL=http://localhost:3000 npm run smoke:deployed
```

## Public smoke test

Use HTTPS for every non-local deployment:

```sh
REMAIN_BASE_URL=https://<public-host>/ npm run smoke:deployed
```

The smoke test fails unless:

1. `/healthz` exposes the expected fixture-only status,
2. the page is reachable and visibly identifies Remain/synthetic behavior,
3. `POST /api/rehearse` returns a TEST_FIXTURE result with execution disabled,
4. execution-looking endpoints such as `/api/submit`, `/api/sign` and `/api/order` remain absent.

Record the deployment URL, commit SHA, smoke output and platform deployment identifier in the verification log.

## Host and proxy assumptions

The service validates the HTTP `Host` header against an explicit allowlist. A reverse proxy must preserve the public host. HTTPS termination may happen at the platform edge. Browser Origin checks accept only the matching HTTP or HTTPS origin for that host.

Do not add wildcard hosts. Do not derive the allowlist from request headers. Do not disable the host check to make a platform deploy pass.

## Health and monitoring

`GET /healthz` is deliberately narrow. It exposes only:

- service readiness,
- TEST_FIXTURE mode,
- execution disabled,
- live gate blocked,
- deployed build SHA.

It does not call Binance, reveal configuration, return wallet information or imply upstream health.

Treat repeated 4xx/5xx responses, startup failures or a smoke-test failure as release blockers.

## Rollback

Before changing a public deployment, record the current working deployment ID and commit SHA.

Rollback when:

- the health contract changes unexpectedly,
- browser rehearsal fails,
- the deployed smoke test fails,
- security headers disappear,
- the app exposes an unplanned endpoint,
- a release contains secrets or private evidence.

After rollback, rerun the public smoke test against the restored URL.

## Incident rule

If any future change accidentally enables wallet signing, approval, order submission or transaction broadcast in this service, take the deployment offline and treat it as a security incident. Do not attempt a live trade to test the fix.

## Current platform limitation

The connected Vercel account currently exposes no deployable team context to this session, so no Vercel deployment is claimed by this milestone until a usable Vercel team/project is available. The container and external smoke verifier keep deployment portable to an approved container host.
