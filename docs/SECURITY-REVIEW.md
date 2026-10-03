# Security Review

Comprehensive security assessment of Refledger against industry standards: OWASP ASVS 5.0 Level 2, OWASP Top 10:2025, and OWASP CI/CD Top 10.

**Status:** Hardened pre-launch review (site controls landed; deploy and a few ops items remain with the operator).

**Scope:** Entire Refledger system including site (refledger.gautamkhosla.com), poller (Actions), clock (Cloudflare Worker), ledger code (frozen on main), and public repositories (GautamTalksDev/refledger, GautamTalksDev/canary).

---

## OWASP ASVS 5.0 Level 2

### V1: Architecture, Design and Threat Modelling

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V1.1.1: Components documented | Yes | ✅ Met | docs/HOW-IT-WORKS.md, docs/DEPLOYMENT.md, site README.md |
| V1.1.2: Security controls documented | Yes | ✅ Met | SECURITY.md, OPERATIONS.md, this document |
| V1.4.1: Trusted components identified | Yes | ✅ Met | See THREAT-MODEL.md (trust boundaries) |
| V1.4.2: Business criticality assessed | Yes | ✅ Met | KILL-TEST.md defines shutdown threshold |
| V1.11.1: Documentation describes business logic | Yes | ✅ Met | docs/HOW-IT-WORKS.md, docs/LOG-FORMAT.md |
| V1.14.1: Sensitive data minimization | Yes | ✅ Met | No PII collected (privacy.astro); ledger stores public repo facts only |

**Note:** ASVS V1.2-V1.9 largely apply to traditional auth/session apps; Refledger has no accounts, sessions, or multi-tenancy. Relevant elements (input validation, cryptographic storage, logging) are covered in their respective chapters below.

### V3: Session Management

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| (All session requirements) | No | N/A | No user accounts, no sessions, no cookies |

**Justification:** Site is a static frontend. Checks run in the browser, no server-side state per user.

### V4: Access Control

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V4.1.1: Enforce access controls on server | Partial | ✅ Met | GitHub PAT scoped to public-repo read; signing key only in Environment `ledger` |
| V4.1.3: Principle of least privilege | Yes | ✅ Met | REFLEDGER_GITHUB_TOKEN = read-only PAT; GITHUB_TOKEN = write to contents only; DISPATCH_TOKEN = actions write on two repos only |
| V4.1.5: Access controls fail securely | Yes | ✅ Met | Poller refuses to start with bad contact URL; verifier fails closed on unknown key_id |
| V4.3.1: Admin functionality protected | Yes | ✅ Met | Signing key only accessible via Environment `ledger` on main branch |

### V5: Validation, Sanitization and Encoding

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V5.1.1: Input validation strategy | Yes | ✅ Met | GitHub API responses validated per OpenAPI schema expectations; check UI input parsed with Zod |
| V5.1.3: Validate data types | Yes | ✅ Met | Rust serde deserialization enforces types; TypeScript type guards on frontend |
| V5.1.4: Structured data validation | Yes | ✅ Met | JSON responses validated; ETag format checked; commit SHA format enforced |
| V5.2.1: Sanitize all untrusted HTML | Yes | ✅ Met | Astro auto-escapes by default; dynamic HTML sinks go through `setHTML` in `src/lib/trusted-html.ts` (Trusted Types policy `refledger`). Callers build escaped or static templates; no DOMPurify dependency |
| V5.2.3: Context-aware output encoding | Yes | ✅ Met | Astro escapes by default; no `dangerouslySetInnerHTML` |
| V5.3.1: XSS protection | Yes | ✅ Met | CSP without `unsafe-inline`; `style-src 'self'` only; `require-trusted-types-for 'script'` + `trusted-types refledger`. Evidence: `public/_headers`, `src/styles/utilities.css`, `src/styles/base.css`, `tests/e2e/csp.spec.ts` |

**Current CSP:** `script-src 'self'`; `style-src 'self'`; Trusted Types enforced for script sinks. Inline styles moved to utility/base CSS classes.

**Client limits:** Hostile paste and GitHub fetch bounded in `src/lib/limits.ts` and enforced in `src/lib/check-workflow.ts` (`MAX_WORKFLOW_FILE_BYTES` 512KiB, `MAX_WORKFLOW_FILES` 100, `MAX_WORKFLOW_LINES` 20000, `MAX_UNIQUE_REFS` 200, `FETCH_TIMEOUT_MS` 12000 with AbortController). Evidence: `tests/hostile-input.test.ts`, `tests/e2e/hostile.spec.ts`.

**Safe links:** `src/lib/safe-link.ts`; `assess()` uses `actionHistoryHref`; external anchors use `rel="noopener noreferrer"`.

### V6: Cryptography

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V6.2.1: Use up-to-date crypto libraries | Yes | ✅ Met | ed25519-dalek 2.x; ring for SHA-256; age for key backup |
| V6.2.2: Authenticated encryption | Partial | ✅ Met | age symmetric encryption for key backup; signing not encryption |
| V6.2.5: Use proper random generation | Yes | ✅ Met | OsRng for Ed25519 keygen |
| V6.2.6: Verify signature/MAC before decryption | Yes | ✅ Met | Verifier checks Ed25519 signature before trusting head |
| V6.3.1: Random values unpredictable | Yes | ✅ Met | Ed25519 seed from OsRng |
| V6.3.2: Approved random function | Yes | ✅ Met | OsRng (getrandom syscall) |

**Key management:** Offline age-encrypted backup per docs/KEY-BACKUP.md; no key rotation procedure yet (noted in LOG-FORMAT.md §4.2).

### V7: Error Handling and Logging

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V7.1.1: No sensitive data in logs | Yes | ✅ Met | Tokens never logged; errors sanitized before GitHub Actions logs |
| V7.1.2: Log format secure | Yes | ✅ Met | Structured JSON; no shell interpolation |
| V7.1.3: Logs protected by access controls | Yes | ✅ Met | Actions logs viewable by repo collaborators only |
| V7.2.1: Consistent error messages | Yes | ✅ Met | GitHub API errors recorded as Failed observations (no sensitive detail leaked to public log) |
| V7.3.1: Protect debug logs | Yes | ✅ Met | No debug mode in production; Rust release builds omit debug symbols |

### V8: Data Protection

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V8.1.1: Protect sensitive data at rest | Yes | ✅ Met | Signing key encrypted at rest by GitHub Secrets; age-encrypted offline backup |
| V8.1.2: No sensitive data in client storage | Yes | ✅ Met | No localStorage, no cookies, no sessionStorage |
| V8.1.3: Clear sensitive data from memory | Partial | ✅ Met | Rust Zeroize for key material |
| V8.2.1: Recent data classification | Yes | ✅ Met | Ledger = public facts; signing key = secret; PATs = confidential |
| V8.3.1: Sensitive data not in logs | Yes | ✅ Met | Repeat of V7.1.1; confirmed |
| V8.3.4: Sensitive data not in GET | Yes | ✅ Met | Repo name in `/check?repo=` disclosed on `/privacy`; no secrets in URLs |

### V9: Communication

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V9.1.1: TLS on all connections | Yes | ✅ Met | Cloudflare Pages enforces HTTPS; GitHub API over HTTPS only |
| V9.1.2: Recent TLS version | Yes | ✅ Met | Cloudflare minimum TLS 1.2 (configurable to 1.3 only) |
| V9.1.3: Latest TLS cipher suites | Yes | ✅ Met | Cloudflare managed TLS |
| V9.2.1: Crypto standards followed | Yes | ✅ Met | Ed25519 per RFC 8032; SHA-256 per FIPS 180-4 |

### V13: Configuration

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V13.1.1: Harden server components | Yes | ✅ Met | Cloudflare Pages managed; GitHub Actions runner managed |
| V13.1.3: Unnecessary features disabled | Yes | ✅ Met | Clock Worker returns 404 on all HTTP; no public API |
| V13.2.1: Components up to date | Yes | 🔶 Ongoing | Dependabot enabled; **Gap:** ledger lockfiles frozen until 2026-10-10 seal (documented in FREEZE.md). Site: npm audit clean in CI, lockfile, exact versions |
| V13.4.1: HTTP security headers | Yes | ✅ Met | Cloudflare Pages `_headers`: CSP (no `unsafe-inline`), Trusted Types, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy |

**Current headers status:**
- ✅ X-Content-Type-Options: nosniff
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ Strict-Transport-Security (preload)
- ✅ CSP: `script-src 'self'`; `style-src 'self'`; `require-trusted-types-for 'script'`; `trusted-types refledger`
- ✅ Permissions-Policy: accelerometer, camera, geolocation, gyroscope, magnetometer, microphone, payment, usb disabled
- ✅ Cross-Origin-Opener-Policy: same-origin

**Note:** Frame denial is enforced via CSP `frame-ancestors 'none'` (no separate `X-Frame-Options` header in `_headers`).

### V14: API and Web Service

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V14.1.1: Same security for all components | Yes | ✅ Met | All HTTP surfaces over HTTPS |
| V14.1.2: External URL from trusted config | Yes | ✅ Met | GitHub endpoints hardcoded; no user-controlled API base |
| V14.4.1: Rate limiting | Partial | ✅ Met | Poller self-limits to 300 requests/run, 300 secondary points/minute; client-side checks not rate-limited (user pays their own GitHub quota); browser fetches use AbortController timeouts |
| V14.4.2: Throttling for high request rates | Yes | ✅ Met | Exponential backoff on 429/403 |
| V14.5.1: No sensitive data in HTTP responses | Yes | ✅ Met | Public data only |

### V15: Business Logic and Secure Coding

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V15.1.1: Same user not sequential steps | Partial | N/A | No multi-step workflows requiring multiple parties |
| V15.3.1: Reproducible builds encouraged | Yes | ✅ Met | `cargo build --locked`; verifier independent of signer |

### V16: File and Resources

| Requirement | Applies | Status | Evidence |
|---|---|---|---|
| V16.1.1: Validate uploaded files | Partial | N/A | No file uploads; workflow file pasted into browser (never sent to server, parsed client-side) with size/line/ref limits |
| V16.1.2: Untrusted data not executed | Yes | ✅ Met | `action.yml` fetched but parsed only, never executed |

---

## OWASP Top 10:2025

### A01:2025 Broken Access Control

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Unauthenticated access to sensitive functions | Partial | ✅ Met | Signing key behind Environment protection (main branch only) |
| Insecure direct object references | Yes | ✅ Met | Ledger references public commits; no secret IDs |
| Missing function-level access control | Partial | ✅ Met | Clock Worker has no public routes; PATs scoped |

### A02:2025 Cryptographic Failures

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Weak crypto | No | ✅ Met | Ed25519, SHA-256 (no MD5, SHA-1, or weak ciphers) |
| Hardcoded secrets | No | ✅ Met | Secrets in GitHub Secrets / Cloudflare Worker secrets; never committed |
| Insufficient entropy | No | ✅ Met | OsRng for keygen |

### A03:2025 Injection

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| SQL injection | No | N/A | No SQL database |
| OS command injection | Partial | ✅ Met | Git commands via safe wrappers (libgit2 via git2 crate); no shell interpolation of user input |
| XSS | Yes | ✅ Met | Astro auto-escapes; CSP without `unsafe-inline`; Trusted Types via `src/lib/trusted-html.ts` (`setHTML` used by check-app, how-app, verify.astro); safe link builder |

### A04:2025 Insecure Design

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Missing threat model | No | ✅ Met | See THREAT-MODEL.md |
| Insufficient attack surface analysis | No | ✅ Met | OPERATIONS.md published before first request; SECURITY.md pre-committed |

### A05:2025 Security Misconfiguration

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Missing security headers | Partial | ✅ Met | `_headers` hardened (CSP, Trusted Types, HSTS, Permissions-Policy, COOP) |
| Default credentials | No | N/A | No credentials shipped with code |
| Verbose error messages | No | ✅ Met | GitHub API errors sanitized before public log; no stack traces in production |
| Unpatched systems | Partial | 🔶 Ledger frozen | Dependabot on; **Gap:** ledger lockfiles frozen until seal (documented exception). Site CI runs `npm audit` |

**Frozen lockfiles (ledger):** Intentional per FREEZE.md; not a gap discovered under pressure. Security updates resume 2026-10-10. Cannot change poller/clock/workflows in refledger until that date.

### A06:2025 Vulnerable and Outdated Components

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Unmaintained dependencies | Partial | 🔶 Ledger frozen | Dependabot enabled; ledger frozen until seal. Site: exact versions + lockfile; npm audit clean |
| Unknown component inventory | No | ✅ Met | Cargo.lock and package-lock.json committed; CycloneDX SBOM workflow `.github/workflows/sbom.yml` |

### A07:2025 Identification and Authentication Failures

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Brute force | No | N/A | No user authentication |
| Weak passwords | No | N/A | No passwords |
| Session fixation | No | N/A | No sessions |

### A08:2025 Software and Data Integrity Failures

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Unsigned updates | Partial | ✅ Met | Daily heads signed with Ed25519; Rekor witness |
| CI/CD without integrity verification | Yes | ✅ Met | Actions pinned by SHA; `check:pins` covers all orgs; npm audit step in `.github/workflows/ci.yml` |
| Insecure deserialization | Partial | ✅ Met | serde strict mode; no pickle/marshal; JSON only |

### A09:2025 Security Logging and Monitoring Failures

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Unlogged security events | No | ✅ Met | Every poll recorded (ok, failed, skipped); gaps never silent |
| Log tampering | Partial | ✅ Met | Ledger append-only and hash-chained; git history protects against silent rewrites |
| No alerting | Partial | 🔶 Code ready, not deployed | Watchdog Worker source exists at `watchdog/`; **Gap:** operator must create token and run `wrangler deploy` |

**Watchdog:** Cloudflare Worker under `watchdog/` checks data-branch freshness, signed head age, and Rekor witness backlog; opens/closes a GitHub issue. Not live until deployed.

### A10:2025 Server-Side Request Forgery (SSRF)

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| User-controlled URLs | Partial | ✅ Met | GitHub API base hardcoded; `owner/repo` validated with regex; no arbitrary URL fetching; `safe-link.ts` rejects hostile keys |

---

## OWASP CI/CD Top 10

### CICD-SEC-1: Insufficient Flow Control Mechanisms

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Unprotected branches | Yes | 🔶 Partial | Rulesets active on GautamTalksDev/refledger (`main` + `data`) and GautamTalksDev/canary (`main`). **Gap:** refledger-site rulesets/branch protection blocked (private repo needs GitHub Pro or public visibility) |
| Missing PR reviews | Yes | 🔶 Partial | Same as above for refledger-site; ledger/canary rulesets enforce review/flow controls |

### CICD-SEC-2: Inadequate Identity and Access Management

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Overprivileged tokens | No | ✅ Met | REFLEDGER_GITHUB_TOKEN = read public repos only; DISPATCH_TOKEN = actions write on two repos; GITHUB_TOKEN = default Actions scope |
| Long-lived credentials | Partial | 🔶 Ongoing | PATs expire in 1 year max; rotation procedure in RUNBOOK.md; **Gap:** no automated expiry alerting until watchdog is deployed |

### CICD-SEC-3: Dependency Chain Abuse

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Unpinned dependencies | Partial | ✅ Met | Cargo.lock/package-lock.json pinned; workflow actions SHA-pinned; `check:pins` in CI |
| Typosquatting | Partial | ✅ Met | All crates from crates.io; npm from npmjs.org; no private registries |
| Supply chain attacks | Partial | 🔶 Partial | Scorecard workflow `.github/workflows/scorecard.yml` and CodeQL `.github/workflows/codeql.yml` present; **Gap:** alerts need public repo or GitHub Advanced Security. SBOM via `.github/workflows/sbom.yml` |

### CICD-SEC-4: Poisoned Pipeline Execution (PPE)

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Untrusted PR workflows | Yes | ✅ Met | `poll.yml` runs on `main` only (no `pull_request` trigger); signing key only on main via Environment |
| User-controlled build commands | No | N/A | No custom build scripts from external input |

### CICD-SEC-5: Insufficient PBAC (Pipeline-Based Access Controls)

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Workflow writes to main | Yes | ✅ Met | Environment `ledger` restricts signing key to main; push to main after seal (fast-forward only enforced in code) |
| Cross-repo trust | Partial | ✅ Met | DISPATCH_TOKEN scoped to exactly two repos (refledger + canary) |

### CICD-SEC-6: Insufficient Credential Hygiene

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Secrets in logs | No | ✅ Met | GitHub Actions auto-redacts secrets; code never logs tokens |
| Secrets in source | No | ✅ Met | Pre-commit checks (rg for placeholder patterns); never committed |
| Secret sprawl | No | ✅ Met | Four tokens total; all documented in DEPLOYMENT.md |

### CICD-SEC-7: Insecure System Configuration

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Public Actions logs | Partial | ✅ Met | Public logs contain only sanitized errors; no secrets |
| Unencrypted artifacts | Partial | N/A | No artifacts uploaded to Actions; observations pushed to public `data` branch (intentionally public) |

### CICD-SEC-8: Ungoverned Usage of 3rd Party Services

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Untrusted Actions | Partial | ✅ Met | Actions SHA-pinned across orgs; `check:pins` enforces |
| External integrations | Partial | ✅ Met | Only GitHub API and Rekor; both over HTTPS with cert pinning by OS |

### CICD-SEC-9: Improper Artifact Integrity Validation

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Unsigned artifacts | Partial | ✅ Met | Daily heads signed; Rekor witness; no unsigned deployments after seal |
| No provenance | Partial | 🔶 Partial | **Gap:** no SLSA provenance yet (future enhancement) |

### CICD-SEC-10: Insufficient Logging and Visibility

| Risk | Applies | Status | Mitigation |
|---|---|---|---|
| Unmonitored pipelines | Partial | 🔶 Code ready, not deployed | Actions logs public; watchdog source at `watchdog/` awaiting deploy |
| No audit trail | No | ✅ Met | Every poll recorded; git history immutable |

---

## Known Gaps Summary

### Ledger code freeze gaps (cannot fix until 2026-10-10 seal)

These are documented, accepted limitations during the M1 measurement window:

1. **Lockfiles frozen:** Cargo.lock and package-lock.json frozen; no dependency updates until seal lifts.
2. **Cannot change poller/clock/workflows** in refledger until 2026-10-10.
3. **No key rotation:** Ed25519 key rotation unspecified in v1; must be designed before first rotation.
4. **Conformance vectors incomplete:** Some edge cases not yet vectorized.

### Operator / deploy gaps (site code hardened; launch still open)

1. **Watchdog not deployed:** Code exists at `watchdog/`; operator must create a fine-grained GitHub token and run wrangler deploy.
2. **Site not public / no Pages deploy yet:** Operator action.
3. **`[PRIVACY CONTACT]` placeholder:** Still present on `/privacy` (and asserted in `tests/e2e/csp.spec.ts` until filled).
4. **refledger-site branch protection blocked:** Private repo needs GitHub Pro or public visibility. Rulesets already active on GautamTalksDev/refledger and GautamTalksDev/canary.
5. **CodeQL / Scorecard alerts:** Workflows exist; alert visibility needs public repo or GitHub Advanced Security.
6. **Typecheck noise:** Some pre-existing TypeScript strictness noise; CI uses Vitest, not `tsc`.

### Not shipped (in development; do not claim)

1. **Relock guard**
2. **MCP server**
3. **tlog-tiles RFC**

### Site hardening completed (evidence)

1. **CSP without `unsafe-inline`:** `style-src 'self'` only; inline styles moved to `src/styles/utilities.css` + `src/styles/base.css`. Evidence: `public/_headers`, `tests/e2e/csp.spec.ts`.
2. **Trusted Types:** `require-trusted-types-for 'script'` + `trusted-types refledger`; `setHTML` in `src/lib/trusted-html.ts` used by check-app, how-app, verify.astro.
3. **Limits + AbortController:** `src/lib/limits.ts`, `src/lib/check-workflow.ts`; hostile tests as above.
4. **Safe links:** `src/lib/safe-link.ts`; `rel="noopener noreferrer"` on external anchors.
5. **No localStorage** (still true); `/check?repo=` disclosed on `/privacy`.
6. **Supply chain:** npm audit clean; lockfile; exact versions; CycloneDX SBOM (`.github/workflows/sbom.yml`); Scorecard; CodeQL; actions pinned (`check:pins`); npm audit step in `ci.yml`.

### Evidence files

- **Threat model:** THREAT-MODEL.md (trust boundaries, attackers, mitigations)
- **Runbook:** RUNBOOK.md (incident response, token rotation, key recovery)
- **Operations policy:** OPERATIONS.md (pre-published crawler policy)
- **Security policy:** SECURITY.md (disclosure process)
- **Privacy:** privacy.astro (no collection statement; `/check?repo=` disclosure)
- **Verification:** VERIFY.md (independent verifier instructions)
- **Headers / CSP:** `public/_headers`, `tests/e2e/csp.spec.ts`
- **Trusted HTML:** `src/lib/trusted-html.ts`
- **Limits / hostile input:** `src/lib/limits.ts`, `tests/hostile-input.test.ts`, `tests/e2e/hostile.spec.ts`
- **Watchdog (undeployed):** `watchdog/`

---

## Review date

2 October 2026 (hardened pre-launch)

Next review: After 2026-10-10 seal (when ledger freeze lifts), and again after Pages deploy + watchdog go-live.
