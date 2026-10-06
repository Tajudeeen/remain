# Binance compliance rejection: 40304

## Verified finding

[Discovery run 37413704037](https://github.com/Tajudeeen/remain/actions/runs/37413704037) failed at 2026-10-06 04:26 UTC after installation and verification passed. Binance returned business code 40304. It was an access rejection before any held-stock quote/build request, signature or submission.

Binance's [complete docs](https://web3.binance.com/en/dev-docs/llms-full.txt) define 40304 as a compliance restriction whose more specific rule is not identified. Its [service restrictions](https://web3.binance.com/en/dev-docs/web3-api-prohibited-regions) enforce client/server IP checks. This run did not establish runner country, valid credentials, key permissions, project approval or the exact restriction.

| Code | Safe classification | Action |
| --- | --- | --- |
| 40301 | Region restricted | Stop and confirm eligibility with Binance |
| 40302 | Proxy/VPN rejected | Use an authorized direct connection or ask support |
| 40303 | IP activity restricted | Stop and contact Binance support |
| 40304 | Compliance rule blocked | Confirm operator and host eligibility and project approval with Binance |

These failures never retry automatically, even inside HTTP 200 or alongside a 5xx status. Messages are local allowlisted descriptions, not echoed provider text. No proxy, VPN, location spoofing or restricted-user access workaround is implemented.

## Fastest diagnostic path

Check your Web3 developer project is approved and the key belongs to that project. Use your own authorized environment with a direct connection in a supported location. Run local discovery there to isolate a GitHub-hosted environment issue. If it also returns 40304, stop and ask Binance support to identify the rule. Do not repeatedly change locations or rotate keys to sidestep an access restriction.

On your own Windows machine, with Node.js 24 installed:

```powershell
git clone https://github.com/Tajudeeen/remain.git
cd remain
npm ci
npm run verify
Copy-Item .env.example .env.local
notepad .env.local
npm run discover:binance
```

Enter the two Binance credentials only in `.env.local`. The three wallet/token/amount values are unnecessary for discovery. The local file and evidence folder are ignored. Never send a private key, seed, raw response or credential to chat. Discovery evidence contains selected public token metadata or a safe error.

## Optional private-repo runner

If you want to keep credentials in GitHub Secrets, register a runner on your own approved host instead of copying the API credentials locally. In [Settings, Actions, Runners](https://github.com/Tajudeeen/remain/settings/actions/runners), choose New self-hosted runner and follow the current generated instructions for that machine. Add the custom label `remain-feasibility` when configuring it. Run only while you intend to accept the reviewed manual job.

The manual Binance workflow accepts runner `self-hosted`, matches that label and remains restricted to `main`. Automated pull-request CI still uses hosted runners without Binance credentials. A missing self-hosted runner leaves the job queued, not passed. Provisioning a runner is an owner action, not something this repo has completed. The host must itself be authorized for the service. This is not proof that Binance will accept it.

Treat this as a dedicated or ephemeral runner, not an unattended general-use machine. Stop/remove this runner before public release and review runner access first. GitHub [recommends private repositories](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners) for self-hosted runners because executing untrusted workflow code can compromise the machine.

## What closes the gate

Discovery success establishes only readable supported stocks. A second feasibility run must read a real held position, obtain a matching stock-to-USDT quote and inspect unsigned typed data. Then gate 0 can close. No signature or trade is authorized by either check.
