# Evidence worksheet for the owner's DevEx report

This is not the final report and must not be submitted as one. The organizer rejects AI-generated DevEx reports. Write the final account in your own voice, based on actions and outcomes you personally experienced. Use the evidence below as supporting material, and distinguish assistant-observed CI from your own local work.

## Confirmed observations to investigate and describe

| Observation | Source | Your own account to add |
| --- | --- | --- |
| GitHub signed discovery received Binance business code 40304 on 2026-10-06 at 04:26 UTC | Discovery run linked in `docs/devex-log.md` | What setup you completed before the run and what you saw in the portal. Do not say a successful call occurred. |
| Your local discovery also returned 40304 at 05:23:34 UTC | Your run ID `ac3580b8-1e20-4ad5-b8f7-9a895b6f8dda` | Confirm the local result and record any actual support response. The exact restriction is still unknown. |
| Signing includes `/build` and exact query/body bytes | Authentication documentation and unit vectors | Did this cause a real problem for you? Separate a documentation finding from an observed runtime error. |
| `referencePrice` is derived from token data | Documentation review in `docs/devex-log.md` | Explain how this changed the premium/gap feature. It is not an independent exchange quote. |
| RFQ typed-data and fee enforcement need live confirmation | Documentation review and strict validation code | Record the actual schema only after access succeeds. Do not turn an ambiguity into a claimed vendor failure. |

## Measurements that are still missing

No first successful API-call time, successful endpoint latency, issuer coverage, live liquidity depth, slippage, market-hours behavior or settlement timing has been measured. Do not substitute fixture speed or fake numbers. After authorized access succeeds, record:

| UTC time | Run ID | Exact documented endpoint | Result/business code | Duration | Asset/issuer/market state | Sanitized evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending | Pending |

For every failure, write the expected outcome, actual outcome, reproducible steps, documentation page/section and a specific suggested fix. Exclude credentials, raw signatures, wallet balances and signed payloads.

## Developer-platform feedback prompts

- What would an approved first-call experience show before the request?
- Which project/access/host checks should a developer be able to inspect after 40304?
- What exact RFQ typed-data example would remove the need to guess field binding?
- Which distinction between RFQ building and transaction simulation should be clearer?
- Which suggestions did Binance support confirm, and which are still your hypotheses?

## AI stack section for owner completion

Describe the tools and models you actually used, which tasks each helped with, what you personally reviewed, and where outputs were wrong or incomplete. This repository work used ChatGPT/Codex assistance for planning, TypeScript, tests, documentation and deployment interaction. Exact model/version, costs, time saved and any other tools require your confirmation. Do not claim Agentic Wallet or Agent Studio integration.

## Final review

Open the organizer's template and confirm its exact questions. Replace this worksheet with your original report outside the submitted source packet as needed. Check every number against retained evidence and confirm the report can be read while signed out.
