# Fixture receipt workspace

Gate 7 connects the existing receipt verifier to `/#proof`. The browser loads the explicitly fictional `demo-receipt.json` or reads a selected UTF-8 `.json` file. Checking sends that raw text to `POST /api/receipt/verify`. The local server and Netlify adapter call the same pure parser and verifier, returning bounded diagnostics and accounting facts only after a consistency pass. They do not load SQLite, Binance credentials, a wallet or RPC.

The source fixture includes an invented fill and invented transfer/block evidence: 25 fictional stock units released, 75 remaining and 25 synthetic USDT with 18 cash decimals. `node scripts/generate-demo-receipt.ts` generates it offline using the actual plan, journal and receipt exporter. It is committed static data, never generated as an observation during deployment. An arbitrary uploaded receipt shows raw amounts because token decimals and symbols are not authenticated.

## Boundary and failure behavior

- Only POST, exact path, same origin, uncompressed `application/json` with optional UTF-8 charset. No CORS permission.
- A 256 KiB streaming limit, fatal UTF-8 decoding, bounded parser depth/nodes and duplicate-key/prototype-key rejection before JSON interpretation.
- Netlify has a two-second body deadline and the existing shared 30 requests/minute IP/domain limit. The local service keeps its shared budget, concurrency bound and connection timeouts.
- Valid transport with invalid receipt syntax/semantics returns HTTP 200 with `INVALID_RECEIPT`, null accounting facts and fixed internal reason codes. Body/encoding/origin/method violations retain transport status errors.
- A checksum is returned only when it is exactly 64 lowercase hex characters. Upload bodies, addresses, request IDs, order IDs and event payloads are never echoed, logged or persisted by the adapter. Ordinary hosting request metadata may still exist.
- A new file or Clear invalidates the old report and aborts requests. Request versions prevent older file reads/responses from overwriting a newer selection. Errors and timeouts leave retry available when the source text was read. A fresh page does not restore uploaded files.
- The browser renders data using textContent and validates result labels. Downloading an inspection report saves verifier output, separate from the original source receipt and planner format.

## What a pass establishes

`CONSISTENT_FIXTURE` establishes agreement between the supplied plan, binding, journal and recomputed summary. `MATCHED_FIXTURE` establishes accounting consistency against the supplied transfer/block claims. These results never establish a signature, an actual order, an authenticated market observation or a settled mainnet transaction. A person can fabricate a complete internally consistent receipt and rehash it. This boundary stays visible after a pass.

Tests cover tampered summaries/provenance/checksum text, duplicate fields, deep structures, upload bounds, hostile origin, UTF-8/encoding failures, stream cancellation and both adapters. Browser verification covers the full demo/upload/API/report flow, downloads, rejection, retry, clearing/races, direct navigation and overflow at five widths. External deployment verification checks the deployed source fixture and endpoint, tampering, duplicate fields and size rejection.

Local verification passed 453 tests and coverage. The local browser could not start and its installation was blocked by environment permissions/TLS trust, so no local browser pass is claimed. Remote CI and external HTTPS evidence must be recorded before counting this release complete.

Netlify's documented public `COMMIT_REF` is bundled at build time into the function build identity. This prevents the historical `REMAIN_BUILD_SHA` runtime setting from labelling a new release with an old commit. That SHA identifies an artifact, never authenticity of the receipt contents. Documentation: https://docs.netlify.com/build/configure-builds/environment-variables/.
