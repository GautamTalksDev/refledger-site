# Refledger Watchdog

Cloudflare Worker cron that monitors Refledger observatory health, manages a
single GitHub issue in GautamTalksDev/refledger, and triggers Cloudflare Pages
rebuilds so the public site stays current with the ledger.

## What It Does

### Health (every 15 minutes)

1. **Data branch commit age**: newest commit on the `data` branch is under 30 minutes old
2. **Newest signed head age**: newest head in `data/log/heads.jsonl` on `main` is under 26 hours old
3. **Witness backlog**: no head is waiting on a Rekor witness (missing `log_index`) for more than 48 hours

When checks fail, the watchdog opens or comments on a single GitHub issue titled
`Watchdog: observatory unhealthy`. When all checks recover, it comments and closes it.

### Site rebuilds

The public site is a static Astro build. Cloudflare Pages only rebuilds on a
code push unless a deploy hook is called. The watchdog keeps data fresh:

| Trigger | Cron | Behaviour |
| --- | --- | --- |
| Scheduled | `7 */3 * * *` (minute 7 every 3 hours) | POST the Pages deploy hook |
| After seal | on the 15 minute health cron | POST once when newest head `recorded_at` is newer than the last rebuild |

Hard cap: **10 rebuilds per UTC day**. Beyond that the worker logs
`rebuild skipped=daily_cap` and does nothing.

#### Monthly arithmetic vs Pages Free

Cloudflare Pages Free allows **500 builds per month** (account-wide). See
https://developers.cloudflare.com/pages/platform/limits/

- Scheduled: 8 rebuilds/day × 31 days = **248**/month
- Seal extras: about 1/day × 31 = **31**/month
- Hard cap: 10/day × 31 = **310**/month (still under 500)

## Prerequisites

1. A GitHub fine-grained personal access token:
   - **Resource owner**: GautamTalksDev
   - **Repository access**: Only select repositories → GautamTalksDev/refledger
   - **Permissions**: Issues → Read and Write only
   - **Expiration**: recommend 90 days with a calendar reminder to rotate

2. A Cloudflare Pages deploy hook for the site project (see below)

3. Optional but recommended: a Workers KV namespace for rebuild counters

4. Cloudflare Workers CLI (`wrangler`) installed

## Create the Pages deploy hook

1. Cloudflare dashboard → Workers & Pages → your Pages project for
   `refledger.gautamkhosla.com`
2. Settings → Builds & deployments → Deploy hooks → Create deploy hook
3. Name it e.g. `refledger-watchdog`, branch `main`
4. Copy the hook URL (treat it as a secret)

## Deployment

From the `watchdog/` directory:

```bash
# Optional: persistent daily rebuild counters
wrangler kv namespace create WATCHDOG_STATE
# Paste the id into wrangler.toml under [[kv_namespaces]] binding = "STATE"

# Secrets
wrangler secret put GITHUB_TOKEN
# Paste the fine-grained Issues token

wrangler secret put DEPLOY_HOOK_URL
# Paste the Pages deploy hook URL

wrangler deploy
```

Crons after deploy: `*/15 * * * *` (health + after-seal) and `7 */3 * * *` (scheduled rebuild).

## Testing

```bash
npm install
npm test
```

## If rebuilds stop

1. Cloudflare → Workers → `refledger-watchdog` → Logs: look for
   `rebuild skipped=...`, `deploy_hook status=...`, or `daily_cap`
2. Confirm `DEPLOY_HOOK_URL` is still set: `wrangler secret list`
3. In Pages → Deployments, confirm deploy-hook builds appear
4. If the site chip shows the delay notice ("Our last update was delayed"),
   trigger a manual deploy from the Pages dashboard or re-POST the hook
5. If you hit the daily cap early, wait for the next UTC day or raise
   `MAX_REBUILDS_PER_DAY` only after checking the monthly budget

## Security

- Tokens and the deploy hook URL are Cloudflare secrets and are never logged
- The worker has no public HTTP endpoint (always returns 404)
- No routes or custom domains
- GitHub token scope is Issues read/write on refledger only

## Operations

https://raw.githubusercontent.com/GautamTalksDev/refledger/main/OPERATIONS.md
