# Remain Paper Studio

**Verified free-host URL:** https://remain-paper.pages.dev/studio.html

Paper Studio is a self-contained, fully fictional product walkthrough. It is **not** a BSC testnet deployment, a Binance Web3 integration, an executable RFQ, or a mainnet sale. The read-only real-wallet and vendor integrations remain separate.

## Judge walkthrough (under 2 minutes)

1. Open Paper Studio and select a stock (three fictional positions; 350.00 fictional USDT starting cash).
2. Ask for 250 synthetic USDT, retain 70% and cap impact at 0.50%. The integer-cent and thousandth-share search finds the smallest synthetic debit meeting its minimum output, fee and slippage buffer.
3. Review BellGuard's simulated verdict, exact debit, minimum payout and remaining shares. The quote expires after 45 seconds; changing any input discards it.
4. Review the simulated order, then confirm. No real provider call, signer, RPC or transaction is used. The fictional portfolio is debited/credited and the journal records five deterministic stages.
5. Download the receipt and use Recheck latest receipt or upload it for verification. A SHA-256 hash and recomputed accounting detect accidental or unrehashable changes. A forged simulation file can be rehashed, so this is not an authenticated, tamper-proof blockchain receipt.
6. Test Trading halt, High impact, Thin liquidity and Stale data. Paused/stale never pass; a closed session needs explicit permission. Retained stock stays above the chosen floor.
7. Reload in the same tab to inspect preserved demo balances and journal. Reset only after the confirmation prompt.

## Architecture and invariants

- web/demo-engine.js is deliberately isolated from real execution, vendor and wallet modules; it has zero network imports. It models BellGuard-like limits but does not certify or replace the production src/planning/bellguard.ts logic.
- web/demo.js is a browser-only controller with a fictional in-tab portfolio and activity list. Storage is best-effort sessionStorage (not secured, authenticated, durable, multi-user or encrypted).
- web/studio.html and web/demo.css form a dedicated same-domain demo surface. Production live activation flags and wallet routes are unchanged.
- Arithmetic uses integer cents and thousandths of shares. Synthetic prices, impact, fees, slippage and fills are fixed assumptions, not market prices or executable quotes. Binary search minimizes sale input within this *one fictional* price function, not all real venues.
- Quote lifetime is 45 seconds. Quote is bound to one balance epoch, stock, scenario and intent; stale, changed and duplicate settlement cannot be processed.
- The simulator rederives the quote before accepting a simulated sale, then checks its synthetic floor and minimum payout.
- Simulation receipts explicitly set kind REMAIN_DEMO_RECEIPT_V1, mode SIMULATION, authenticity NONE; transaction hashes, block numbers and signatures are null. Verification checks event order, accounting, amount bounds and recomputed SHA-256.
- No private keys, seed phrases, Binance credentials or wallet approvals are used. Every displayed position and quantity is fictional.

## Verification

Run npm run verify and npm run test:coverage (Node 24). The demo-engine test suite covers pass/block scenarios, expiry, replay, tampering and accounting. Run npm run test:web for a Chromium walkthrough and five viewport widths. Check the exact deployed Netlify build SHA: passing GitHub CI alone does not certify a release.

## Submission truthfulness

- Accurate: A complete cash-target paper trading flow with guarded quotes, simulated settlement and checkable fictional accounting. Real wallet BSC read-only functions are implemented separately.
- Inaccurate: We traded stocks on BSC, Binance access works, a wallet signed this receipt, or this is a testnet fill.
- Vendor compliance rejection 40304 remains unresolved. This paper flow cannot substitute for an organizer requirement for a real Binance API call, eligible BSC transaction or mainnet execution. Keep that limitation explicit in the video and DevEx report.

A functioning product demonstration is valuable, but it must not be confused with verified financial execution.
