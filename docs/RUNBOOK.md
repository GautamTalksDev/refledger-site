# Runbook

Operational procedures for Refledger: incident response, token rotation, key recovery, and routine maintenance.

**Target audience:** Operator with access to GautamTalksDev GitHub account, Cloudflare account, and offline key backup.

---

## Quick Reference: Token Inventory

| Secret | Where | Scope | Expiry | Rotation procedure |
|---|---|---|---|---|
| `REFLEDGER_GITHUB_TOKEN` | Repository secret | Public repo contents (read) | Check GitHub PAT settings | §2.1 |
| `GITHUB_TOKEN` | Actions automatic | Contents write (default Actions) | Never (auto-renewed per job) | N/A (GitHub managed) |
| `REFLEDGER_SIGNING_KEY` | Environment `ledger` | Ed25519 seed (64 hex chars) | Never | §2.4 (no rotation procedure; recovery only) |
| `DISPATCH_TOKEN` | Cloudflare Worker secret | Actions write on refledger + canary | Check GitHub PAT settings | §2.2 |
| Cloudflare Pages deploy token | Cloudflare Pages project settings | Deploy to refledger.gautamkhosla.com | N/A (GitHub integration) | §2.3 (if using token; else N/A) |

**Expiry dates:** Fine-grained PATs expire in at most 1 year. Check expiry at [github.com/settings/tokens](https://github.com/settings/tokens?type=beta). Watchdog will alert 30 days before expiry (once deployed).

---

## 1. Incident Response

### 1.1 Stale seal (watchdog alert: no new head in >24 hours)

**Symptom:** Watchdog alerts "latest head timestamp >25 hours old".

**Impact:** Detection latency increases; observers may distrust ledger.

**Procedure:**

1. **Check Actions logs:**
   ```bash
   # Open recent poll.yml runs
   open https://github.com/GautamTalksDev/refledger/actions/workflows/poll.yml
   ```
   Look for failed runs, GitHub API errors (401, 403, 429, 500), or scheduler misses.

2. **Check GitHub status:**
   - Visit [githubstatus.com](https://www.githubstatus.com)
   - If incident active, wait for resolution and confirm polling resumes

3. **Check token expiry:**
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens?type=beta)
   - If `REFLEDGER_GITHUB_TOKEN` expired, rotate per §2.1
   - If `DISPATCH_TOKEN` expired, rotate per §2.2

4. **Manual dispatch (if clock/schedule both failing):**
   ```bash
   # GitHub CLI
   gh workflow run poll.yml --repo GautamTalksDev/refledger --ref main
   ```
   Or use GitHub web UI: Actions → poll.yml → Run workflow.

5. **Check logs again after dispatch:**
   - If poll succeeds, seal will land at next UTC midnight
   - If still failing, check for code/config issue (logs should show error)

6. **Publish status update (if >48 hours stale):**
   - Open issue on GautamTalksDev/refledger: "Polling outage YYYY-MM-DD"
   - Explain root cause, resolution, detection gap
   - Link to Failed/SchedulerLag observations in ledger
   - Update issue when seal resumes

**Recovery time:** Immediate (manual dispatch) to 24 hours (next seal).

---

### 1.2 Signing key compromise (suspected exfiltration)

**Symptom:** Unauthorized heads signed, or evidence of secret exposure (leaked in logs, found in attacker tooling).

**Impact:** Attacker can sign false heads; v1 ledger integrity compromised.

**Procedure:**

1. **Immediately rotate key (no procedure exists; v2 required):**
   - **Stop:** v1 has no rotation procedure. Rotation mid-chain requires design.
   - **Workaround:** If compromise certain, burn v1 and start v2 with new key. This is a breaking change.

2. **If burning v1 and starting v2:**
   - Generate new Ed25519 key (see tools/keygen or equivalent)
   - Update Environment secret `REFLEDGER_SIGNING_KEY` with new seed
   - Update docs/PUBLIC-KEY.md with new public key
   - Commit genesis entry with `log_id: refledger-v2` (new chain)
   - Publish incident disclosure explaining fork
   - Archive v1 ledger (read-only, no more seals)

3. **Audit ledger for false entries:**
   - Clone `data` branch; check observations against published ledger
   - Re-poll GitHub API for recent tags; compare to ledger claims
   - If false entries found, document in incident disclosure

4. **Publish incident disclosure (within 72 hours):**
   - Open GitHub Security Advisory (private initially): [github.com/GautamTalksDev/refledger/security/advisories/new](https://github.com/GautamTalksDev/refledger/security/advisories/new)
   - Title: "Signing key compromise YYYY-MM-DD"
   - Details: When suspected, when confirmed, what false entries (if any), v2 plan
   - Publish advisory after 72 hours (unless coordinated disclosure with GitHub)

5. **Notify Rekor (if false heads submitted):**
   - Email rekor@sigstore.dev with log_index values of false entries
   - Request annotation or revocation (Rekor does not delete)

**Recovery time:** v2 genesis can start immediately. Trust recovery takes longer (publish transparency of incident).

---

### 1.3 GitHub account compromise (GautamTalksDev)

**Symptom:** Unauthorized pushes, workflow changes, secret access, or suspicious activity email from GitHub.

**Impact:** Attacker can push code, exfiltrate secrets, delete repo, or force-push history.

**Procedure:**

1. **Secure account immediately:**
   - Change GitHub password: [github.com/settings/security](https://github.com/settings/security)
   - Revoke all sessions: Settings → Sessions → Revoke all
   - Review authorized OAuth apps: Settings → Applications → Revoke suspicious apps
   - Review SSH keys: Settings → SSH keys → Delete unrecognized keys
   - Enable 2FA if not enabled; reset 2FA device if compromised

2. **Audit repositories:**
   - Check git reflog for force-pushes:
     ```bash
     git clone https://github.com/GautamTalksDev/refledger.git
     cd refledger
     git reflog --all
     ```
   - If force-push detected, compare to Rekor witness (old heads still there)
   - Check `.github/workflows/` for new or modified workflows
   - Check repository secrets: Settings → Secrets → Actions (cannot view values, but can see last-updated)

3. **Rotate all PATs:**
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens?type=beta)
   - Delete all fine-grained PATs (REFLEDGER_GITHUB_TOKEN, DISPATCH_TOKEN)
   - Mint replacements with same scope (see §2.1, §2.2)
   - Update repository secret `REFLEDGER_GITHUB_TOKEN`
   - Update Cloudflare Worker secret `DISPATCH_TOKEN` (see §2.2)

4. **Audit ledger integrity:**
   - Run verifier:
     ```bash
     cargo run --locked --release -p refledger-verify -- data/log --strict \
       --pubkey b3e7e795c35dee53731e039b76da930fc54e87e2edc632449a8a2e55252e276a
     ```
   - If hash chain broken, check which entries corrupted
   - Compare to Rekor witness (GET /api/v1/log/entries?logIndex=...)

5. **Publish incident disclosure (within 72 hours):**
   - Same process as §1.2 (GitHub Security Advisory)
   - Title: "GitHub account compromise YYYY-MM-DD"
   - Details: When detected, what accessed, what rotated, ledger integrity status

**Recovery time:** Account secured in <1 hour. PATs rotated in <2 hours. Ledger audit in <4 hours.

---

### 1.4 Watchdog alert: token expiry approaching

**Symptom:** Watchdog alerts "PAT expires in <30 days".

**Impact:** None yet (alert is preventive).

**Procedure:**

1. **Rotate expiring PAT:**
   - If `REFLEDGER_GITHUB_TOKEN`, follow §2.1
   - If `DISPATCH_TOKEN`, follow §2.2

2. **Update watchdog with new expiry date:**
   - (Watchdog implementation TBD; may auto-detect from PAT metadata)

**Recovery time:** <30 minutes.

---

### 1.5 Detection failure (canary tag move not recorded)

**Symptom:** Canary ledger shows tag moved at time T, but Refledger observations around time T show no Move.

**Impact:** Detection latency worse than claimed, or classifier bug.

**Procedure:**

1. **Reproduce canary pattern:**
   - Check canary ledger for exact tag and time
   - Check Refledger observations on `data` branch for that poll window
   - Confirm poll succeeded (Ok or NotModified, not Failed/Skipped)

2. **If poll succeeded but Move missing:**
   - Classifier bug or enrich failure
   - Clone `data` branch; check observations JSONL for that repo/ref
   - Check in-progress log on `data` branch for classify output
   - Identify bug (e.g., peeling failed, compare skipped, ancestry wrong)

3. **If poll failed or skipped:**
   - Not a detection failure; expected gap
   - Check why poll failed (GitHub API error? Rate limit? Scheduler lag?)
   - Document in incident report as "detected gap, not missed detection"

4. **Append correction entry:**
   - If Move should have been logged but was not, append correction:
     ```json
     {
       "event": "correction",
       "corrects_seq": <seq of ObservationDigest>,
       "reason": "Classifier failed to emit Move for canary tag vX.Y.Z at YYYY-MM-DDTHH:MM:SSZ; bug in <component>.",
       ...
     }
     ```
   - Correction does not edit past entry; it adds new entry pointing at it

5. **Publish incident disclosure (within 72 hours):**
   - GitHub issue or Security Advisory if severe
   - Title: "Missed detection YYYY-MM-DD"
   - Details: Canary pattern, why missed, correction entry seq, bug fix status

6. **Fix bug (after freeze lifts):**
   - If during freeze (before 2026-10-10), document as exception in FREEZE.md
   - If after freeze, normal PR + conformance vector for missed case

**Recovery time:** Correction entry appended within 24 hours (next seal). Bug fix varies (frozen until 2026-10-10).

---

### 1.6 Rekor witness backlog >48 hours

**Symptom:** Daily head signed but Rekor submission failed or stalled; `rekor.error` in heads.jsonl for >48 hours.

**Impact:** No third-party witness; head not independently verifiable.

**Procedure:**

1. **Check Rekor status:**
   - Visit [status.sigstore.dev](https://status.sigstore.dev)
   - If incident active, wait for resolution

2. **Check heads.jsonl for error details:**
   ```bash
   git clone https://github.com/GautamTalksDev/refledger.git
   cd refledger
   tail -5 data/log/heads.jsonl
   ```
   Look for `"error": "..."` field. Common errors:
   - `409 Conflict`: entry already exists (resubmit with different timestamp? Or lookup existing)
   - `500 Internal Server Error`: Rekor transient failure (retry)
   - Network timeout: retry

3. **Manual Rekor submission (if retry needed):**
   - Clone repo; check out commit with latest seal
   - Run `tools/rekor-probe` or equivalent to resubmit head
   - If accepted, note `log_index` and manually append to heads.jsonl (new line, higher `rekor.attempts`)
   - Commit and push to main

4. **If backlog persists >72 hours:**
   - Append note to next ObservationDigest: `"note": "Rekor witness backlog: heads YYYY-MM-DD through YYYY-MM-DD pending."`
   - The verifier in strict mode will fail until backlog cleared (expected)

5. **Publish status update (if >72 hours):**
   - GitHub issue: "Rekor witness backlog YYYY-MM-DD"
   - Explain Rekor incident or root cause
   - Link to Sigstore status page
   - Update when backlog cleared

**Recovery time:** Rekor transient failures retry automatically. Persistent outage waits for Sigstore recovery (hours to days).

---

## 2. Token Rotation Procedures

### 2.1 Rotate REFLEDGER_GITHUB_TOKEN (GitHub read PAT)

**When:** Before expiry (watchdog alerts 30 days before), or on suspected compromise.

**Procedure:**

1. **Mint new fine-grained PAT:**
   - Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
   - Click "Generate new token"
   - Token name: `refledger-read-YYYYMMDD` (date for tracking)
   - Expiration: 1 year (maximum)
   - Repository access: Public Repositories (read-only)
   - Permissions:
     - Contents: Read-only
     - Metadata: Read-only (required by GitHub)
   - No other permissions
   - Generate token; copy value (shown once)

2. **Update repository secret:**
   - Go to [github.com/GautamTalksDev/refledger/settings/secrets/actions](https://github.com/GautamTalksDev/refledger/settings/secrets/actions)
   - Click `REFLEDGER_GITHUB_TOKEN` → Update
   - Paste new token value
   - Save

3. **Test with manual dispatch:**
   ```bash
   gh workflow run poll.yml --repo GautamTalksDev/refledger --ref main
   ```
   Check logs: poll should succeed (Ok or NotModified for each repo).

4. **Revoke old PAT:**
   - Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
   - Find old token (name `refledger-read-<old date>`)
   - Click Revoke

5. **Update expiry date in this runbook:**
   - Edit §1 Quick Reference table with new expiry (1 year from today)
   - Commit to repo

**Rollback:** If new token fails, revert secret to old token value (if not yet revoked), investigate issue, retry.

**Duration:** <15 minutes.

---

### 2.2 Rotate DISPATCH_TOKEN (clock Worker PAT)

**When:** Before expiry (watchdog alerts 30 days before), or on suspected compromise.

**Procedure:**

1. **Mint new fine-grained PAT:**
   - Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
   - Click "Generate new token"
   - Token name: `refledger-dispatch-YYYYMMDD`
   - Expiration: 1 year
   - Repository access: Only select repositories
     - Add `GautamTalksDev/refledger`
     - Add `GautamTalksDev/canary`
   - Permissions:
     - Actions: Read and write
     - Metadata: Read-only (required)
   - Generate token; copy value

2. **Update Cloudflare Worker secret:**
   ```bash
   cd ~/projects/tagwatch/clock  # or wherever clock/ lives
   wrangler secret put DISPATCH_TOKEN
   # Paste new token value when prompted
   ```

3. **Test clock dispatch:**
   - Wait for next cron trigger (`:02`, `:07`, ...), or
   - Manually trigger via Cloudflare dashboard (Workers → refledger-clock → Trigger cron)
   - Check that poll.yml runs successfully

4. **Revoke old PAT:**
   - Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
   - Find old token (name `refledger-dispatch-<old date>`)
   - Click Revoke

5. **Update expiry date in this runbook:**
   - Edit §1 Quick Reference table

**Rollback:** If clock fails, put old token back via `wrangler secret put DISPATCH_TOKEN` (if not revoked), investigate.

**Duration:** <15 minutes.

**Note:** Agents must NOT run `wrangler` commands. Operator only.

---

### 2.3 Cloudflare Pages deploy token (if applicable)

**When:** If using a personal access token for Cloudflare Pages deploys (not GitHub integration).

**Current setup:** Likely using GitHub integration (no separate token). If so, skip this section.

**If using token:**

1. **Check Cloudflare Pages project settings:**
   - Cloudflare dashboard → Pages → refledger-site → Settings → Builds & deployments
   - If "GitHub integration" is active, no token rotation needed (GitHub OAuth)

2. **If token-based:**
   - Generate new GitHub token with `repo` scope (classic token) or Contents read for one repo (fine-grained)
   - Update in Cloudflare Pages settings → Build configuration → Environment variables
   - Test deploy (push to GitHub or manual redeploy)
   - Revoke old token

**Duration:** <10 minutes (if applicable).

---

### 2.4 Signing key recovery (key lost, not compromised)

**When:** Environment secret `REFLEDGER_SIGNING_KEY` accidentally deleted, GitHub unavailable, or recovery drill.

**Procedure:**

1. **Retrieve offline backup:**
   - Locate age-encrypted backup file (`refledger-signing-key.age`)
   - Two copies: encrypted USB and/or password manager vault (per KEY-BACKUP.md)

2. **Decrypt:**
   ```bash
   age -d -i ~/.ssh/id_ed25519 refledger-signing-key.age
   ```
   Or use passphrase if encrypted to passphrase recipient:
   ```bash
   age -d refledger-signing-key.age
   ```
   Output: 64 lowercase hex characters (the Ed25519 seed).

3. **Verify public key matches:**
   - Derive public key from seed (use `tools/keygen --verify` or equivalent)
   - Compare to docs/PUBLIC-KEY.md (should match `b3e7e795c35dee53731e039b76da930fc54e87e2edc632449a8a2e55252e276a`)
   - If mismatch, STOP: wrong backup or corrupted file

4. **Restore to GitHub Environment secret:**
   - Go to [github.com/GautamTalksDev/refledger/settings/environments](https://github.com/GautamTalksDev/refledger/settings/environments)
   - Click `ledger` environment
   - Environment secrets → `REFLEDGER_SIGNING_KEY` → Update
   - Paste 64 hex chars
   - Save

5. **Test seal:**
   - Wait for next UTC midnight, or
   - Manually trigger seal (this requires code change; not exposed as dispatch parameter)
   - Check heads.jsonl for new head with correct signature

6. **Securely delete decrypted seed:**
   ```bash
   shred -u decrypted-key.txt  # if written to file
   # Or clear terminal scrollback
   ```

**Rollback:** N/A (recovery is one-way: backup → secret).

**Duration:** <30 minutes (assuming backup accessible).

**If backup also lost:** v1 ledger ends. Start v2 with new key (see §1.2).

---

## 3. Routine Maintenance

### 3.1 Verify ledger integrity (weekly or after incidents)

**Procedure:**

```bash
git clone https://github.com/GautamTalksDev/refledger.git
cd refledger
cargo run --locked --release -p refledger-verify -- data/log --strict \
  --pubkey b3e7e795c35dee53731e039b76da930fc54e87e2edc632449a8a2e55252e276a
```

**Expected output:**
```
chain: OK
entries: <number> (seq 0 .. <tip>)
span: <start date> .. <end date>
head: signed, valid, key b3e7...
coverage gaps recorded: <number> skipped, <number> failed polls (from signed digests)
```

**If failure:**
- Note which check failed (linkage? signature? witness backlog?)
- Follow incident response (§1.5 or §1.6)

**Frequency:** Weekly, or after any incident or configuration change.

---

### 3.2 Check canary detection latency (monthly)

**Procedure:**

1. **Clone canary repo:**
   ```bash
   git clone https://github.com/GautamTalksDev/canary.git
   cd canary
   ```

2. **Read canary ledger (TBD: format depends on canary implementation):**
   - Compare canary's recorded tag moves to Refledger observations
   - Check that each canary move appears in Refledger within <10 minutes

3. **If detection latency exceeds threshold:**
   - Investigate: GitHub API slow? Scheduler lag? Poll interval changed?
   - Document in docs/DETECTION.md

**Frequency:** Monthly, or after changes to polling cadence.

---

### 3.3 Review Dependabot alerts (after freeze lifts)

**When:** After 2026-10-10 seal (code freeze lifts).

**Procedure:**

1. **Check Dependabot alerts:**
   - Go to [github.com/GautamTalksDev/refledger/security/dependabot](https://github.com/GautamTalksDev/refledger/security/dependabot)
   - Review open alerts

2. **For each alert:**
   - Assess severity (CVSS score, exploit availability)
   - Check if Refledger usage affected (e.g., a web framework vuln in a CLI-only crate)
   - If critical and applicable, create PR to update
   - Run conformance tests: `cargo test -p refledger-log --test conformance --test head_conformance && cargo test -p refledger-verify --test conformance --test head_conformance`
   - Merge if green

3. **Update lockfiles:**
   ```bash
   cargo update
   npm update
   cargo test --workspace
   npm test
   git commit -am "chore: update dependencies YYYY-MM-DD"
   git push
   ```

**Frequency:** Weekly (after freeze lifts), or immediately on critical alert.

---

### 3.4 Backup signing key (annually or after key events)

**When:** Annually, or after key recovery drill, or when backup locations change.

**Procedure:**

1. **Follow docs/KEY-BACKUP.md:**
   - Export secret from GitHub (cannot view value; must use recovery or re-backup during keygen)
   - **Alternative:** if key not exportable, this is a drill failure. Document in runbook.

2. **Re-encrypt with age:**
   ```bash
   # Assuming you have the seed in a file (never commit this)
   age -r <AGE_RECIPIENT> -o refledger-signing-key-YYYYMMDD.age signing-key.txt
   ```

3. **Store in two offline locations:**
   - Encrypted USB (label with date)
   - Password manager vault or printed QR (age ciphertext is ASCII-armored)

4. **Test restore (on throwaway machine):**
   ```bash
   age -d -i ~/.ssh/id_ed25519 refledger-signing-key-YYYYMMDD.age | head -c 64
   # Verify output is 64 hex chars; do NOT verify public key (that would require importing key)
   ```

5. **Update runbook with backup date:**
   - Edit this section with new backup date

**Last backup:** TBD (fill after first backup).

**Frequency:** Annually.

---

### 3.5 Review access logs (quarterly)

**Procedure:**

1. **GitHub audit log:**
   - Go to [github.com/organizations/GautamTalksDev/settings/audit-log](https://github.com/organizations/GautamTalksDev/settings/audit-log) (if org)
   - Or personal account: [github.com/settings/security-log](https://github.com/settings/security-log)
   - Review secret access, workflow runs, repo settings changes

2. **Cloudflare audit log:**
   - Cloudflare dashboard → Audit Log
   - Review Worker deploys, secret updates, Pages deploys

3. **Look for anomalies:**
   - Unexpected secret access
   - Workflow runs from unknown IP (Actions IP ranges are documented)
   - Unauthorized Pages deploys
   - Worker secret updates outside rotation schedule

4. **If anomalies found:**
   - Follow §1.3 (account compromise investigation)

**Frequency:** Quarterly, or immediately on suspicious activity alert.

---

## 4. Pre-Launch Checklist (before 2026-10-10 seal)

### 4.1 Privacy contact (done)

**Where:** `/home/gautamtalksdev/projects/refledger-site/src/pages/privacy.astro` line 72.

**Done:** `/privacy` uses mailto:developwith.gt@gmail.com. `security.txt` still points at GitHub private vulnerability reporting.

**Verify:**
```bash
cd /home/gautamtalksdev/projects/refledger-site
grep -n "developwith.gt@gmail.com" src/pages/privacy.astro
# Should return no results after fix
```

---

### 4.2 Enable branch protection on main

**Before launch, enable:**

1. **Go to [github.com/GautamTalksDev/refledger/settings/branches](https://github.com/GautamTalksDev/refledger/settings/branches)**

2. **Add rule for `main`:**
   - Require a pull request before merging
     - Require approvals: 1
     - Dismiss stale reviews when new commits pushed
   - Require status checks to pass before merging
     - Require branches to be up to date before merging
     - Status checks: `ci` (if exists), `conformance` (if exists)
   - Do not allow bypassing the above settings (no admin bypass during freeze)
   - Allow force pushes: **OFF**
   - Allow deletions: **OFF**

3. **Save changes**

4. **Test:** Try to push directly to main (should be rejected).

---

### 4.3 Deploy watchdog Worker

**Task:** Create and deploy separate Cloudflare Worker `refledger-watchdog`.

**Functionality:**
- Cron every hour
- Fetch `https://raw.githubusercontent.com/GautamTalksDev/refledger/main/data/log/heads.jsonl`
- Parse last line; check `head.recorded_at` timestamp
- If >25 hours old, alert (email or webhook)
- Check PAT expiry dates (hardcoded or fetched from GitHub API)
- If <30 days to expiry, alert

**Alert mechanism:** TBD (email via Cloudflare Email Workers, or webhook to Discord/Slack).

**Status:** Not deployed yet. See LAUNCH-CHECKLIST.md for remaining steps.

---

### 4.4 Verify conformance suites pass

**Before seal (2026-10-10), confirm:**

```bash
cd /home/gautamtalksdev/projects/tagwatch
cargo test -p refledger-log --test conformance --test head_conformance
cargo test -p refledger-verify --test conformance --test head_conformance
```

Both must pass. If either fails, do NOT proceed to seal.

---

## 5. Emergency Contacts

- **GitHub Support:** [support.github.com](https://support.github.com) (account issues, API outages)
- **Cloudflare Support:** [cloudflare.com/support](https://www.cloudflare.com/support) (Worker/Pages issues)
- **Sigstore Rekor:** [rekor@sigstore.dev](mailto:rekor@sigstore.dev) (witness issues)
- **Operator primary:** (fill with operator email/phone)
- **Operator backup:** (fill if team expands)

---

## 6. Changelog

### 2 October 2026 - Initial runbook

Initial runbook for pre-launch preparation.

Next update: After first incident, or after 2026-10-10 seal (whichever first).

## Rebuilds stopped (site data stale)

Symptoms: "Last checked" chip older than about 30 minutes, or the notice
"Data is from …. Our last update was delayed."

1. Cloudflare → Workers → `refledger-watchdog` → Logs
   - `rebuild skipped=daily_cap`: wait for next UTC day
   - `rebuild skipped=no_hook`: run `wrangler secret put DEPLOY_HOOK_URL` (after the Pages project exists)
   - `rebuild skipped=no_state`: create KV `WATCHDOG_STATE` and bind as `STATE` in `watchdog/wrangler.toml`, then redeploy
   - `deploy_hook status=4xx/5xx`: recreate the Pages deploy hook and update the secret
2. Pages → Deployments: confirm deploy-hook builds
3. Manual recovery: Pages → Deployments → Retry deployment, or POST the hook once
4. Confirm the chip advances after the next successful build

Deploy hook setup: Cloudflare Pages project → Settings → Deploy hooks.
Secret name: `DEPLOY_HOOK_URL` on the `refledger-watchdog` Worker.
KV binding `STATE` is required for rebuilds; health alerting works without the hook.

