# Browser response boundary

Gate 10 covers the fictional cash planner and fixture receipt workspace. A user submits a cash target or loads a receipt, the same-origin stateless service returns data, and the browser validates the complete display contract before publishing a result. Live trading and authenticated provenance remain blocked.

## Acceptance criteria

- Planner, inspection and demo-file response bodies are streamed with a 256 KiB ceiling, rather than read through unbounded `json()` or `arrayBuffer()` calls.
- Both declared and actual oversize responses are rejected. Redirects and non-JSON media types fail. UTF-8 is decoded strictly.
- The existing four-second planner and six-second receipt operation deadlines also interrupt stalled body readers. Clearing a receipt cancels its pending read. Cancellation hooks are never awaited during UI recovery, and reader locks are released.
- JSON parsing rejects duplicate decoded keys, prototype keys, malformed Unicode, unsafe/fractional numbers, trailing content, excessive nesting and oversized arrays/objects before values reach rendering.
- The planner checks its fictional identity, submitted intent, market permission, fixed demo economics, stock conservation, retained floor and cash target. Its display can select no live wallet or token.
- Receipt success requires a known provider and settlement state, a checksum-shaped value, bounded canonical size/event count, no rejection reasons and compatible amounts. Invalid reports expose no facts. All validation occurs before success rendering or report download becomes available.
- An invalid response clears result controls and leaves a retry path. Error text never includes a raw body or arbitrary network exception.
- A received review window is capped at 15 seconds and constrained by a monotonic deadline. A wall-clock rollback cannot extend it. Expired snapshots remain downloadable only as historical fixture records.

## Contract and limits

`web/response.js` is a browser-native ES module with no dependencies, wallet APIs, storage, telemetry or outbound calls. `web/response.d.ts` describes its public types for the TypeScript tests and tooling. The local server and Netlify build both serve this module. The deployed HTTPS smoke checks that the module is present in the exact released build.

The browser receiver uses the same restricted JSON value profile as fixture receipts, with independent parser tests comparing accepted nested/Unicode data against the server parser. It does not implement generic JSON numeric support. Extra receipt-report fields are rejected. Receipt money is displayed only as canonical nonnegative raw units. A server-consistent mismatch containing a negative cash delta cannot be displayed through this narrower UI contract.

The planner validator checks values used by the display and their compatibility with the fixed fictional position. It does not independently rerun every solver attempt, validate all unused fields or recompute the plan checksum. The download remains a supplied synthetic record, not an authenticated certificate.

No browser check authenticates a malicious server, proves exchange data, establishes an executed order or closes Gate 0. A checksum-shaped field is not a verified checksum. Receipt replay/accounting verification still happens in the existing server verifier. Amounts on uploaded receipts remain supplied claims after a consistency pass.

The byte ceiling bounds retained response bytes. A browser or platform may buffer network data before JavaScript reads it, and a source can allocate an oversized chunk before it is rejected. Cancellation requests and JavaScript deadlines are not infrastructure-level guarantees. Main-thread suspension can delay callbacks. Parsing occurs synchronously after the bounded read and has structural limits. Direct object validators accept ordinary data, not hostile Proxy objects.

## Break and rebuild evidence

Eight initial tests exercised the actual receipt page with injected responses. All eight failed before the change: seven malformed success reports were published and one oversized declared demo response was read. Those exact regressions now pass.

Additional tests cover truncated and ambiguous JSON, split multibyte UTF-8, understated lengths, invalid media, rejected redirects, stalled or failed streams, pre-abort, unresponsive cancellation, accessor rejection, altered planner amounts/intent, clear during a stalled inspection and retry without reloading the demo.

Real-browser CI exercises the complete cash-planner and receipt flows, changed amounts and unknown settlement responses, retry, expiry, clock rollback, downloads, navigation and five viewport widths. Unit/VM tests do not replace that browser evidence.

Local verification on 2026-10-07 passed `npm run verify`, `npm run test:coverage` and `npm run screen:history`. All 653 tests passed with no skips or failures. The browser response module reached 100% line coverage, 93.07% branch coverage and 95.45% function coverage. Coverage and pattern screening are measurements of these checks, not an audit or a production-readiness certificate.

[PR #25](https://github.com/Tajudeeen/remain/pull/25), [PR CI 37604799132](https://github.com/Tajudeeen/remain/actions/runs/37604799132), [push CI 37604793574](https://github.com/Tajudeeen/remain/actions/runs/37604793574) and [main CI 37605083803](https://github.com/Tajudeeen/remain/actions/runs/37605083803) passed. The real-browser checks included malformed-response rejection/retry and clock rollback. [Exact-build HTTPS smoke 37605083674](https://github.com/Tajudeeen/remain/actions/runs/37605083674) matched commit `8e3609e4c0c29131b08f42666ed2936d8e2f5d0b` and passed all deployed fixture checks. The production browser independently completed both the planner and demo receipt flows. See [deployment evidence](netlify-deployment.md#browser-response-release-2026-10-07-1006-utc).
