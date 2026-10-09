# Remain: non-vendor submission evidence checklist

Date: 2026-10-09. Track: tokenized stocks on BNB Smart Chain.
Do not conflate the fictional rehearsal with a funded mainnet sale.

## Evidence the owner can present without Binance access being restored

| User journey | Evidence to show | Current truth |
| --- | --- | --- |
| Cash target and retained exposure | Open `https://remain-cash.netlify.app/#dashboard` and demonstrate safe/unreachable/paused scenarios | Synthetic deterministic planner; not a live quote or fill |
| Real wallet ownership | Open `/#live`, use a personally controlled BSC wallet and `balanceOf` read if desired | Injected EOA wallet support implemented; this alone does not establish a tokenized-stock issuer or liquidity |
| Fresh market integration | Visit `/api/live/status` and safely record sanitized HTTP status from `/api/live/catalog` | Service configured, access-compliance restriction still blocks fresh hosted catalog; owner contacted team |
| Durable execution backend | Open `https://remain.tajudeenowoeteniyan.workers.dev/healthz` | Cloudflare Worker and SQLite DO respond; `journal: READY` is schema/crypto readiness, not offsite recovery |
| Financial execution gate | Open `https://remain.tajudeenowoeteniyan.workers.dev/api/execution/status` | `available:false`, no real trades/signatures allowed |
| Source and checks | Show public `https://github.com/Tajudeeen/remain`, workflow results, isolated test fixtures, README | Full CI exercises Node + Cloudflare mock and workerd, not a live venue |
| Honest API feedback | Describe actual 40304, selected local metadata observation and latest hosted HTTP 502 in a **personally written** DevEx report | Observations and hypotheses must be separately labelled |
| Short video | Follow `demo-script.md`; keep TEST_FIXTURE labels visible | Recording/upload/link requires owner action |

## What code cannot prove while Binance is restricted

- Supported real held-stock + eligible execution pair
- Live min-output, vendor fee and typed-data semantics
- Funded mainnet trade, spender allowance, user signature and a reconciled settlement
- Host/compliance eligibility and organizer acceptance

Avoid lowering safety checks or routing requests through new countries to evade compliance.

## Hardening that can be performed independently

- [x] Implement tested encrypted-journal snapshot format and isolated empty-only restore
- [x] Make Cloudflare build embed checked-out Git SHA instead of a hardcoded `unverified` value (verify after deploy)
- [x] Keep all three financial flags false, plus an independent backup-approval flag
- [x] Provide a truthful demo storyboard that shows both fixture mechanics and unavailable live endpoints
- [ ] Activate **private** Cloudflare R2 (account currently returns 10042, requires owner action) and attach the backup binding
- [ ] Run a real R2 upload, independent offline export, empty-object restore and key disaster drill; retain only redacted proof
- [ ] Compare deployed Cloudflare and Netlify exact build commits after each final deployment
- [ ] Write the final DevEx report personally, complete judging form, record actual demo, and verify signed-out links
- [ ] Supply approved user-held stock and real mainnet settlement evidence only after Binance restores eligible API access

## Operational decision

The public demo should remain explicitly labelled `TEST_FIXTURE`. Financial execution is **OFF**, even if the Durable Object journal is online. CI passing proves the checked scenarios, not the production economics.
