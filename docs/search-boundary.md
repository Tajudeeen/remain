# Gate 12: cash search boundary

The solver must finish waiting, reject clock rollback and avoid admitting provider-owned behavior as quote data. This work hardens the standalone provider port and deployed TEST_FIXTURE planner. It supplies no Binance planning adapter, authenticated minimum-output semantics or execution capability.

## Reproduced defects

Seven new regression tests failed against the previous solver before changes:

- A spacing promise which never settles bypassed the whole-search deadline.
- Cancellation could not interrupt that pending spacing promise.
- A clock retreat between iterations was accepted when still above the initial search time.
- The same retreat during final evaluation could leave a candidate marked safe.
- Quote-array getters and custom iterators ran before admission.
- Conflicting routes with the same venue/quote identity were accepted in one batch.
- Extra array properties, custom prototypes or non-enumerable entries could accompany a passing quote.

These are independently observable regressions, not proof of an exploited live system. Gate 0 remains open.

An additional test then reproduced a forward wall-clock jump skipping the live-labelled request spacing wait. The default wait now uses elapsed time measured at the actual provider invocation, so a wall-clock advance cannot erase it. A caller-injected sleep remains a trusted scheduler override for deterministic rehearsals.

## Timing and cancellation contract

One search boundary covers every quote request and spacing wait. The default whole-search budget remains 12 seconds, capped at 15. A timer and independent `performance.now()` elapsed checks prevent a stalled promise or retreating wall clock from extending asynchronous waiting. Wall timestamps still govern balance, market and quote freshness.

Every observed wall timestamp, including final evaluation, must be at least the previous observed timestamp. A regression, cancellation, malformed response, request timeout or provider failure discards all earlier candidates. Raw failures are reduced to fixed error codes.

A whole-search time budget stops exploration. It can preserve an earlier fully admitted candidate only after BellGuard checks it again at the final wall time. An incomplete or late request contributes no quote, outcome or candidate. Its attempt remains BLOCKED with a SEARCH_TIME_BUDGET code. A late provider completion cannot mutate the frozen returned plan. Cancellation takes precedence over budget exhaustion and removes the candidate.

Deadline and cancellation abort the active provider signal. Timer/listener cleanup runs on success, failure and cancellation. The default spacing timer is also cancelled when interrupted. An injected sleep or provider which ignores its signal can continue its own underlying work, but the planner stops waiting and ignores its result. JavaScript timers cannot preempt synchronous code or an unresponsive event loop. Providers remain trusted executable adapters, and actual network cancellation requires their cooperation.

## Quote-set admission contract

Responses must be ordinary dense arrays with at most 16 routes. Only the native length and enumerable indexed data properties are allowed. Sparse arrays, additional fields, symbol properties, accessors, overridden iterators and custom prototypes fail closed. The length bound is checked before inspecting route entries. Native property descriptors are read without invoking quote-array getters or iterators.

Every route is normalized and frozen before the entire batch is accepted. A malformed route invalidates the batch before any passing outcome is recorded. Provider mutation during later requests cannot rewrite an earlier observation. A duplicate `(vendor, quote ID)` within one response is ambiguous and rejected, even if both records are identical. The same ID from different vendors is allowed. Reuse across separate requests is allowed because vendor-wide ID uniqueness has not been established.

The normalized amounts, wallet, chain, contracts, freshness and input quantity still pass through BellGuard. Admission authenticates no source. VERIFIED_ORDER remains an adapter assertion until actual vendor fields and enforceable economic semantics are independently reviewed.

## Verification

`tests/search-boundary.test.ts` adds 18 tests for the reproduced defects, elapsed spacing, late replies, prior-candidate handling on deadline, cancellation priority, by-value snapshots, batch atomicity, supported arrays, the 16-route limit, redaction and abort-listener cleanup. The existing 50-landscape exhaustive small-domain oracle and exact integer/floor tests remain required.

Run `npm run verify`, `npm run test:coverage`, `npm run screen:history` and `npm run rehearse:plan`. CI additionally exercises the container and complete browser flow. Tests and deployment checks establish regression behavior for these prepared modules. They do not establish live execution, formal verification or an independent security audit.
