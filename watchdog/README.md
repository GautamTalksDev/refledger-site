# Refledger Watchdog

Cloudflare Worker cron that monitors Refledger observatory health and manages a single GitHub issue in GautamTalksDev/refledger.

## What It Does

Every 15 minutes, the watchdog runs three health checks:

1. **Data branch commit age**: Ensures the newest commit on the `data` branch is under 30 minutes old
2. **Newest signed head age**: Ensures the newest head in `data/log/heads.jsonl` on `main` is under 26 hours old
3. **Witness backlog**: Ensures no head is waiting on a Rekor witness (missing `log_index`) for more than 48 hours

When checks fail, the watchdog opens or comments on a single GitHub issue titled `Watchdog: observatory unhealthy`. When all checks recover, it comments on the open issue and closes it.

## Prerequisites

1. A GitHub fine-grained personal access token with the following settings:
   - **Resource owner**: GautamTalksDev
   - **Repository access**: Only select repositories → GautamTalksDev/refledger
   - **Permissions**: Issues → Read and Write only
   - **Expiration**: Set to your organization's security policy (recommend 90 days with calendar reminder to rotate)

2. Cloudflare Workers CLI (`wrangler`) installed

## Deployment

From the `watchdog/` directory:

```bash
# Set the GitHub token secret
wrangler secret put GITHUB_TOKEN
# Paste your fine-grained token when prompted

# Deploy the worker
wrangler deploy
```

The worker will start running on the configured cron schedule (`*/15 * * * *`).

## Testing

```bash
npm install
npm test
```

All tests should pass before deployment.

## Monitoring

The worker logs all health check results and issue operations to Cloudflare Workers logs. Check the Cloudflare dashboard for:

- `health_check status=healthy` when all checks pass
- `health_check status=unhealthy failed_checks=...` when checks fail
- `create_issue`, `comment_on_issue`, `close_issue` for issue management operations

## Security

- The GitHub token is stored as a Cloudflare secret and is never logged
- The worker has no public HTTP endpoint (always returns 404)
- No routes or custom domains are configured
- The token has minimal scope (Issues read/write on a single repository only)

## Operations

For operational contact and incident response, see:
https://raw.githubusercontent.com/GautamTalksDev/refledger/main/OPERATIONS.md
