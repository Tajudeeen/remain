# Demo recording plan

## Current fixture rehearsal, about three minutes

This is an operator storyboard, not a recorded video or a live-trade demonstration. Keep the TEST_FIXTURE banner visible throughout. Narrate in your own words and show the actual result.

| Time | Action | Point to establish |
| --- | --- | --- |
| 0:00-0:20 | Open the landing page | A holder needs a cash amount while preserving a stock position. State that this is a fictional rehearsal and live integration is blocked. |
| 0:20-0:40 | Enter the planner | Show 100 fictional demo units and the zero-fee 1:1 assumption. |
| 0:40-1:10 | Ask for 25 USDT, retain at least 70% | Calculate. Inspect 25 units debit, minimum 25.00 cash and 75 retained. Explain the bounded search claim. |
| 1:10-1:35 | Choose the 40 USDT / keep 70% scenario | Show the unreachable-target block and absence of a chosen sell amount. |
| 1:35-2:05 | Select paused market, check the closed-market permission | Calculate. Show that permission cannot override a paused market. |
| 2:05-2:30 | Return to the safe scenario and download the record | Open the JSON. State that the checksum detects edits and does not prove a trade. |
| 2:30-3:00 | Open project status and footer | Explain exactly what works, what remains blocked, and where the evidence is documented. |

Record a backup take. Remove secret values, private account pages and browser notifications from the recording. Do not record a signature or a financial transaction until that separate action is authorized.

## Final contest video upgrade, only after the live gates pass

Replace the fictional position with a real supported BSC stock wrapper and authenticated data. Include the reviewed tiny sale and reconcile actual USDT, remaining stock, vendor order identity and BSC transaction. Show independent settlement verification. The final cut must remain under four minutes. Never splice fixture accounting into a real settlement claim.

## Rehearsal checklist

- Check the deployed build SHA before recording.
- Run `npm run check:submission`. Its packet integrity can pass while submission readiness stays BLOCKED.
- Run `npm run submission:status`, which currently exits 1 by design.
- Test the chosen scenarios once before the take. Avoid rapid repeated requests that exhaust the deployed rate budget.
- Save the final video URL only after recording and signed-out playback verification. No video URL exists yet.
