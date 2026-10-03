# Launch Checklist

Every remaining step before Refledger site launch at refledger.gautamkhosla.com. Execute in order after 2026-10-10 seal check.

**Status:** Pre-launch (site repo ready, ledger frozen, seal in progress).

**Launch date:** After 2026-10-10T00:00:00Z seal lands on main (the 2026-10-09 day seal).

---

## Phase 1: Pre-Seal Verification (before 2026-10-10)

### ✅ 1.1 Code freeze in effect

**Status:** DONE (2026-10-03T00:00:00Z freeze start per FREEZE.md).

**Verify:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
cat FREEZE.md | grep "2026-10-03"
```

No code changes to ledger, poller, clock, or workflows until seal completes.

---

### ✅ 1.2 Conformance suites pass

**Verify now:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
cargo test -p refledger-log --test conformance --test head_conformance
cargo test -p refledger-verify --test conformance --test head_conformance
```

**Must pass before seal.** If either fails, investigate immediately (do NOT proceed).

**Status:** Assumed passing (would have blocked M1 start).

---

### ✅ 1.3 Signing key backed up offline

**Verify backup exists:**
- Check encrypted USB or password manager for `refledger-signing-key.age`
- Two copies required (per docs/KEY-BACKUP.md)
- Backup date recorded in operator notes

**Test restore (on throwaway machine):**
```bash
age -d -i ~/.ssh/id_ed25519 refledger-signing-key.age | wc -c
# Should output 65 (64 hex chars + newline)
```

**Do NOT** restore to production unless needed. This is a verification drill only.

**Status:** Assumed done (pre-genesis requirement per DEPLOYMENT.md).

---

### ✅ 1.4 Canary running on schedule

**Verify canary rotations:**
```bash
cd /home/gautamtalksdev/projects
git clone https://github.com/GautamTalksDev/canary.git
cd canary
git log --oneline --since="7 days ago" | head -10
```

Should see automated commits every 4 hours (canary.yml cron `17 */4 * * *`).

**Status:** Should be running (clock dispatches canary.yml per OPERATIONS.md §2026-09-30).

---

### ✅ 1.5 M1 measurement window in progress

**Verify:**
- Start date: 2026-10-03T00:00:00Z (per FREEZE.md)
- End date: 2026-10-10T00:00:00Z (seal of day 2026-10-09)
- Seven full days: 2026-10-03 through 2026-10-09 (inclusive)

**Check observations:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
git fetch origin data
git checkout origin/data
ls -1 observations/2026/10/ | head -10
```

Should see directories for 03, 04, 05, 06, 07, 08, 09 (and 10 on seal day).

**Status:** In progress.

---

## Phase 2: Seal Day (2026-10-10 at 00:00 UTC)

### ⏳ 2.1 Wait for 2026-10-09 seal to land on main

**When:** 2026-10-10T00:00:00Z (automated by poller).

**Verify seal landed:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
git fetch origin main
git log origin/main --oneline -5 | grep "seal 2026-10-09"
```

Should see commit: `ledger: seal 2026-10-09 seq <N>`.

**If seal missing after 00:30 UTC:**
- Check Actions logs: [github.com/GautamTalksDev/refledger/actions/workflows/poll.yml](https://github.com/GautamTalksDev/refledger/actions/workflows/poll.yml)
- Check for failures, scheduler lag, or GitHub API outage
- Follow RUNBOOK.md §1.1 (stale seal)

**Do NOT proceed** until seal lands.

---

### ⏳ 2.2 Verify ledger with strict mode

**After seal lands:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
git pull origin main
cargo run --locked --release -p refledger-verify -- data/log --strict \
  --pubkey b3e7e795c35dee53731e039b76da930fc54e87e2edc632449a8a2e55252e276a
```

**Expected output:**
```
chain: OK
entries: <number> (seq 0 .. <tip>)
span: 2026-09-29 .. 2026-10-09
head: signed, valid, key b3e7...
coverage gaps recorded: <number> skipped, <number> failed polls (from signed digests)
```

**If verification fails:**
- Note which check failed (linkage? signature? Rekor backlog?)
- STOP: do NOT launch site until resolved
- Follow RUNBOOK.md §1.5 (detection failure) or §1.6 (Rekor backlog)

**Must pass before site launch.**

---

### ⏳ 2.3 Check Rekor witness for latest head

**Verify Rekor submission:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
tail -1 data/log/heads.jsonl | jq '.rekor.log_index'
```

Should output an integer (Rekor log index). If `null` or `"error": "..."`, Rekor submission failed.

**Check Rekor status:**
- Visit [status.sigstore.dev](https://status.sigstore.dev)
- If incident active, wait for resolution

**If Rekor backlog >48 hours:**
- Follow RUNBOOK.md §1.6
- Acceptable to launch with note in site status (transparency)

**If Rekor witness present:** Proceed.

---

### ⏳ 2.4 Announce freeze lift (after seal verified)

**After 2.2 and 2.3 pass:**

1. **Update FREEZE.md:**
   ```bash
   cd /home/gautamtalksdev/projects/tagwatch
   git checkout main
   # Add entry to FREEZE.md under "Exceptions" or end note:
   # "Freeze lifted 2026-10-10 after seq <N> seal verified."
   git commit -am "docs: freeze lifted after M1 seal"
   git push origin main
   ```

2. **Announce on README.md:**
   - Update "Where things stand" section
   - Change "Stage" from "M1: genesis landed; code frozen" to "M1 complete; site live at refledger.gautamkhosla.com"

**Code changes, dependency updates, and PRs now allowed on main.**

---

## Phase 3: Site Hardening (before public launch)

These are pre-launch fixes for gaps identified in SECURITY-REVIEW.md.

### ⏳ 3.1 Remove CSP unsafe-inline

**Task:** Remove inline scripts from Astro pages; add CSP nonces for necessary inline code.

**Files to check:**
- `src/pages/*.astro`
- `src/layouts/*.astro`
- `src/components/*.astro`

**Verify no inline scripts:**
```bash
cd /home/gautamtalksdev/projects/refledger-site
grep -r '<script>' src/ --include="*.astro" | grep -v 'src="' | grep -v 'is:inline'
```

Should return no results (or only nonce-protected scripts).

**Update `_headers`:**
```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<RANDOM>'; style-src 'self' 'nonce-<RANDOM>'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.github.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

Replace `<RANDOM>` with actual nonce generation (Astro middleware or build script).

**Test:**
```bash
npm run build
npm run preview
# Open http://localhost:4321 and check console for CSP violations
```

**Status:** TODO.

---

### ⏳ 3.2 Add Trusted Types

**Task:** Enable Trusted Types API to prevent DOM XSS.

**Update `_headers`:**
```
/*
  Content-Security-Policy: ...; require-trusted-types-for 'script'; trusted-types default
```

**Update JS code:**
- Use `trustedTypes.createPolicy()` for any dynamic HTML insertion
- Check `src/lib/` for innerHTML usage

**Test:**
```bash
npm run build
npm run preview
# Check console for Trusted Types violations
```

**Status:** TODO.

---

### ⏳ 3.3 Add DOMPurify

**Task:** Install DOMPurify for defense-in-depth (even though Astro auto-escapes).

**Install:**
```bash
cd /home/gautamtalksdev/projects/refledger-site
npm install --save dompurify
npm install --save-dev @types/dompurify
```

**Use in components:**
```typescript
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(untrustedInput);
```

**Status:** TODO.

---

### ⏳ 3.4 Pin GitHub Actions to commit SHAs

**Task:** Pin all actions in `.github/workflows/*.yml` to full commit SHAs.

**Files to update (in tagwatch repo):**
- `.github/workflows/poll.yml`
- `.github/workflows/*.yml` (if others exist)

**Example:**
```yaml
# Before:
- uses: actions/checkout@v4

# After:
- uses: actions/checkout@<full-sha>  # v4.x.x
```

**Verify:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
grep -r 'uses:' .github/workflows/ | grep -v '@[a-f0-9]\{40\}' | grep -v '\./'
```

Should return no results (all actions pinned).

**Status:** TODO (cannot change during freeze; do after 2.4).

---

### ⏳ 3.5 Enable branch protection on main

**Task:** Require PR reviews, no force push, no deletions.

**Go to:** [github.com/GautamTalksDev/refledger/settings/branches](https://github.com/GautamTalksDev/refledger/settings/branches)

**Add rule for `main`:**
- ✅ Require a pull request before merging
  - ✅ Require approvals: 1
  - ✅ Dismiss stale reviews when new commits pushed
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Status checks: (add CI check names if they exist)
- ❌ Do not allow bypassing the above settings (no admin bypass)
- ❌ Allow force pushes: OFF
- ❌ Allow deletions: OFF

**Test:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
git checkout -b test-branch-protection
touch test-file.txt
git add test-file.txt
git commit -m "test: branch protection"
git push origin test-branch-protection
# Try to push directly to main (should be rejected)
git push origin test-branch-protection:main
# Should see: "required status checks" or "required reviews" error
```

**Status:** TODO (can do before or after seal; recommended before).

---

### ⏳ 3.6 Add Scorecard to CI

**Task:** Enable OpenSSF Scorecard GitHub Action.

**Create `.github/workflows/scorecard.yml`:**
```yaml
name: Scorecard
on:
  schedule:
    - cron: '0 3 * * 1'  # Weekly, Monday 03:00 UTC
  push:
    branches: [main]

permissions: read-all

jobs:
  analysis:
    name: Scorecard analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write

    steps:
      - uses: actions/checkout@<sha>  # Pin to SHA
        with:
          persist-credentials: false

      - uses: ossf/scorecard-action@<sha>  # Pin to latest
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true

      - uses: github/codeql-action/upload-sarif@<sha>  # Pin to SHA
        with:
          sarif_file: results.sarif
```

**Status:** TODO (after freeze lifts).

---

### ⏳ 3.7 Add CodeQL

**Task:** Enable GitHub CodeQL scanning.

**Go to:** [github.com/GautamTalksDev/refledger/security/code-scanning](https://github.com/GautamTalksDev/refledger/security/code-scanning)

**Click "Set up CodeQL":**
- Use default configuration (Rust + TypeScript)
- Commit `.github/workflows/codeql.yml`

**Or manually create:**
```yaml
name: CodeQL
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 4 * * 2'  # Weekly, Tuesday 04:00 UTC

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write

    strategy:
      matrix:
        language: [rust, javascript]

    steps:
      - uses: actions/checkout@<sha>
      - uses: github/codeql-action/init@<sha>
        with:
          languages: ${{ matrix.language }}
      - uses: github/codeql-action/autobuild@<sha>
      - uses: github/codeql-action/analyze@<sha>
```

**Status:** TODO (after freeze lifts).

---

### ⏳ 3.8 Generate SBOM

**Task:** Generate Software Bill of Materials (CycloneDX for Rust, SPDX for npm).

**Add to CI (`.github/workflows/ci.yml` or new workflow):**

```yaml
- name: Generate Rust SBOM
  run: |
    cargo install cargo-cyclonedx
    cargo cyclonedx --all --format json --output-file sbom-rust.json

- name: Generate npm SBOM
  run: |
    npx @cyclonedx/cyclonedx-npm --output-file sbom-npm.json
  working-directory: clock

- name: Upload SBOMs as artifacts
  uses: actions/upload-artifact@<sha>
  with:
    name: sboms
    path: |
      sbom-rust.json
      clock/sbom-npm.json
```

**Publish SBOMs:**
- Attach to GitHub Releases, or
- Commit to `docs/sbom/` (if acceptable to publish dependencies)

**Status:** TODO (after freeze lifts).

---

### ⏳ 3.9 Add AbortController to client-side fetches

**Task:** Add timeout to GitHub API fetches in browser.

**Files to update:**
- `src/lib/github.ts` (or wherever fetch calls live)

**Example:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);  // 10s timeout

try {
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  // ...
} catch (err) {
  if (err.name === 'AbortError') {
    // Timeout
  }
}
```

**Test:**
```bash
npm run dev
# Open check page, test with slow network (Chrome DevTools → Network → Slow 3G)
```

**Status:** TODO.

---

### ⏳ 3.10 Deploy watchdog Worker

**Task:** Create and deploy `refledger-watchdog` Cloudflare Worker.

**Create `watchdog/` directory:**
```bash
mkdir -p /home/gautamtalksdev/projects/refledger-site/watchdog
cd /home/gautamtalksdev/projects/refledger-site/watchdog
npm init -y
npm install --save-dev wrangler
```

**Create `wrangler.toml`:**
```toml
name = "refledger-watchdog"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[triggers]
crons = ["0 * * * *"]  # Every hour
```

**Create `src/index.ts`:**
```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Fetch heads.jsonl
    const res = await fetch('https://raw.githubusercontent.com/GautamTalksDev/refledger/main/data/log/heads.jsonl');
    const text = await res.text();
    const lines = text.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const head = JSON.parse(lastLine);

    // Check timestamp
    const recordedAt = new Date(head.head.recorded_at);
    const now = new Date();
    const ageHours = (now.getTime() - recordedAt.getTime()) / (1000 * 60 * 60);

    if (ageHours > 25) {
      // Alert: stale seal
      await fetch(env.ALERT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Refledger: stale seal (${ageHours.toFixed(1)}h old)`,
        }),
      });
    }

    // TODO: Check PAT expiry dates (if possible via GitHub API)
  },
};
```

**Deploy:**
```bash
npx wrangler secret put ALERT_WEBHOOK  # Paste Discord/Slack webhook URL
npx wrangler deploy
```

**Test:**
```bash
npx wrangler tail  # Watch logs
# Manually trigger cron via Cloudflare dashboard
```

**Status:** TODO.

---

### ✅ 3.11 Fill privacy contact (done)

**File:** `src/pages/privacy.astro` line 72.

**Replace:**
```astro
<!-- Before: -->
<a href="mailto:developwith.gt@gmail.com">developwith.gt@gmail.com</a>

<!-- After: -->
<a href="mailto:privacy@gautamkhosla.com">privacy@gautamkhosla.com</a>
```

**Or use GitHub Discussions link, or contact form URL.**

**Verify placeholder removed:**
```bash
cd /home/gautamtalksdev/projects/refledger-site
grep -r "developwith.gt@gmail.com" src/
```

Should return no results.

**Status:** TODO (user must provide actual contact).

---

## Phase 4: Cloudflare Pages Deployment

### ⏳ 4.x Create Pages deploy hook and wire watchdog

1. Cloudflare → Pages project → Settings → Deploy hooks → Create hook (branch `main`)
2. In `watchdog/`:
   ```bash
   wrangler secret put DEPLOY_HOOK_URL
   wrangler secret put GITHUB_TOKEN
   wrangler deploy
   ```
3. Required: create KV `WATCHDOG_STATE` and bind as `STATE` in `watchdog/wrangler.toml` (rebuilds refuse without it)
4. Confirm logs show `rebuild triggered mode=scheduled` within 3 hours, and
   `mode=after_seal` after the next daily seal
5. If rebuilds stop: see RUNBOOK § rebuilds and `watchdog/README.md`



### ⏳ 4.1 Create Cloudflare Pages project

**Go to:** Cloudflare dashboard → Pages → Create a project

**Connect to GitHub:**
- Select repository: `GautamTalksDev/refledger-site` (or fork if separate account)
- Production branch: `main`

**Build settings:**
- Framework preset: Astro
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/` (leave blank if repo root)

**Environment variables:**
- (None required; site is static)

**Click "Save and Deploy"**

**Wait for first build to complete.**

---

### ⏳ 4.2 Configure custom domain

**Go to:** Pages project → Custom domains → Set up a custom domain

**Add domain:** `refledger.gautamkhosla.com`

**DNS record (if zone on Cloudflare):**
- Cloudflare will auto-create CNAME or ALIAS record
- Type: CNAME
- Name: `refledger`
- Target: `<project-name>.pages.dev`
- Proxied: Yes (orange cloud)

**DNS record (if zone elsewhere):**
- Type: CNAME
- Name: `refledger`
- Target: `<project-name>.pages.dev`
- TTL: 300 (or default)

**Verify DNS propagation:**
```bash
dig refledger.gautamkhosla.com +short
# Should return Cloudflare IPs or CNAME to pages.dev
```

---

### ⏳ 4.3 Enable Always Use HTTPS

**Go to:** Cloudflare dashboard → SSL/TLS → Edge Certificates

**Always Use HTTPS:** ON

**Verify redirect:**
```bash
curl -I http://refledger.gautamkhosla.com
# Should return 301 redirect to https://
```

---

### ⏳ 4.4 Enable HSTS

**Go to:** SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS)

**Settings:**
- Enable HSTS: ON
- Max Age: 1 year (31536000 seconds)
- Include subdomains: OFF (unless subdomains also HTTPS)
- Preload: OFF initially (can enable later after testing)

**Or add to `_headers`:**
```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
```

**Verify:**
```bash
curl -I https://refledger.gautamkhosla.com | grep -i strict-transport
# Should return: Strict-Transport-Security: max-age=31536000
```

---

### ⏳ 4.5 Set minimum TLS version to 1.2

**Go to:** SSL/TLS → Edge Certificates → Minimum TLS Version

**Set to:** TLS 1.2 (or TLS 1.3 if no legacy browser support needed)

**Recommended:** TLS 1.2 (balance of security and compatibility).

**Verify:**
```bash
nmap --script ssl-enum-ciphers -p 443 refledger.gautamkhosla.com | grep TLSv1\.
# Should show TLSv1.2 or TLSv1.3, not TLSv1.0 or TLSv1.1
```

---

### ⏳ 4.6 Enable DNSSEC (if zone supports)

**Go to:** Cloudflare dashboard → DNS → Settings → DNSSEC

**If zone on Cloudflare:**
- Click "Enable DNSSEC"
- Copy DS record details
- Add DS record to parent zone (registrar)

**If zone elsewhere:**
- Check registrar's DNSSEC support
- Add DS records from zone provider

**Verify:**
```bash
dig refledger.gautamkhosla.com +dnssec +short
# Should show RRSIG records
```

**Status:** Optional (depends on zone registrar support).

---

### ⏳ 4.7 Add CAA record

**Purpose:** Restrict which CAs can issue certificates for this domain.

**Go to:** DNS → Add record

**Type:** CAA
**Name:** `refledger` (or `@` for whole zone)
**Tag:** `issue`
**Value:** `letsencrypt.org` (or Cloudflare's CA if using that)

**Additional CAA records:**
```
issue "letsencrypt.org"
issuewild "letsencrypt.org"
iodef "mailto:security@gautamkhosla.com"
```

**Verify:**
```bash
dig CAA refledger.gautamkhosla.com +short
# Should return CAA records
```

**Status:** Recommended (defense against unauthorized cert issuance).

---

### ⏳ 4.8 Verify _headers file deployed

**File:** `public/_headers` (must be in `public/` to be copied to `dist/` during build)

**Content:**
```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.github.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
```

**Verify headers deployed:**
```bash
curl -I https://refledger.gautamkhosla.com | grep -i x-frame-options
# Should return: X-Frame-Options: DENY
```

**Status:** Partially done (CSP needs hardening per 3.1).

---

## Phase 5: Final Verification

### ⏳ 5.1 Run site checks

```bash
cd /home/gautamtalksdev/projects/refledger-site
npm test
npm run build
npm run check:copy
npm run check:size
```

**All must pass before launch.**

---

### ⏳ 5.2 Run E2E tests

```bash
cd /home/gautamtalksdev/projects/refledger-site
npx playwright install chromium
npm run test:e2e
```

**All tests must pass.**

---

### ⏳ 5.3 Check for em/en dashes and double-hyphen in prose

**Scan new docs:**
```bash
cd /home/gautamtalksdev/projects/refledger-site
grep -r '—\|–\|--' docs/ | grep -v '\.md:.*`' | grep -v 'code'
# Should return no prose em/en/double-dash (only code fences allowed)
```

**Also check tagwatch docs:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
grep -r '—\|–' docs/ README.md | grep -v '\.md:.*`'
# Should return no results
```

**Fix any hits** (rephrase with commas, colons, or parentheses).

---

### ⏳ 5.4 Verify site claims nothing about unreleased features

**Search for mentions of relock-guard, MCP server, tlog-tiles:**
```bash
cd /home/gautamtalksdev/projects/refledger-site
grep -ri 'relock\|mcp.*server\|tlog' src/ docs/ | grep -v 'cache'
```

Should return no results (or only "In development" disclaimers).

**If found:** change to "In development" or remove entirely.

---

### ⏳ 5.5 Manual smoke test

**Open site:** [https://refledger.gautamkhosla.com](https://refledger.gautamkhosla.com)

**Check pages:**
- [ ] Home page loads
- [ ] /check page: paste `actions/checkout@v4`, click Check
- [ ] /verify page: verifier instructions visible
- [x] /privacy page: mailto developwith.gt@gmail.com (security.txt still uses GitHub private reporting)
- [ ] /security page: links to SECURITY.md work
- [ ] /how page: explanations render correctly
- [ ] No console errors (F12 → Console)

**Check CSP violations (F12 → Console):**
- Should see no CSP errors (after 3.1 done)

**Check responsiveness:**
- Resize browser window (mobile, tablet, desktop)
- All pages should be readable

---

## Phase 6: Announcement

### ⏳ 6.1 Update tagwatch README.md

**File:** `/home/gautamtalksdev/projects/tagwatch/README.md`

**Update "Where things stand" section:**

```markdown
| | |
|---|---|
| **Stage** | M1 complete; site live at [refledger.gautamkhosla.com](https://refledger.gautamkhosla.com) |
| **Watching** | 38 action keys across 35 repositories, plus a canary we control (36 poll groups) |
| **Poll rate** | every 5 minutes at `:02`, `:07`, … via Cloudflare Worker `refledger-clock` (Actions `schedule` as backup) |
| **Public site** | [refledger.gautamkhosla.com](https://refledger.gautamkhosla.com) |
```

**Add site link to top of README:**
```markdown
**Public site:** [refledger.gautamkhosla.com](https://refledger.gautamkhosla.com)
```

**Commit and push:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
git checkout main
git add README.md
git commit -m "docs: site live at refledger.gautamkhosla.com"
git push origin main
```

---

### ⏳ 6.2 Publish announcement (optional)

**Where to announce:**
- GitHub Discussions (if enabled): "Refledger site now live"
- Twitter/X, Mastodon, Bluesky, etc. (operator discretion)
- Hacker News Show HN (if desired)

**Template announcement:**

> Refledger is now live at refledger.gautamkhosla.com
>
> Refledger is an independent, public, verifiable log of GitHub Actions tag movements. It records what every watched tag pointed at, when it moved, and signs that record so nobody can quietly rewrite it later.
>
> Check any action repo to see its tag history, or verify the ledger yourself with the CLI.
>
> The M1 measurement (seven clean days of continuous polling) completed 2026-10-09. Ledger verifiable with: `cargo run --locked --release -p refledger-verify -- data/log --strict --pubkey b3e7...`
>
> Repository: [github.com/GautamTalksDev/refledger](https://github.com/GautamTalksDev/refledger)

**Status:** Optional (operator choice).

---

## Phase 7: Post-Launch Monitoring

### ⏳ 7.1 Monitor watchdog alerts

**After watchdog deployed (3.10):**
- Check alert webhook daily for first week
- Verify no stale seal alerts (unless expected outage)
- Verify no false alerts

---

### ⏳ 7.2 Review first week's observations

**One week after launch:**
```bash
cd /home/gautamtalksdev/projects/tagwatch
git fetch origin data
git checkout origin/data
# Check observations for any anomalies (unusual Failed counts, etc.)
```

---

### ⏳ 7.3 Schedule first dependency update

**After freeze lifts (2.4):**
- Review Dependabot alerts (RUNBOOK.md §3.3)
- Update dependencies with critical CVEs first
- Run conformance suites after each update

---

## Completion Criteria

**Launch is complete when:**

1. ✅ 2026-10-09 seal verified with strict mode
2. ✅ All Phase 3 hardening steps done (CSP, Trusted Types, actions pinned, branch protection, SBOMs, watchdog)
3. ✅ Privacy contact set to developwith.gt@gmail.com
4. ✅ Site deployed to refledger.gautamkhosla.com with HTTPS, HSTS, TLS 1.2+
5. ✅ All site checks and E2E tests pass
6. ✅ No em/en/double-dash in prose (except code fences)
7. ✅ Site claims nothing about unreleased features (relock/MCP/tlog)
8. ✅ Manual smoke test passes
9. ✅ README.md updated with site URL

**After launch:**
- Monitor watchdog alerts
- Review first week's observations
- Begin post-freeze dependency updates

---

## Changelog

### 2 October 2026 - Initial checklist

Pre-launch checklist created.

### 3 October 2026 - SPDX license field during the freeze

`refledger-site` `package.json` now has `"license": "Apache-2.0"`.

The refledger workspace `Cargo.toml` already sets `license = "Apache-2.0"`, and `refledger-log`, `refledger-verify`, `refledger-poller`, and `tools/calibrate` already declare it. Do not edit any `Cargo.toml` until the freeze lifts at 2026-10-10T00:00:00Z.

After the seal, add `license = "Apache-2.0"` to the three standalone tool manifests that still omit it: `tools/census/Cargo.toml`, `tools/canary-score/Cargo.toml`, and `tools/rekor-probe/Cargo.toml`. No other post-seal license edit is required.
