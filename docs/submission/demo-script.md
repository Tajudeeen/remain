# Demo recording plan

## Judge-ready truthful demonstration, 3:15 maximum

This is an operator storyboard, not a recorded video or a live-trade demonstration. Keep the TEST_FIXTURE banner visible throughout. Narrate in your own words and show the actual result.

| Time | Screen and cursor action | Say/show (do not overclaim) |
| --- | --- | --- |
| 0:00–0:20 | Open `https://remain-cash.netlify.app/`. Pause on the headline, then the primary cash-planning action. | “Remain turns the amount you need into a bounded tokenized-stock sale proposal while protecting the exposure you choose to keep.” |
| 0:20–0:55 | Click the demo planner and focus the target input and retained-percentage field. Enter 25 USDT and 70% retained in the **labelled test fixture**. | Explain these are fictional balances and prices, not your personal holdings or market quotes. |
| 0:55–1:25 | Click calculate, trace the recommended debit/retained holding. Change target to an unreachable amount. | Show the safe plan and the blocked state; the engine is not allowed to violate retained exposure to satisfy a cash target. |
| 1:25–1:50 | Change market to paused, toggle the closed-market permission if offered, click again. | BellGuard checks freshness, market state, slippage and constraints; paused still fails. These are deterministic fixture scenarios. |
| 1:50–2:15 | Navigate to the live workspace, show wallet-connect and current Binance integration status **without connecting someone else's wallet**. | Wallet/RWA discovery code exists; current authorized Binance hosting is returning access errors. Do not fabricate a quote or imply a position. |
| 2:15–2:40 | Open `https://remain.tajudeenowoeteniyan.workers.dev/healthz` and `/api/execution/status` in another tab. Hover over `journal: READY` and `available: false`. | Show deployed Worker + encrypted Durable Object, then explicitly state that live execution is intentionally locked pending vendor approval and mainnet proof. |
| 2:40–3:05 | Open public `github.com/Tajudeeen/remain`, go to tests and `docs/cloudflare-execution.md`; briefly show CI green. | The genuine implementation includes wallet-signing checks, encrypted durable recovery, two-RPC settlement checks and adversarial tests. CI proves fixture behavior only. |
| 3:05–3:15 | Return to the landing page and leave status unobstructed. | Close with the cash-first/retain-exposure use case. State exactly what remains pending. |

Record a backup take. Remove secret values, private account pages and browser notifications from the recording. Do not record a signature or a financial transaction until that separate action is authorized.

## Final contest video upgrade, only after the live gates pass

The current organizer page recommends a video of four minutes or less but does not require it. The prepared route is `/#trade`. Show approvals, order signing and submission as separate owner-confirmed actions. For a real receipt include exact UID, settlement hash and a fresh independent verifier result. Explain that exposure is checked against a snapshot and reconciled afterward. Concurrent wallet activity can invalidate the floor.

Replace the fictional position with a real supported BSC stock wrapper and authenticated data. Include the reviewed tiny sale and reconcile actual USDT, remaining stock, vendor order identity and BSC transaction. Show independent settlement verification. The final cut must remain under four minutes. Never splice fixture accounting into a real settlement claim.

## Rehearsal checklist

- Check the deployed build SHA before recording.
- Run `npm run check:submission`. Its packet integrity can pass while submission readiness stays BLOCKED.
- Run `npm run submission:status`, which currently exits 1 by design.
- Test the chosen scenarios once before the take. Avoid rapid repeated requests that exhaust the deployed rate budget.
- Save the final video URL only after recording and signed-out playback verification. No video URL exists yet.
