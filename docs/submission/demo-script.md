# Recording-ready Remain Paper Studio walkthrough

**Canonical demo:** https://remain-paper.pages.dev/studio

**Target:** A coherent ~2:30–3:00 demonstration filmed on one page, with no wallet handoff, no live-market route and no tab switching. A real stock sale is **not** demonstrated. Every balance, price, quote, order and receipt is SIMULATED.

## Before recording (30 seconds, off-camera)

1. Open the canonical Cloudflare Pages link in a browser with notifications hidden.
2. Click **Prepare my recording**. This resets all fictional orders, restores NOVA-SIM and 350.00 fictional USDT cash, sets 250.00 USDT target and 70% retained floor, and jumps back to Overview without a popup.
3. Check the SIMULATION ONLY banner and scroll so the headline is visible. Use the full browser width, hide bookmark/personal tabs, and move the cursor away from sensitive browser controls.
4. A fresh signed-out browser can verify `/healthz` build SHA separately before filming. Don't display a wallet, private keys, a funded account, signed payloads or a live-trading claim.

## Demo timeline and cursor cues

| Video time | Mouse/cursor action inside Paper Studio | What the judge should see and what to explain |
| --- | --- | --- |
| 0:00–0:18 | Pause at **Overview**, point at **Cash today. Exposure tomorrow.** | Remain starts with a cash need and preserves a chosen stock exposure floor instead of selling the whole position. All current values are fictional. |
| 0:18–0:40 | Click **Portfolio**, select NOVA-SIM, then **Simulate** | Three fictional stock holdings and a synthetic USDT ledger. No browser extension or wallet signature is involved. |
| 0:40–1:10 | Point at target **250.00 USDT**, retain **70%**, cap **0.50%**, press **Find guarded cash quote** | The engine finds the smallest synthetic stock debit meeting a fee/slippage-adjusted minimum, within the retained stock floor. |
| 1:10–1:36 | Open **Inspect each BellGuard rule** briefly to reveal observed market/impact/floor/cash values. Close it, then point at **Before → After** | Show observed impact vs cap, current stock units vs retained floor, and achievable cash vs requested cash. The before/after figures come from the current simulated quote. |
| 1:36–2:01 | Click **Review simulated order**, then **Confirm simulated sale** | Watch the before/after panel change from PROJECTED to SIMULATED FILL COMPLETE. USDT cash and stock holdings reconcile in the fictional journal. No real funds move. |
| 2:01–2:22 | Click **History & proof**, scroll to **A receipt, not a claim**, choose **Recheck latest receipt** | The event sequence and checksum verify supplied simulation arithmetic. Do NOT say it proves a blockchain settlement; a checksummed fiction is unauthenticated. |
| 2:22–2:45 | Click **Simulate**, select the **Trading halt** preset, point to BellGuard's MARKET/BLOCKED rule | The halt remains blocked even if closed-market permission is enabled. Explain why refusing unsafe requests is central to the product. |
| 2:45–3:00 | Click **Overview** and close on the brand message | The current demo proves product behavior. The real Binance integration and BSC settlement remain gated by authorized access and independent verification. |

## Screen-recording resilience

- All links, logo, navigation and footer **stay inside Paper Studio**; no live wallet or landing-page route.
- If the synthetic quote expires after 120 seconds, generate a new one; never force a stale quote.
- **Prepare my recording** deliberately replaces the fictional session state in one click. Use it before each take. The separate **Reset demo** control still asks for confirmation.
- The **Before/After** result shows *projected* values prior to confirmation and *settled simulation* values after confirmation. Do not describe them as exchange fills.
- If demo browsing accidentally affects the tab session, click **Prepare my recording** and restart the take rather than cutting between mismatched balances.
- After recording, play the public video signed-out and ensure all source/deployment links reflect the newest Cloudflare Pages commit.

## Technical evidence outside the recording

You may link reviewers to the public source, GitHub Actions and deployment evidence separately without making the demo UI navigate there. The Pages deployment is a self-contained fictional simulation; it is **not** a BSC testnet or Binance Web3 API trade. Compliance business code 40304 remains a real integration blocker. Keep the required developer-experience report in your own words, following [the owner worksheet](devex-worksheet.md).

## Eligible live-trade footage (separate future scope)

Do not splice a synthetic receipt into a signed BSC trade. A real demonstration would require the organizer-approved API route, an eligible held stock, a real RFQ/build, user-approved signing, successful mainnet settlement and independent USDT/stock reconciliation. Real-money execution remains OFF.
