# Milestone 1: cash solver and BellGuard

The owner requested continued milestone work after the live Binance compliance rejection was explained. This milestone is a complete, independently testable planning module. It has no live Binance adapter, UI, wallet signature, approval or order-submission path. Gate 0's live evidence is still blocked. A passing synthetic plan is never a successful trade.

## What works

`solveCash` takes a validated cash intent, an injected read-only quote provider and bounded search options. It samples input quantities, evaluates every returned route, chooses the smallest safe observed total stock debit and returns an immutable plan with its trace and checksum. `bellGuard` can evaluate a quote independently. `recheckPlan` detects checksum changes and reevaluates the selected candidate against the current clock.

`npm run rehearse:plan` runs three labelled TEST_FIXTURE cases: a cash target that preserves exposure, an unreachable target under that floor, and a closed market without permission. It performs no network requests and uses no credentials.

## Arithmetic contract

All monetary values are canonical decimal integer strings, parsed as bigint. Floats, exponents, signs, leading zeros and excess precision are rejected. `parseUnits` and `formatUnits` take observed decimals explicitly. USDT decimals are not inferred from its symbol.

Given initial stock balance B, retained basis points R and absolute token floor A:

```text
floor = max(ceil(B * R / 10000), A)
totalDebit = input + maximumStockFee
remaining = B - totalDebit
minimumNetCash = minimumGrossCash - maximumCashFee
```

These equations are exact integer calculations. Percent retention rounds upward, so dust cannot erase the floor. A cash-fee upper bound protects the output minimum. It cannot reduce the surplus cap because the actual fee could be zero. Maximum expected net cash is conservatively the expected gross output when a fee lower bound is unavailable. Expected cash after the maximum fee is a conservative estimate, not the actual fee prediction. Positive execution price improvement could exceed these expected amounts, so the surplus cap is a planning cap, not an on-chain maximum output guarantee.

Required planning conditions:

- Total stock debit, including stock fees, leaves the retained token floor intact.
- Minimum gross cash after the full possible output fee covers the target.
- Expected surplus, computed conservatively without subtracting an unproven fee, stays within the user cap.
- `(expectedGross - minimumGross) * 10000 <= expectedGross * allowedSlippageBps`, so fractional breaches cannot round down.
- Impact is present and within the cap. Impact metadata is still a provider assertion until a real adapter is verified.

The retained floor preserves token quantity, not dollar value. This snapshot cannot prevent a concurrent wallet transfer or another active order from reducing the balance. Future execution needs a fresh wallet check and appropriate order coordination.

## Search contract

Default budget is 24 requests, maximum 64. Default whole-search budget is 12 seconds, maximum 15. Per-request timeout defaults to 3 seconds, maximum 8. At most 16 routes are accepted per response. Live-labelled providers require at least 200 ms between request starts. Compliance and provider failures stop the entire plan with no retry and discard earlier candidates. A timeout aborts the supplied signal and stops the planner. Providers must honor the signal to stop their actual HTTP work.

When the eligible integer domain fits within the request budget, every positive raw input is observed. Larger domains use evenly spaced seeds then split the widest remaining interval below the current best total debit. The solver does not assume prices, fees or route availability are monotonic. A failed maximum-input quote does not prove all smaller quantities fail.

Input quantities are deduplicated. Input fees participate in optimization, so a slightly larger sell with a lower stock fee can beat a smaller sell. Ties use input amount, expected surplus, vendor and quote ID with deterministic character comparison.

The exact claim is SMALLEST_SAFE_OBSERVED_DEBIT. Unsampled amounts or later quotes can be better. `searchedAllIntegerInputs` means every input in this bounded domain returned a structurally valid response, not a globally optimal live fill. `searchStopReasons` records time/request budgets separately from policy failures. A budget stop can still return a freshly passing observed candidate for review.

## BellGuard contract

Identity binds wallet, BSC chain, stock contract, USDT contract and requested raw input. Missing/unknown values fail closed. Paused, maintenance, restricted and unknown market states cannot be overridden. Closed markets require explicit planning permission and keep a warning. Inconsistent market facts are blocked.

Freshness limits: balance 15 seconds, market snapshot 60 seconds and quote age 15 seconds. At least five seconds must remain on a quote at evaluation. Future timestamps and clock regressions block. These are conservative planning limits, not verified vendor deadlines. Candidates are reevaluated when search finishes and can be reevaluated before a future UI review.

The provider must expose an inspectable minimum-output binding before BellGuard passes for planning. Merely labelling an injected object VERIFIED_ORDER does not prove an order or authorize signing. All results return executionEnabled false, including LIVE_READ_ONLY-labelled providers. Production needs a verified vendor-specific adapter that extracts the true enforceable amounts, fees, receiver, wallet, chain, deadline, nonce and contracts from actual order data. Do not invent a Binance minimum output from its expected quote output.

Documented route unavailability or minimum-trade-size rejection may be normalized by a future adapter to an empty route set. Unknown upstream errors must remain hard failures. This milestone does not guess those Binance error codes or minimum sizes.

## Evidence and privacy

Plans retain the normalized intent, selected quote, all attempted inputs, completed/blocked outcomes and safe failure codes. Caller mutation cannot change the intent after search starts. Returned objects are recursively frozen. Raw provider failures are never logged. Plan objects contain wallet and position information in memory, so callers must not dump or publish them. The CLI prints selected fields from synthetic examples only.

The SHA-256 JSON checksum binds the returned object as serialized, including its private intent. It detects accidental modification when the expected checksum is trusted. It is not a digital signature, provider authentication, canonical cross-language serialization standard, EIP-712 hash, formal proof or settlement receipt. Someone who changes the object and recomputes the checksum can create another internally consistent synthetic plan. `recheckPlan` also checks time-sensitive policy, but does not refresh RPC balances or authenticate quote data.

## Break, fix, prove

Tests compare 50 nonmonotonic quote landscapes to a separate exhaustive small-domain oracle, check 10,000 percentage-floor cases, reject precision loss above Number's safe integer range, include both stock and cash fees, enforce closed-market permission, reject unknown minimum-output binding, mutate caller input, test expiry and cancellation, preserve failed-attempt evidence and invalidate the whole plan after provider/compliance failure. These are executable invariants and regression evidence. Formal verification, live economic correctness and independent security audit remain future work.
