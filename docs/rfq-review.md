# RFQ inspection contract

Gate 8 extends the read-only feasibility harness. It adds no wallet, signing,
approval, submission, broadcast, RPC or hosted live API adapter. A real held
stock and current authenticated quote/build remain required for Gate 0.

## Review boundary

`npm run rehearse:rfq` checks fictional nested typed data and route/value
tampering without credentials or networking. `npm run smoke:binance` uses the
same validator after its existing stock identity, fresh market and balance
checks. Its new `rfqReview` object contains checksums, bounded counts and fixed
labels, never the raw unsigned order, wallet, balance, quote ID or vendor text.

The validator recursively checks declared struct fields, array dimensions,
integer ranges, bools, byte lengths and addresses. All declarations are checked,
including unused types. Message structs must contain exactly the declared
fields. The domain requires chain 56 and a nonzero verifying contract. Standard
optional name, version and salt are validated. A declared EIP712Domain must
match its actual domain fields and standard field types. A missing declaration
is recorded as `domainTypeDeclared: false`, allowing inspection only.

Quote/build envelopes are parsed before duplicate object keys can disappear.
Typed-data JSON strings receive the same duplicate-aware parsing. The HTTP
reader rejects malformed UTF-8. Detached snapshots reject accessors, hidden
properties, symbol keys, custom object prototypes, sparse arrays and cycles.

The unsigned build's routerResult must match the selected quote and configured
chain, sell token, raw input, USDT output token, vendor and estimated raw output.
A present tx.from must match the configured wallet. Quotes are rechecked for
expiry after the build returns. The selected quote is snapshotted before that
request, preventing subsequent object mutation from changing its identity.
These are consistency checks against API claims, not independent provenance.

## Conservative versioned profile

- Typed-data, selected-quote and unsigned-build snapshots: at most 128 KiB each, 10,000 nodes, depth 24, arrays 128,
  object properties 128, type declarations 32, fields per type 64 and total
  declared fields 256. Each string value is at most 32 KiB.
- Quote/build JSON envelopes retain the HTTP 2 MiB limit, with parsing capped
  at 50,000 nodes, depth 24, array length 2,048 and object properties 512.
- Array types allow at most three dimensions and fixed lengths 1 through 128.
  Integer widths are 8 through 256 in steps of eight. Integer values accept
  safe integer numbers, canonical decimal strings or canonical positive hex
  strings. Signed negative values use decimal notation. Unsafe numeric inputs,
  aliases uint/int, floats, malformed bytes and coercion fail closed.
  Integral JSON numbers with fraction or exponent notation are rejected at
  parsing, preventing rounded fractional inputs from becoming integer values.
- Empty structs, recursive type definitions and extended domain fields are
  deliberately unsupported by this inspection profile. EIP-712 supports
  recursive type definitions. A rejected valid vendor payload needs a reviewed
  profile change with tests, never a permissive fallback.
- RFQ vendors remain the existing PcsXRfq/InchFusion/CowSwap allowlist.
  Optional signingScheme and txType, when present, must be EIP712. Opaque
  0x1901 payloads are rejected rather than treated as inspectable orders.

Object-based inputs cannot reveal duplicate keys already removed by some
external parser. Production quote/build HTTP parsing rejects them at the raw
response boundary. JavaScript objects supplied directly to the validator must
be ordinary data, not adversarial Proxy objects executing caller code.

## What a pass leaves unresolved

`signatureSemantics: UNVERIFIED` and `executionEnabled: false` always remain.
JSON SHA-256 is explicitly `SHA256_JSON_NOT_EIP712`. It is neither a signature
digest nor a proof that provider assertions are true. Object key ordering may
change this checksum without changing EIP-712 meaning.

The next live review must establish the actual vendor order schema and bind
signed wallet/receiver, chain/domain, sell and buy tokens, total debit, enforced
minimum net cash after fees, spender/contract code, nonce and deadline to user
intent. Verifying-contract syntax alone does not establish trusted bytecode.
The quote's estimated toTokenAmount is not an enforceable minimum. A structural
test deliberately accepts an otherwise valid fictional signed amount that
differs from the route, while reporting semantics UNVERIFIED, so this boundary
cannot be mistaken for economic authorization. No signer consumes this result.

Binance documents separate quoteId and rfq.orderId handling. This milestone
does not invent equality between them or validate submission IDs. Vendor
specific approval and settlement enforcement remain pending.

Older smoke files without rfqReview are labelled LEGACY_UNREVIEWED by the
local inspector, exit nonzero and require a fresh read-only run. Local report
parsing also rejects duplicate keys and malformed UTF-8. New reports are still
LOCAL_FILE_UNAUTHENTICATED with liveGate UNVERIFIED when inspected from disk.

Primary references checked 2026-10-07:
[Binance Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api)
and [EIP-712](https://eips.ethereum.org/EIPS/eip-712).

Local validation on 2026-10-07 passed `npm run verify`, `npm run test:coverage`
with 576 tests, and `npm run rehearse:rfq`. RFQ build binding has 100% line
coverage, typed-data inspection 98.99% and JSON parsing/snapshotting 99.00%.
Coverage is a exercised-code metric, not a security or live feasibility proof.
Remote CI must pass for the published commit before this milestone is merged.
