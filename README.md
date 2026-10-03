# Refledger Site

Public website for [Refledger](https://github.com/GautamTalksDev/refledger) at [refledger.gautamkhosla.com](https://refledger.gautamkhosla.com).

**Status:** Pre-launch. Site deploys after 2026-10-10 seal verification.

---

## What is Refledger?

Refledger is an independent, public, verifiable log of GitHub Actions tag movements. It watches action repositories, records what every tag pointed at and when it moved, and signs that record daily so nobody (including us) can quietly rewrite it later.

This site provides:
- **Repository checks:** See any action's complete tag history
- **Workflow checks:** Paste a workflow file to check all actions it uses
- **Ledger verification:** Verify the signed ledger in your browser or with the CLI
- **Documentation:** How the system works, how to verify it yourself, and what we promise

The ledger itself lives at [GautamTalksDev/refledger](https://github.com/GautamTalksDev/refledger) under `data/log/` (sealed days) and the `data` branch (in-progress observations).

---

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    refledger.gautamkhosla.com               │
│                   (Static Astro site on Cloudflare Pages)   │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ Fetches at build time (no secrets)
               ↓
┌──────────────────────────────────────────────────────────────┐
│         GautamTalksDev/refledger (GitHub public repo)        │
│                                                              │
│  main branch:                                                │
│    data/log/YYYY/MM/DD.jsonl  (sealed ledger)                │
│    data/log/heads.jsonl       (signed daily heads)           │
│                                                              │
│  data branch:                                                │
│    observations/YYYY/MM/DD/   (raw poll results)             │
│    log/YYYY/MM/DD.jsonl       (in-progress chain)            │
│    state/                     (poller state, not published)  │
└──────────────────────────────────────────────────────────────┘
               ↑
               │ Polls every 5 minutes
               │
┌──────────────┴───────────────────────────────────────────────┐
│            refledger-poller (GitHub Actions workflow)        │
│  - Polls GitHub API for watched repos                        │
│  - Records observations (Ok, NotModified, Failed, Skipped)   │
│  - Classifies tag movements (severity, correlation)          │
│  - Signs daily ObservationDigest with Ed25519                │
│  - Pushes sealed log to main, observations to data branch    │
└──────────────────────────────────────────────────────────────┘
               ↑
               │ Dispatches poll.yml every 5 min
               │
┌──────────────┴───────────────────────────────────────────────┐
│        refledger-clock (Cloudflare Worker, cron only)        │
│  - No public HTTP routes (404 for all requests)              │
│  - Cron: 2-57/5 * * * * (every 5 min, never :00)             │
│  - POSTs workflow_dispatch to poll.yml on main               │
└──────────────────────────────────────────────────────────────┘
```

### Data flow

1. **Clock triggers poller** (every 5 minutes, or Actions `schedule` as backup)
2. **Poller queries GitHub API** (conditional requests with ETags; rate-limited)
3. **Observations recorded** on `data` branch (every poll, success or failure)
4. **Classification** (pure function: Move, Deletion, Correlation, severity)
5. **Hash chaining** (each entry points at previous; canonical JSON + SHA-256)
6. **Daily seal** (midnight UTC: sign ObservationDigest with Ed25519, witness in Rekor)
7. **Publish** (fast-forward push sealed log to `main` under `data/log/`)
8. **Site fetches** (at build time: clone `main` and `data` branches into `.cache/`)
9. **Visitor loads site** (static HTML/CSS/JS; no server-side logic)
10. **Visitor checks repo** (browser fetches from GitHub API directly; no proxy)

**Key properties:**
- Site has no secrets (only public data)
- Checks run in visitor's browser (no server-side API calls)
- Ledger append-only (hash chain prevents tampering)
- Signed daily (Ed25519 signature over digest)
- Witnessed publicly (Rekor log, independent verification)

---

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Git

### Setup

```bash
git clone https://github.com/GautamTalksDev/refledger-site.git
cd refledger-site
npm ci
```

### Development server

```bash
npm run dev
```

Open [http://localhost:4321](http://localhost:4321)

**Hot reload:** Changes to `src/` trigger automatic page refresh.

**Data caching:** Ledger data cloned into `.cache/` at build time (no token needed; public repos). Delete `.cache/` to force refresh.

### Build

```bash
npm run build
```

Output: `dist/` (static HTML/CSS/JS)

### Preview production build

```bash
npm run preview
```

Open [http://localhost:4321](http://localhost:4321) (serves `dist/`, not `src/`)

---

## Testing

### Type checking

```bash
npm run check
```

Runs `astro check` (TypeScript + Astro diagnostics).

### Linting

```bash
npm run lint
```

(If lint script configured; otherwise manual `eslint` or `biome`.)

### Copy checks (no em/en dashes)

```bash
npm run check:copy
```

Scans `src/` and `docs/` for em dash (U+2014), en dash (U+2013), and double-hyphen (`--`) in prose. Fails if found (except in code fences).

**Rule:** No em/en/double-dash in user-facing prose. Use commas, colons, or parentheses. Exception: CLI flags inside fenced code blocks, and CSS custom properties written as var(--name).

### Size checks

```bash
npm run check:size
```

Checks bundle size against thresholds (if configured). Fails if JS/CSS bundles exceed limits.

### E2E tests

```bash
npx playwright install chromium
npm run test:e2e
```

End-to-end tests with Playwright:
- Home page loads
- Check page: submit repo name, results render
- Verify page: instructions visible
- Privacy page: no placeholder text
- Security page: links work

### Full test suite

```bash
npm test
```

Runs all checks: type check, build, copy, size, E2E.

---

## API Reference

The site exposes no server-side API (everything is static). Visitors interact with:

1. **GitHub REST API** (via browser fetch, no proxy)
2. **Ledger files** (pre-fetched at build time, served statically)

### Client-side GitHub API usage

When a visitor checks a repository, the browser fetches from GitHub's REST API:

- `GET /repos/{owner}/{repo}/git/matching-refs/tags` (list tags)
- `GET /repos/{owner}/{repo}/git/tags/{sha}` (peel annotated tags)
- `GET /repos/{owner}/{repo}/git/commits/{sha}` (get commit → tree)
- `GET /repos/{owner}/{repo}/contents/action.yml` (parse dependencies)

**Rate limits:** Unauthenticated requests = 60/hour per IP. Authenticated (user's PAT) = 5,000/hour. Site does not handle authentication; user can add their own PAT via browser localStorage (future enhancement).

**Privacy:** GitHub sees visitor's IP and the repo name queried. Refledger site never sees those requests. See [Privacy](#privacy) below.

### Ledger files (static)

The following are served as static files (cached at build time):

- `/data/log/heads.jsonl` (signed daily heads)
- `/data/log/YYYY/MM/DD.jsonl` (sealed day files)
- `/observations/YYYY/MM/DD/*.jsonl` (raw observations; large; not served unless explicitly requested)

Example fetch:
```javascript
const res = await fetch('/data/log/heads.jsonl');
const text = await res.text();
const heads = text.trim().split('\n').map(JSON.parse);
```

---

## Deployment

Refledger site deploys to **Cloudflare Pages** at [refledger.gautamkhosla.com](https://refledger.gautamkhosla.com).

### Step-by-step deployment guide

#### 1. Create Cloudflare Pages project

1. Go to Cloudflare dashboard → **Pages** → **Create a project**
2. Click **Connect to Git**
3. Select **GautamTalksDev/refledger-site** (or your fork)
4. **Production branch:** `main`
5. **Build settings:**
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/` (leave blank)
6. **Environment variables:** (none required; site is static)
7. Click **Save and Deploy**

First build will take 2-3 minutes. Wait for "Success" status.

#### 2. Configure custom domain

1. In Pages project settings, go to **Custom domains**
2. Click **Set up a custom domain**
3. Enter `refledger.gautamkhosla.com`
4. Cloudflare will prompt for DNS record:

**If DNS zone is on Cloudflare:**
- Cloudflare auto-creates CNAME record `refledger` → `<project-name>.pages.dev`
- Proxied: **Yes** (orange cloud)

**If DNS zone is elsewhere:**
- Add CNAME record at your DNS provider:
  - **Type:** CNAME
  - **Name:** `refledger`
  - **Target:** `<project-name>.pages.dev`
  - **TTL:** 300 (or default)

5. Click **Activate domain**

DNS propagation takes 1-5 minutes (Cloudflare) or up to 48 hours (external DNS).

**Verify:**
```bash
curl -I https://refledger.gautamkhosla.com
# Should return 200 OK
```

#### 3. Enable Always Use HTTPS

1. Cloudflare dashboard → **SSL/TLS** → **Edge Certificates**
2. **Always Use HTTPS:** Turn ON
3. Save

**Test redirect:**
```bash
curl -I http://refledger.gautamkhosla.com
# Should return 301 → https://
```

#### 4. Enable HSTS (HTTP Strict Transport Security)

**Option A: Via Cloudflare dashboard**
1. SSL/TLS → Edge Certificates → **HSTS Settings**
2. **Enable HSTS:** ON
3. **Max Age:** 1 year (31536000 seconds)
4. **Include subdomains:** OFF (unless all subdomains also use HTTPS)
5. **Preload:** OFF initially (can enable after testing)

**Option B: Via `_headers` file** (already configured)
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

**Verify:**
```bash
curl -I https://refledger.gautamkhosla.com | grep -i strict-transport
# Should return: Strict-Transport-Security: max-age=31536000
```

#### 5. Set minimum TLS version

1. SSL/TLS → Edge Certificates → **Minimum TLS Version**
2. Set to **TLS 1.2** (or TLS 1.3 if no legacy browser support needed)
3. Save

**Recommended:** TLS 1.2 (balance of security and compatibility).

**Verify:**
```bash
openssl s_client -connect refledger.gautamkhosla.com:443 -tls1_1
# Should fail (connection refused or protocol error)

openssl s_client -connect refledger.gautamkhosla.com:443 -tls1_2
# Should succeed
```

#### 6. Enable DNSSEC (optional, if zone supports)

**If DNS zone is on Cloudflare:**
1. Cloudflare dashboard → **DNS** → **Settings** → **DNSSEC**
2. Click **Enable DNSSEC**
3. Copy DS record details (Algorithm, Key Tag, Digest)
4. Go to your domain registrar (e.g., Namecheap, GoDaddy)
5. Add DS record to parent zone

**Verify:**
```bash
dig refledger.gautamkhosla.com +dnssec +short
# Should show RRSIG records
```

**Status:** Optional (depends on registrar support).

#### 7. Add CAA record (optional, recommended)

**Purpose:** Restrict which Certificate Authorities can issue certificates for this domain.

**DNS record:**
- **Type:** CAA
- **Name:** `refledger` (or `@` for entire zone)
- **Tag:** `issue`
- **Value:** `letsencrypt.org` (or `digicert.com` if using Cloudflare's CA)

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

#### 8. Verify `_headers` file deployed

The `public/_headers` file configures HTTP security headers (CSP, X-Frame-Options, etc.).

**Check headers:**
```bash
curl -I https://refledger.gautamkhosla.com | grep -E 'X-Frame-Options|Content-Security-Policy|X-Content-Type'
```

**Expected output:**
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'; ...
```

**If headers missing:**
- Ensure `public/_headers` exists (not `src/_headers`)
- Rebuild and redeploy
- Cloudflare Pages auto-detects `_headers` in output directory

#### 9. Test with production build

**Manual smoke test:**
1. Open [https://refledger.gautamkhosla.com](https://refledger.gautamkhosla.com)
2. Check home page loads
3. Go to `/check`, enter `actions/checkout`, click Check
4. Verify results render (tags table, timeline)
5. Open browser console (F12) → check for errors
6. Check CSP violations (should be none after hardening)

**Automated E2E:**
```bash
npm run test:e2e
# Runs Playwright tests against production site (or preview)
```

---

## Site data freshness

The site is a static Astro build. Ledger data is read at build time. Cloudflare
Pages rebuilds on git push, and the watchdog also POSTs a Pages deploy hook:

- every 3 hours at minute 7 (`7 */3 * * *`)
- once after a new daily seal is detected (newest head newer than the last rebuild)

Hard cap: 10 rebuilds per UTC day.

### Monthly arithmetic (Pages Free)

Cloudflare Pages Free allows **500 builds per month** (account-wide). Source:
https://developers.cloudflare.com/pages/platform/limits/

| Source | Count |
| --- | ---: |
| Scheduled (8/day × 31) | 248 |
| Seal extras (~1/day × 31) | 31 |
| Hard cap (10/day × 31) | 310 |

310 is under the Free limit of 500.

The header chip "Last checked … UTC" is the newest observation timestamp from
the build data (the last poller check on the data branch), not the ledger tip
and not the visitor's clock. If that timestamp is more than 30 minutes old, a
quiet notice appears: "Data is from <time>. Our last update was delayed."

See `watchdog/README.md` for the required `STATE` KV binding, deploy hook, and
`DEPLOY_HOOK_URL`. Without the hook, rebuilds log `skipped=no_hook` and health
alerting still runs.

## Privacy

**What this site collects:** Nothing.

- No accounts
- No cookies
- No localStorage (future: optional for user's GitHub PAT)
- No analytics
- No tracking pixels
- No third-party scripts or fonts

**What GitHub sees:**

When you check a repository, your browser talks to GitHub's API directly (not through our server). GitHub receives:
- Your IP address
- The repository and action names you look up
- Your User-Agent

This is covered by [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

**What Cloudflare sees:**

Cloudflare Pages serves the site. Cloudflare processes your IP to deliver pages, under [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/). We do not run Cloudflare Analytics or keep visitor logs.

**The ledger:**

The public ledger stores facts about public repositories: repo names, tag names, commit hashes, tree hashes, and timestamps. It never stores personal data (no tagger names, no emails, no author names).

**Contact for data removal:**

If you believe the ledger contains personal data, contact [developwith.gt@gmail.com](mailto:developwith.gt@gmail.com).

See [/privacy](https://refledger.gautamkhosla.com/privacy) for full statement.

---

## Security

### Reporting vulnerabilities

If you find a security issue in Refledger (the crawler, the log, the verifier, this site, or related infrastructure), report it privately:

**Preferred:** [GitHub private vulnerability reporting](https://github.com/GautamTalksDev/refledger/security/advisories/new)

**Fallback:** Email the account owner (see [github.com/GautamTalksDev](https://github.com/GautamTalksDev) profile)

**Acknowledgment:** We aim to respond within 72 hours.

**Scope:** Refledger software and services. Out of scope: third-party repos we observe, GitHub itself, and issues about public tag movement we did not cause.

**Safe harbor:** Good-faith researchers who follow this process, avoid privacy violations, avoid data destruction, and give us reasonable time to respond are covered by our safe harbor statement (see [SECURITY.md](https://github.com/GautamTalksDev/refledger/blob/main/SECURITY.md)).

### When we detect a live attack

When Refledger observes high-severity tag movement that may indicate supply chain compromise, we:

1. Contact the repository maintainer via their published security contact
2. Contact GitHub Security
3. Wait 72 hours before publishing analysis or commentary
4. The raw log entry publishes automatically and immediately (append-only; no suppression)

We never name suspected attackers. We never assert that a repository is compromised. We state what moved, when we observed it, and what the content difference was.

Full policy: [SECURITY.md](https://github.com/GautamTalksDev/refledger/blob/main/SECURITY.md)

### Signing key protection

Daily heads are signed with Ed25519. The private seed lives only as a GitHub Environment secret (`REFLEDGER_SIGNING_KEY` on Environment `ledger`, main branch only). An offline age-encrypted backup is kept off the runner.

The public key is published for independent verification:
```
b3e7e795c35dee53731e039b76da930fc54e87e2edc632449a8a2e55252e276a
```

See [docs/PUBLIC-KEY.md](https://github.com/GautamTalksDev/refledger/blob/main/docs/PUBLIC-KEY.md).

### Check our work

- [Verify the ledger](/verify) in your browser or with the CLI
- Read every disclosed mistake on [Incidents](/incidents)
- See [/.well-known/security.txt](/.well-known/security.txt) for machine-readable contact info

---

## Security Headers

The site sends the following HTTP security headers (configured in `public/_headers`):

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; ...` | Prevent XSS, injection attacks |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Disable unnecessary APIs |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforce HTTPS |

**Current CSP status:** Allows `unsafe-inline` for styles and scripts (being removed; see [LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md) for hardening steps).

**Hardening in progress:**
- Remove inline scripts
- Add CSP nonces for necessary inline code
- Enable Trusted Types API
- Add DOMPurify for defense-in-depth

See [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) for full assessment.

---

## File Structure

```
refledger-site/
├── src/
│   ├── pages/              # Astro pages (routes)
│   │   ├── index.astro     # Home page
│   │   ├── check.astro     # Repository check
│   │   ├── verify.astro    # Ledger verification
│   │   ├── privacy.astro   # Privacy statement
│   │   ├── security.astro  # Security policy
│   │   └── how.astro       # How it works
│   ├── layouts/            # Page layouts
│   │   └── BaseLayout.astro
│   ├── components/         # Reusable components
│   ├── lib/                # TypeScript utilities
│   │   ├── github.ts       # GitHub API client
│   │   ├── ledger.ts       # Ledger parsing
│   │   └── format.ts       # Date/string formatting
│   ├── data/               # Build-time data loading
│   │   └── index.ts        # Clone ledger data from GitHub
│   └── styles/             # CSS
├── public/                 # Static assets (copied to dist/)
│   ├── _headers            # Cloudflare Pages headers
│   ├── robots.txt
│   └── favicon.svg
├── docs/                   # Documentation (not deployed)
│   ├── SECURITY-REVIEW.md  # OWASP assessment
│   ├── THREAT-MODEL.md     # Assets, boundaries, attackers
│   ├── RUNBOOK.md          # Incident response, token rotation
│   └── LAUNCH-CHECKLIST.md # Pre-launch tasks
├── .cache/                 # Build-time cloned repos (gitignored)
│   ├── refledger-main/     # GautamTalksDev/refledger main branch
│   └── refledger-data/     # GautamTalksDev/refledger data branch
├── dist/                   # Build output (gitignored)
├── astro.config.mjs        # Astro configuration
├── package.json
├── tsconfig.json
└── README.md               # This file
```

---

## Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `astro dev` | Start development server (hot reload) |
| `build` | `astro build` | Build static site to `dist/` |
| `preview` | `astro preview` | Preview production build locally |
| `check` | `astro check` | Type checking and Astro diagnostics |
| `check:copy` | Custom script | Scan for em/en dashes and `--` in prose |
| `check:size` | Custom script | Check bundle size against thresholds |
| `test:e2e` | `playwright test` | Run end-to-end tests with Playwright |
| `test` | Runs `check`, `build`, `check:copy`, `check:size`, `test:e2e` | Full test suite |

---

## Environment Variables

**None required for local development or deployment.** The site is fully static; all data fetched at build time from public repos (no secrets).

**Future:** If adding user GitHub PAT support for higher rate limits, store in browser localStorage (not server-side).

---

## Browser Support

- **Modern browsers:** Chrome, Firefox, Safari, Edge (latest 2 versions)
- **No IE11 support** (Astro outputs ES2020+, no polyfills)
- **Mobile:** iOS Safari 14+, Chrome Android 90+

**Accessibility:** WCAG 2.1 AA target (keyboard navigation, semantic HTML, ARIA labels).

---

## Contributing

Refledger is a solo project during the M1 freeze (2026-10-03 through 2026-10-10). Contributions welcome after the freeze lifts.

**Before submitting PRs:**
1. Ensure all tests pass (`npm test`)
2. No em/en dashes or `--` in prose (only in code fences)
3. Follow existing code style (Prettier/ESLint if configured)
4. Add E2E test if adding new page or feature

**Docs contributions welcome anytime** (even during freeze; docs-only PRs allowed).

---

## License

Code is Apache 2.0. See [LICENSE-APACHE](LICENSE-APACHE) in the ledger repo.

---

## Links

- **Production site:** [refledger.gautamkhosla.com](https://refledger.gautamkhosla.com)
- **Ledger repository:** [github.com/GautamTalksDev/refledger](https://github.com/GautamTalksDev/refledger)
- **Canary repository:** [github.com/GautamTalksDev/canary](https://github.com/GautamTalksDev/canary)
- **Security policy:** [SECURITY.md](https://github.com/GautamTalksDev/refledger/blob/main/SECURITY.md)
- **Operations policy:** [OPERATIONS.md](https://github.com/GautamTalksDev/refledger/blob/main/OPERATIONS.md)
- **Verification guide:** [docs/VERIFY.md](https://github.com/GautamTalksDev/refledger/blob/main/docs/VERIFY.md)

---

## Changelog

### 2 October 2026 - Pre-launch

Initial comprehensive README for site launch.

Next update: After 2026-10-10 seal and site goes live.
