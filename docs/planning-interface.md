# Planning rehearsal interface

Milestone 2 is an independently testable interface, authorized by the owner on 2026-10-06 while Binance access is blocked. It does not complete the live wallet or trading milestone.

## One complete fixture journey

The cash composer starts with a fictional 100-unit position. A demo unit quotes at one synthetic USDT, has zero fees and reports 0.20% impact. Whole stock units and 18-decimal USDT exercise exact conversion without pretending to reproduce a real wrapper. The provider's PcsXRfq name and VERIFIED_ORDER metadata are fixture values, not vendor integration evidence.

The visitor enters a cash target, retained percentage, impact cap and market scenario. `/api/rehearse` strictly validates these five fields, constructs the fixed synthetic identity server-side and calls the existing cash solver and BellGuard. It never imports the Binance client or loads API credentials. A plan remains `executionEnabled: false` throughout.

- 25 USDT and 70% retained selects a 25-unit debit and leaves 75 units.
- 40 USDT and 70% retained blocks because no safe observed quote reaches the cash target.
- A closed market blocks unless the explicit rehearsal permission is selected.
- Paused markets always block, including with permission.
- An impact cap below the fixture's 0.20% blocks every candidate.
- Retaining 100% blocks before requesting a quote.

The visualization shows actual fixture plan output rather than a precomputed UI estimate. A blocked result never displays a selected sell amount. Limits can coexist, so a bounded-search failure can display multiple candidate rejection reasons.

## State and error boundaries

Changing an input clears the result and disables download. The submitted fields are snapshotted and an input fingerprint prevents delayed or duplicate notifications for unchanged values from cancelling a valid plan. In-flight requests are aborted on a real change and a generation counter prevents late responses from rendering into newer settings. Duplicate requests cannot move funds because the server has no mutation capability. Native labels, input constraints, status announcements, keyboard controls, reduced-motion support and a skip link are present.

The review window is 15 seconds from the synthetic balance snapshot, shorter than nominal quote expiry. Expiration changes the verdict to a historical snapshot. Download remains available for historical inspection and never authorizes execution. The record is explicitly `SYNTHETIC_PLANNING_RECORD`; its nested plan checksum detects edits, not truth, a wallet signature or settlement.

Errors and 429 outcomes remove stale results and allow a retry. The browser has a four-second request timeout. Server errors expose fixed local codes only. No user text is inserted as HTML.

## Local server contract

- Fixed loopback binding, exact asset and API URL allowlists.
- Fixed fixture identity. Unknown fields, wallets, live mode and execution flags are rejected.
- JSON only, 4 KiB maximum request body enforced with and without Content-Length.
- No gzip request decoding, cookies, sessions, external fonts or third-party scripts.
- Loopback Host validation, exact Origin validation when present and cross-site Fetch Metadata rejection.
- CSP restricts script, CSS, images and requests to the same origin. Framing and MIME sniffing are blocked.
- Global 30-request/minute budget and four concurrent requests, with no per-wallet/IP map growth.
- Five-second request/header timeouts, one-second keepalive, bounded solver requests and client-disconnect cancellation.

This is a loopback rehearsal service. These controls do not establish production authentication, infrastructure DoS protection or live wallet authorization. Do not deploy it as a trading backend. Built assets are copied into `dist/web` so compiled server imports resolve without referring to source assets.

## Verification

`npm run verify` includes 186 domain/HTTP tests, source typechecking, browser-JS syntax, compiled assets and basic source-policy checks. Forty-two new cases cover exact target calculation, fees/floor inherited checks, permission precedence, invalid schemas, HTTP isolation, rebinding, streaming body limits and bounded request work.

`npm run test:web` uses pinned agent-browser 0.38.2 and an isolated browser session against an ephemeral loopback port. It tests the landing page, automatic splash dismissal, manual skip, repeat-session bypass, reduced-motion bypass, keyboard navigation, browser history and a direct dashboard link. It also tests the happy path, unreachable cash, changed-input invalidation, closed permission, paused hard block, snapshot expiry and a delayed-response race. It checks document overflow and takes full screenshots of both views at 320, 375, 768, 1024 and 1440 pixels. Review the screenshots for visual quality. These tests are evidence of a synthetic interface, not live Binance execution. GitHub CI repeats this flow without API secrets.

## Entry flow

The root URL opens an explanatory landing page before the planning dashboard. The original logo appears in a maximum 1.8-second introduction with a skip button and Escape dismissal. The underlying site is inert during this introduction. Session storage is optional and its failure cannot block navigation. Returning visits in the same tab session, reduced-motion preferences and direct hash links bypass the introduction. No splash is displayed when JavaScript is unavailable, and the landing explanation remains readable.

`#dashboard`, legacy `#planner` and `#cash-target` links open the cash workspace. `#home`, `#how-it-works` and `#about` return to the landing view. Navigation updates the title and focuses the destination heading without resetting the cash inputs. A shared responsive footer links to the overview, planner, capabilities, builder profile and BNB Chain. It preserves the TEST_FIXTURE and disabled-execution labels and does not expose the private source repository.

The verifier also enters with the keyboard skip link and downloads a planning record through the actual browser action, checking its fixture labels, disabled execution and nested plan checksum. The checked screenshots are saved under `docs/assets/` for review after CI artifacts expire.

Smooth scrolling is limited to deliberate navigation-link clicks, with reduced-motion support. Native focus and implicit control scrolling stay immediate, preventing a moving form target from interfering with automated or keyboard interaction. The browser verifier checks this mode and confirms the target-change button click submits the form.

## Original mark

The built-in image generation tool produced `web/logo.png` for this project. A large retained disc and a detached small slice express preserved exposure. It contains no text and is integrated in the header and favicon. It is a raster mark with transparency, not a copied Binance symbol or proof of trademark clearance.

Final prompt: create one original textless minimal geometric Remain mark with a large protected retained portion and a small detached released slice, in flat warm Binance-inspired yellow #F0B90B on a transparent background. Strong asymmetric silhouette, crisp vector-friendly edges, recognizable at 24 pixels. No letters, arrows, shields, bells, stock charts, gradients, mockups, watermarks or copied Binance diamond.

Live asset discovery, wallet holdings, quote/vendor enforcement, wallet connection, signatures, approvals, settlement receipts and deployed trading availability remain unverified. Binance code 40304 must be resolved through authorized access and support.
