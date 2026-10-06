# Order durability and settlement rehearsal

Milestone 3 is a standalone TEST_FIXTURE backend module. It exercises the real SQLite journal and exact accounting against synthetic observations. No order submission, signature, approval, wallet, RPC or Binance execution adapter exists. The browser still downloads planning records only. Live gate 0 remains blocked by upstream compliance code 40304.

## Binding and persistence

`bindFixturePlan` rechecks the planning checksum and current BellGuard verdict. Only a passing, fresh fixture plan becomes an immutable binding: plan checksum, wallet, chain, stock/USDT identities, vendor, planning quote ID, raw balances, stock debit including fees, floor, minimum net cash and target. The helper recomputes amounts rather than trusting the plan's cached verdict. Direct bindings support deterministic fixture tests and are schema checked; neither entry point authenticates provider assertions or verifies signatures.

`FixtureOrderJournal` persists one UUIDv4 request ID before a rehearsed attempt. A unique plan checksum also prevents reserving the same plan with a second ID. Repeating the same request and binding returns the existing record. Changed content conflicts. Each event has its own UUIDv4: identical retries append once, changed retries conflict. Compare-and-append revisions reject competing writers.

SQLite uses WAL, synchronous FULL, foreign keys, strict tables, a 5-second busy timeout and immediate write transactions. Binding, event and journal-head updates commit atomically. Reads use one snapshot transaction. The module never holds a transaction across asynchronous/network work. There are no external callbacks, token calls or contracts in this milestone, so Solidity reentrancy guards are inapplicable. A future submitter must commit its request before any external call and recover uncertain outcomes with that same ID.

The journal reconstructs state from ordered events and verifies a SHA-256 checksum chain, binding checksum, revision and tail checksum on each read. Missing final events, altered payloads, reordered sequences and inconsistent heads fail closed. These checks detect inconsistent local edits. An attacker able to rewrite the database and all checksums, or replace it with an older consistent copy, can evade them. They are not signatures, authenticated evidence or an external append-only log. Receipt authenticity and independent verification belong to milestone 4.

Use a dedicated ignored directory such as `state/orders/journal.sqlite`. The directory and database receive POSIX modes 0700 and 0600. Observed symlinks, parent symlinks, nonregular files and hard links are rejected. Sidecar files are checked too. The owning directory must be trusted; checks do not defeat a malicious concurrent filesystem owner. Windows ACLs need operator configuration. Do not use a shared directory, network filesystem or ephemeral serverless volume. SQLite's busy timeout and storage errors surface as redacted `STORAGE_FAILURE`; investigate disk/full/permission failures rather than retrying a new request ID. Back up a live SQLite database through a SQLite-aware mechanism, not by copying only the main file while WAL is active.

No production database/service has been provisioned. Process-kill recovery is tested. Machine power loss, filesystem faults, multi-host consistency, backup restoration and platform durability have not been established. Full event replay is appropriate for this bounded rehearsal; large histories need reviewed limits and snapshots before production.

## State and recovery rules

| Event or observation | Meaning and restriction |
| --- | --- |
| Reserved | Durable fixture intent. Execution disabled. |
| ATTEMPT_REHEARSAL | Simulates an uncertain external call. Allowed once and before bound quote expiry. It makes no external call. |
| OUTCOME_UNKNOWN | A timeout/unknown result preserves the ID and last observed provider status. It cannot overwrite a terminal observation. |
| CANCEL_REQUESTED | Local intent only. It does not establish cancellation or call a cancellation endpoint. A later fill can still occur. |
| PENDING_VENDOR / PENDING_ONCHAIN | Unresolved vendor observations. On-chain pending cannot regress to vendor pending. |
| FILLED | Vendor report with bound platform order ID and transaction hash. Settlement stays unverified until separately reconciled. |
| FAILED / EXPIRED / CANCELLED | Terminal provider observations; never inferred from elapsed time, quote expiry or local cancellation intent. They do not independently prove absence of chain effects. |
| RECONCILE | Requires FILLED. Rechecks all evidence and can replace a previous fixture match with WAITING or MISMATCH. |

The module accepts the documented RFQ statuses only. It does not fabricate `PARTIALLY_FILLED` support. A partial stock debit produces a mismatch under this one-fill contract. Unsupported/conflicting statuses, identity changes or transaction-hash changes require investigation rather than silently remapping them.

`recoveryAdvice` returns an instruction with execution disabled, never a scheduler or network operation. Under 30 minutes after an unresolved attempt, it advises recovering status with the existing ID. At/after 30 minutes it flags the deduplication window as elapsed and calls for investigation. It never advises a fresh ID or automatic submission. Even a matched fixture requires a later canonical-chain recheck.

According to the [Binance RFQ reference](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), submission deduplication lasts 30 minutes, the submission `quoteId` is the built `rfq.orderId`, and status observations use the returned platform `orderId`. These are distinct identities. The binding's `planningQuoteId` is deliberately a planning identity only; no mapping to an executable order is implemented. Provider deduplication cannot supply permanent external exactly-once execution. Once access is restored, actual vendor schemas and identifier semantics must be verified before designing a submitter.

## Settlement accounting

`reconcileFixture` takes an exact, bounded synthetic evidence schema. It requires bound chain/wallet/token/order/transaction identities, successful receipt, asserted canonical receipt hash, consistent parent-block/balance snapshots and asserted complete relevant wallet transfers for the entire receipt block. At most 256 transfer entries are accepted. Duplicate log indices, removed logs, unrelated logs and relevant transfers from other transactions fail closed. Raw amounts use uint256 strings and BigInt arithmetic.

| Invariant | Check |
| --- | --- |
| Pre-trade stock balance | Parent-block stock balance equals the planned balance. |
| Stock debit | Net stock transfers and snapshot debit equal the bound total debit including stock fees. |
| Retained floor | Post-block stock balance stays at or above the raw-token floor. |
| Net cash | Cash credits less cash debits equal snapshot change and satisfy both minimum net cash and cash target. |
| Evidence attribution | All relevant transfers belong to the bound transaction; concurrent relevant wallet activity is rejected. |
| Block consistency | Before balance is from the receipt block's parent; after balance is from its exact receipt block/hash. |
| Demo confirmation policy | Fewer than 12 asserted confirmations yields WAITING. This fixed fixture threshold is not BSC finality verification. |
| Reorg handling | A later different asserted canonical hash yields MISMATCH and invalidates a prior match. |

Gross cash credit cannot hide output fees. Stock fees cannot hide an excessive debit. Self transfers net to zero. Empty logs, changed balances and missing data cannot pass. Exact total debit is intentionally conservative: a different actual stock fee, rebasing, nonstandard Transfer accounting, batch settlement or multiple fills requires a separately verified adapter, and currently mismatches. The retained floor measures token quantity, not USD value. It cannot constrain future wallet activity.

`MATCHED_FIXTURE` means internally consistent synthetic assertions. Checksums, `completeBlockTransfers`, canonical hashes and head numbers are supplied assertions. No chain source, log authenticity, actual finality or vendor order-to-transaction attribution is verified. A future read-only RPC adapter must independently obtain hash-pinned balances, complete relevant logs, receipts, canonicality/finality and vendor-specific order attribution. Only actual authenticated observations can support a live receipt.

## Reproduction

Requires Node.js 24 with its built-in `node:sqlite` module. No runtime database package is added.

```sh
npm run verify
npm run test:coverage
npm run rehearse:orders
```

The terminal rehearsal creates an isolated temporary database, binds the actual fixture planner, persists a rehearsed uncertain attempt, closes/reopens the database, observes a fictional fill, matches fictional settlement and then invalidates it with fictional reorg evidence. It removes the temporary directory and logs only fixture status summaries. No credentials are needed.

Tests use separate Node processes competing over the same real SQLite file. They cover competing reservations, competing revisions, identical event retries, a process killed after commit and a process killed during an uncommitted write. Additional tests exercise statuses, stale plans, expiry, cancellation races, corrupted data, invalid identities, fees, uint256 limits, duplicate/missing logs, concurrent wallet transfers, insufficient confirmations and reorg invalidation. Browser regression checks continue in CI; this milestone introduces no browser order controls.

## Live gate still required

Successful API feasibility, verified vendor typed-data semantics and approval limits, explicit trade approval, a durable hosted storage choice, independently sourced chain evidence and an approved tiny live settlement are outstanding. This code is not audited, formally verified or production ready.
