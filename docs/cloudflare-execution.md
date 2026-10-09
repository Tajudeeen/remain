# Remain Cloudflare Worker + durable SQLite journal

## Scope / default

The Worker adds an HTTPS API and **one global named SQLite-backed Durable Object**
for the existing validated CoW BSC sale engine. All four operator gates are **false**
in `wrangler.toml`, including an independent Cloudflare-specific approval
gate. In this state no challenge, login, quote, signature, approval,
submission or poll endpoint can execute: they respond 503.

This is an architecture migration, **not evidence of a live funded trade**.
The read-only Binance catalog on the existing Netlify deployment was returning
`ACCESS_COMPLIANCE_RESTRICTED` on 2026-10-09. Moving the execution service
to Cloudflare does not remove this restriction or authorize regional access.

## Architectural boundaries

- `cloudflare/worker.js` is the public gateway. Exact endpoints, HTTPS,
  Origin matching, body size and duplicate-key-safe JSON parsing are enforced.
  Errors omit private data. Cross-origin browser calls are not authorized.
- `RemainLedger` uses `env.REMAIN_LEDGER.idFromName('remain-execution-all-wallets-v1')`
  for **every wallet**. Never change or shard this name after financial
  activation: sharding would lose global active-wallet locks and old orders.
- `cloudflare/journal.ts` stores the *same AES-256-GCM record ciphertext,
  row HMAC indices, UUID-associated data, revisions and unique wallet locks*
  as Node's `src/execution/store.ts`. Every create/change runs in
  `transactionSync` and rereads/decrypts the persisted row.
- All existing `ExecutionEngine` vendor, quote, contract bytecode, two
  independent RPC, EOA owner, exact amount, fee, retained floor, short
  expiry, allowance, EIP-712 signature and chain receipt verification logic
  is shared via `src/execution/engine-core.ts`.
- The prior `ExecutionHttp` session tokens/challenges are **memory-only**.
  Object eviction or rollout invalidates them, **failing closed** and
  requiring a fresh wallet login; orders/journal rows still persist.
- `SUBMITTING` and signature-prompted markers commit *before* any potentially
  escaped signature or vendor POST. Unknown vendor outcomes remain locked,
  never silently retried.
- SQLite DO storage provides per-object transactional persistence, not an
  externally verified offsite backup. Implement/verify an encrypted offsite
  export and recovery procedure **before any real signature**. Cloudflare
  PITR is not a substitute for independently controlled recoverable backups.

## Free-tier deployment and review

Cloudflare permits new SQLite-backed Durable Objects on Workers Free subject
to current account limits. The migration explicitly uses
`new_sqlite_classes`. Runtime and SQLite quotas still apply; the
original engine's quote, two RPC preflights and settlement rechecks may
need performance/budget validation on the actual account.

Requires Node 24 and a Cloudflare account authorized to publish Workers.

```bash
npm ci
npm run verify
npx --yes wrangler@4.149.0 deploy --dry-run
# For local fixture smoke (no trade keys):
npx --yes wrangler@4.149.0 dev --local --port 8788 --var REMAIN_STORAGE_KEY:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
node scripts/smoke-cloudflare.ts http://127.0.0.1:8788
```

Do not add a trading key in GitHub, wrangler.toml, source code, or chat.
To prepare an actual Cloudflare-hosted environment, create a Worker domain,
supply the **exact Worker HTTPS origin**, and set the secret via
`npx wrangler secret put REMAIN_STORAGE_KEY`. Keep the key stable across
redeploys, archive it separately, and never rotate without journal migration.
Set `REMAIN_BUILD_SHA` to the 40-character reviewed Git commit.

`GET /healthz` reports the build identity and `journal: READY` only
when a valid key can construct and read the SQLite object. The status
endpoint `GET /api/execution/status` has the exact response contract used
by Remain's Netlify gateway; it stays `available: false` in this release.
POSTing to a trade endpoint must return `EXECUTION_SETUP_REQUIRED` with 503.
A Worker URL that only serves `healthz` does not demonstrate a trade.

Before *any* later financial activation:
1. Secure Binance's written authorization for the actual Worker egress and
   observe authenticated catalog, held stock, RFQ, unsigned build, vendor
   fee fields and CoW typed-data compatibility from the approved route.
2. Independently audit/pin token, settlement, relayer and proxy hashes;
   configure two independently operated archive-capable BSC RPCs.
3. Run a fresh held-position preflight; verify all order, wallet and
   exchange controls against *real* data, and recheck economic semantics.
4. Prove order journal crash recovery, key backup, offline export/recovery
   and safe double-submit failure on a **real Cloudflare Durable Object**.
5. Prove a funded, explicitly owner-approved tiny mainnet transaction with
   independent receipt rechecks and complete settlement.
6. Only with those proofs and eligible hosting, separately approve all three
   flags `REMAIN_EXECUTION_ENABLED`, `REMAIN_COW_PROFILE_REVIEWED`,
   `REMAIN_CLOUDFLARE_LIVE_APPROVED`. They are *not* set in this release.

Existing Netlify proxy `REMAIN_EXECUTION_PROXY_ENABLED` and
`REMAIN_EXECUTION_UPSTREAM_ORIGIN` stay disabled until the HTTPS Worker is
observed, its auth/session assumptions are end-to-end tested and full
eligibility is established. Do not treat an upstream URL as activation proof.

Source:
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/

## October 9 build identity and hosted Worker naming

Cloudflare's existing production Worker is named `remain` at
`https://remain.tajudeenowoeteniyan.workers.dev`.
`wrangler.toml` matches this exact script name and keeps the existing
`RemainLedger` class and global DO name stable.
During every Wrangler build, `scripts/stamp-cloudflare-build.js` requires
a real Git checkout and replaces `cloudflare/build-identity.js` with the
exact 40-hex commit. `/healthz.buildSha` is compiled from that value;
the build fails if Git identity is unavailable. The former mutable
`REMAIN_BUILD_SHA=unverified` Wrangler variable is no longer used.
This is source provenance, not a deployed functional or safety audit.

## Encrypted offsite snapshot preparation (R2 not enabled in account)

The Cloudflare account currently replies `10042: Please enable R2 through
the Cloudflare Dashboard`. **No private R2 bucket or external backup
exists yet**. Never claim that `journal: READY` means backup/recovery.

`cloudflare/backup.ts` provides an independently AES-256-GCM sealed,
versioned journal snapshot (`RMB1` format). It authenticates every byte
and hides even the per-row HMAC indexes; no plaintext wallets, orders or
signatures appear in the file. `DurableSqlExecutionJournal.exportRows()`
authenticates every row before export. `restoreRows()` requires a
**fresh empty SQLite journal**, checks every restored row's GCM tag and
wallet/UID lock, and atomically rolls back on corruption or conflicts.
Both directions cap row count and backup size; exceeding these caps
fails closed instead of silently truncating history.

`RemainLedger.alarm()` supports writing uniquely named encrypted
snapshots into a *private* `REMAIN_BACKUP_BUCKET` R2 binding when a
separate `REMAIN_BACKUP_APPROVED=true` operator flag is present.
Alarms retry failures, and there is no public backup/restore endpoint.
The Worker remains off by default. Financial execution additionally
requires the bucket binding and backup-approval gate. These mechanisms
are not considered verified until the real bucket, production alarm and
isolated restore drill have been observed.

When R2 becomes available:

1. Create a private bucket (for example, `remain-execution-backups`);
   leave all public access disabled.
2. Add this to `wrangler.toml` and redeploy to the **existing** `remain`
   Worker without changing `REMAIN_LEDGER`, its name or the storage key:

   ```toml
   [[r2_buckets]]
   binding = "REMAIN_BACKUP_BUCKET"
   bucket_name = "remain-execution-backups"
   ```

3. Run tests for a disposable journal and a separate backup/restore drill.
   Confirm the uploaded object exists under `v1/YYYY-MM-DD/`,
   R2 public access is disabled, and the recovered journal retains
   all active-wallet locks, revisions and one-shot submission states.
4. Make a separate encrypted **offline** copy under independently
   controlled credentials; a bucket on the same account alone is not
   an independent disaster recovery plan.
5. Only after that, allow an explicitly operator-reviewed change to
   `REMAIN_BACKUP_APPROVED`. Do **not** enable execution: Binance and
   remaining contract/financial gates are still independent.

The snapshot library and CI drill exercise a disposable Node SQLite
adapter. They do not prove an R2 production restore. Never run a restore
against `remain-execution-all-wallets-v1`: it is intentionally
empty-only and immutable live order records must not be overwritten.
