# Live integration and operations

Gate 17 supplies the remaining read-only preflight, protected journal backup/drill,
exact-build host smoke and live settlement-evidence checks. These commands never
approve, sign or submit an order. The browser's separate wallet confirmations
remain necessary. No funded mainnet sale or live hosting is claimed by this release.

## 1. Check private configuration

Use Node 24 on Linux or WSL. Configure the existing ignored `.env.local` locally,
or an ignored `.env.execution` on the approved HTTPS host. Don't put credentials
in a command argument, source file or chat. No wallet private key is requested.

```sh
npm run doctor:execution
```

This offline command prints fixed check names only. It checks credentials are
present, distinct HTTPS RPC hostnames, key/pin syntax, a fee cap, origin and
public-host isolation. It never validates credential permissions or independently
reviews the pinned source. Distinct RPC names don't prove independent operators.
The doctor creates no database and enables nothing. Missing settings exit 1.

Public Compose builds require `REMAIN_NODE_IMAGE` and `REMAIN_CADDY_IMAGE` with
reviewed immutable digests, plus `REMAIN_BUILD_SHA` for the exact tested commit.
Use `node:24-bookworm-slim@sha256:<reviewed-digest>` and
`caddy:2.10.2-alpine@sha256:<reviewed-digest>`. The doctor rejects tag-only public
image configuration. The ordinary fixture Docker build retains its development
default. Compose does not independently verify who reviewed the supplied digest.

## 2. Review one real quote/build before activation

Use the cash preview to choose the exact input and CoW venue. Keep execution flags
false. Create a private file in ignored `state/` matching the existing
`OrderReviewInput` contract:

```json
{
  "intent": {
    "wallet": "0xYOUR_PUBLIC_BSC_WALLET",
    "token": "0xYOUR_HELD_SUPPORTED_STOCK",
    "cashTarget": "25",
    "retainBps": 7000,
    "maxImpactBps": 50,
    "allowClosedMarket": false
  },
  "amountRaw": "EXACT_SELECTED_STOCK_INPUT",
  "vendor": "CowSwap",
  "expectedOutputRaw": "OBSERVED_ESTIMATE_IN_USDT_RAW_UNITS",
  "cashDecimals": 18
}
```

Replace all placeholders using actual observations. No wallet or stock identity
is guessed. USDT uses the supported profile's independently checked on-chain
18 decimals. Set the file mode to 600 and keep its parent private. File readers
reject symlinks, hardlinks, public permissions, duplicate keys and oversized JSON.

```sh
chmod 600 state/private-intent.json
npm run preflight:execution -- state/private-intent.json
```

The preflight rereads the held position, market, selected exact-input quote and
unsigned build. It checks two RPC balances against the Binance observation,
current bytecode against supplied pins, and the CoW economic/signing schema.
Only GET-only Binance transport is imported. No store or signing endpoint runs.
Output omits wallet, balances, raw quote IDs and signable material. Failure prints
a fixed message and exits 1 without echoing vendor errors. A passing sample is
`COMPATIBLE_OBSERVATION`, with the live gate still `UNVERIFIED`.

The sample checks one moment. The execution engine repeats its full controls,
including EOA and token-decimal checks, before any wallet order prompt. A
different vendor, hook or fee profile requires engineering against an actual
payload. Never weaken validation merely to turn an unsupported payload green.

## 3. Deploy the persistent HTTPS service

Use a host eligible for the vendor's service and authorized for the operator.
Set `HOST=0.0.0.0`, exact HTTPS execution origin/allowed hostname, public DNS,
two independent RPC operators and original protected storage key. Set local
read-only inspection false. Keep activation flags false until profile and
contract-source reviews are complete. The Compose volume holds encrypted orders.

```sh
docker compose --env-file .env.execution -f compose.execution.yml config --quiet
docker compose --env-file .env.execution -f compose.execution.yml up --build -d
npm run smoke:execution -- https://YOUR_HOST EXACT_40_CHARACTER_COMMIT disabled
```

The Node healthcheck gates the HTTPS edge's startup. The smoke performs only two
public GETs and requires exact build identity, security headers and the expected
execution availability. After separately reviewed activation, rerun with
`enabled`. Health and configured availability never certify a trade. The public
Netlify deployment remains a fixture and keeps all financial routes unavailable.

There is no live host configured or deployed by this milestone. Actual TLS,
storage persistence, RPC eligibility and operator access must be checked on the
selected host. Don't use `down -v` or discard the original storage key.

## 4. Preserve the journal before a sale

Create a private backup directory outside publicly served paths. The destination
must be a new filename on the same filesystem as its temporary backup. Run these
inside the execution container so the database path points to the durable volume:

```sh
docker compose --env-file .env.execution -f compose.execution.yml exec remain sh -c 'mkdir -p /app/state/backups && chmod 700 /app/state/backups'
docker compose --env-file .env.execution -f compose.execution.yml exec remain npm run backup:execution -- /app/state/backups/before-sale.sqlite
docker compose --env-file .env.execution -f compose.execution.yml exec remain npm run drill:execution -- /app/state/backups/before-sale.sqlite
```

SQLite's online backup API includes committed WAL data. Copying only the primary
database can lose a signing or submission marker. The tool verifies SQLite and
every encrypted row's authentication/index/lock binding before publishing the
backup atomically, refuses overwrite and prints counts only. Wrong keys and
corrupted rows stop the drill. An empty journal reports `keyAuthenticated: false`
because no encrypted record exists to authenticate the key against.

The automated regression also reopens a fixture backup through the real store
and compares the original signing marker, UID and locked record. On a real host,
test the original backup/key pair in an isolated offline recovery directory.
Do not start a second execution service from that copy. Restoring an old snapshot
can lose authority created later. Preserve the newest journal, pause execution
and reconcile every unresolved original order before any recovery cutover.
Back up the key separately and move a protected backup off the original disk.
The tool performs no automatic production restore or order unlock.

## 5. Verify a real receipt independently

After the owner's separate approval/signature/submission and reconciled sale,
download the private chain receipt and set its file mode to 600. Then run:

```sh
npm run verify:chain-receipt -- state/private-chain-receipt.json
npm run check:live-evidence -- state/private-chain-receipt.json
```

The second command rejects fixtures, rereads current supported-stock identity and
contract pins, reconstructs the signed economic schema and independently rechecks
the actual settlement through both RPCs. A forged success label, shortfall or
reorg cannot satisfy its technical check. Results print no wallet, quantities or
signable material. `SETTLEMENT_RECHECKED` is technical evidence, not submission
approval. Original off-chain intent and source-review assertions remain explicitly
unauthenticated. Binance route provenance, deployed flow, registration, original
owner DevEx report, source release and signed-out links remain separate checks.

`npm run submission:status` remains blocked for the private fixture packet. After
real technical evidence exists, create a private live manifest in ignored `state/`:

```json
{
  "kind": "REMAIN_LIVE_SUBMISSION_V1",
  "deploymentOrigin": "https://YOUR_EXECUTION_HOST",
  "buildSha": "EXACT_40_CHARACTER_TESTED_COMMIT",
  "receiptPath": "state/private-chain-receipt.json",
  "ownerReportPath": "state/owner-devex-report.txt",
  "ownerAssertions": {
    "registrationConfirmed": false,
    "eligibilityConfirmed": false,
    "ownerAuthorshipConfirmed": false,
    "publicReleaseApproved": false,
    "contractSourcesReviewed": false,
    "independentRpcOperatorsConfirmed": false
  }
}
```

Replace placeholders from actual deployment evidence. Only update declarations
after their corresponding owner review. Write your DevEx report personally. Set
both files' modes to 600. Then run:

```sh
npm run submission:status -- --live state/private-live-manifest.json
```

This path reruns the genuine supported-stock settlement check, enabled execution
host smoke with the exact build, signed-out public source/commit access and private
report existence. A fixture or missing receipt stops downstream requests. Missing
host, private source or absent report blocks review. Owner declarations alone
cannot satisfy technical evidence. Even after all checks pass, the highest result
is `READY_FOR_OWNER_REVIEW`, not automatic submission approval. Registration,
authorship, independent operator identity, source review and Binance route-use
provenance still require the owner's judgment. No source release or form submission
is performed by this command. The optional video remains optional.

## Limits kept explicit

Standard CoW orders don't atomically enforce remaining-wallet-balance floors or
market-hour flags. These remain fresh preflight checks and post-settlement
invariants. An on-chain guard would require a separately reviewed vendor/contract
profile and actual compatibility evidence. No new fund-holding contract is added.
Expiry or vendor failure never automatically unlocks potentially escaped signing
authority. Investigation and settlement/invalidation checks remain necessary.

The CI browser harness exercises the authenticated composer, review, signing,
one submission, reconciliation display, reorg withdrawal and account changes
against an ephemeral synthetic wallet, vendor and RPC. Its signing endpoint
exists only in the loopback test harness. Its generated unfunded key stays in
process. Screenshots are labelled TEST_FIXTURE. This closes browser wiring gaps,
not live feasibility or funded-settlement evidence.
