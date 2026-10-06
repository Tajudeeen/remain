# Proof receipt and provenance

Milestone 4 is a standalone TEST_FIXTURE proof layer. It does not enable signing, approval, submission, RPC access, wallet connection or live Binance execution.

## Purpose

The receipt binds four things into one deterministic record:

1. the immutable planning binding,
2. the durable order identity and journal revision,
3. the independently reconciled settlement result,
4. the exact fixture evidence checksum used for that reconciliation.

A verifier can recompute the settlement from the supplied evidence and compare every bound identity and amount before accepting the receipt as `VALID_FIXTURE`.

## Contract

A proof receipt contains:

- `version: 1`
- `mode: TEST_FIXTURE`
- `executionEnabled: false`
- a UUID receipt ID and generation timestamp
- the normalized order binding
- request ID, journal revision, provider order ID and transaction hash
- actual stock debit, actual cash credit and final stock balance
- block identity and required confirmation count
- binding checksum, plan hash, planning quote ID and vendor
- a SHA-256 checksum over the complete receipt body

Creation is allowed only after the journal has a `FILLED` observation and settlement reconciliation returns `MATCHED_FIXTURE`.

## Independent verification

`verifyFixtureProofReceipt(receipt, evidence)`:

- rejects unknown or extra fields,
- recomputes the receipt checksum,
- recomputes the binding checksum,
- checks plan, quote, vendor and journal-revision bindings,
- reruns settlement reconciliation from the supplied evidence,
- compares the evidence checksum,
- recomputes actual stock debit and cash credit from balance snapshots,
- checks final stock, block number and block hash,
- verifies that the cash target and retained-position floor remain satisfied.

A changed receipt amount, changed evidence block hash, changed order identity or changed provenance binding fails verification.

## Rehearsal

```sh
npm run rehearse:receipt
```

The rehearsal builds a normal synthetic plan, stores a fixture order, observes a fictional fill, reconciles fictional ERC-20 transfer and balance evidence, produces a proof receipt and verifies it. It then changes the receipt cash amount and confirms the verifier rejects the altered bundle.

There are no network calls, credentials, wallet signatures or real transactions.

## Security and honesty limits

The receipt checksum is tamper-evident only relative to the bytes supplied to the verifier. It is not a digital signature, trusted timestamp, chain attestation or proof that the evidence source told the truth.

A malicious party that can replace both a fixture receipt and all of its fixture evidence can construct another internally consistent fixture bundle. Future live provenance therefore needs authenticated provider observations, canonical BSC RPC evidence, explorer links where useful, and an owner-approved release policy.

`MATCHED_FIXTURE` and `VALID_FIXTURE` must never be presented as mainnet settlement.

## Future live gate

After Gate 0 access is legitimately unblocked, a live receipt may be considered only after:

- Binance order identity and status semantics are verified,
- the submitted RFQ payload is bound to the original intent,
- the BSC transaction is independently observed,
- before/after balances and relevant logs reconcile,
- canonicality and confirmations are rechecked,
- no secret or raw signed payload is exposed,
- the user explicitly approves the live signing and execution flow.

Until those conditions are met, this module remains fixture-only.
