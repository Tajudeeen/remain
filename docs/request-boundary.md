# Public fixture request boundary

Gate 9 is a targeted break-and-rebuild pass over the existing cash-composer
HTTP path. It adds no live API, wallet, signing or execution capability.

Nine new regression tests failed on the previous implementation and passed
after the fixes. Three duplicate-key cases failed separately against the Node
server and Netlify adapter. The other failures reproduced enum coercion, an
incomplete HTTP upload without an application deadline, and a size rejection
stalled behind an unresponsive stream cancellation callback.

## Parsing and data contract

Both planning adapters call one duplicate-aware planning parser before any
normalization. The existing receipt JSON profile rejects duplicate decoded
keys, including escaped aliases, malformed Unicode, unsafe/noninteger numeric
values, prototype keys, excessive nesting and trailing data. Planning bodies
remain capped at 4 KiB. Receipt uploads remain capped at 256 KiB and retain
their independent receipt-verification contract.

Rehearsal markets, quote vendors and minimum-output labels require strings
with exact allowlisted values. Arrays and objects cannot become enums through
String coercion. Intent, market, quote and rehearsal input records must be
plain objects with enumerable data properties. Accessors, inherited records,
symbol keys, hidden fields and prototype-sensitive keys are rejected before
reading values. This does not sandbox malicious JavaScript Proxy objects.

## Read lifetime

The Node server now starts an explicit absolute two-second timer when reading
an accepted API body. Receiving another chunk does not reset it. An incomplete
upload returns 408/BODY_TIMEOUT, closes the connection and releases the shared
in-flight slot. Oversize and malformed bodies return bounded fixed errors.
Body listeners, accumulated chunks and timers are cleaned up. An error sink
remains until request close because abort can precede a stream error.

The existing Netlify two-second request signal is retained. Oversize rejection
requests cancellation without awaiting an untrusted cancel implementation.
Client cancellation still unblocks a stalled read and never echoes the abort
reason. The adapter uses no application persistence or global serverless
concurrency counter. Netlify's platform rate-limit configuration is unchanged.

The Node timeout can be shortened through a trusted server option for tests,
bounded to integer milliseconds 1 through 5,000. Production uses the two-second
default. The limit is not a browser-controlled request parameter.

## Deployment verification

The deployed smoke now checks duplicate cash-target/escaped-retention fields
and an array market, alongside normal 25-cash/75-retained accounting, paused
market blocking, receipt tampering and absent execution endpoints.

Runtime changes on main trigger the deployment-smoke workflow. It waits for
the exact pushed commit in public health, with a bounded polling budget and
fixed fixture invariants, then runs the separate HTTPS smoke. Historical health
from another build cannot satisfy this gate. The manual workflow remains
available for other explicit origins. No credentials are used by either path.

Health identity is an HTTP observation, not a signed attestation. Timeout and
cancellation behavior are tested in local HTTP and stream fixtures. Production
verification does not saturate Netlify's rate limit or establish broad denial
of service resistance. Tests are regression evidence, not a formal audit.

Live held-position RFQ, vendor semantics and settlement remain pending.

Local verification on 2026-10-07 passed `npm run verify` and coverage with
603 tests, zero failures and no skipped tests. The data-record guard, Node
server, Netlify adapter and deployment-wait module each have 100% line
coverage. These are fixture results. Remote CI and a published exact-build
HTTPS smoke are still required before marking the release complete.
