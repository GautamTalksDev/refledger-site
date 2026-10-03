# Threat Model

Refledger's purpose is to witness tag movement in public GitHub Actions repositories. This document maps the assets, trust boundaries, threat actors, and mitigations.

---

## Assets

### 1. The ledger (criticality: HIGH)

The append-only log of observed tag movements, published on `GautamTalksDev/refledger` under `data/log/` after daily seal. The ledger's integrity is the entire point.

**Properties:**
- Append-only (entries never edited or deleted)
- Hash-chained (tampering breaks the chain)
- Signed daily (Ed25519 over ObservationDigest)
- Witnessed by Rekor (public third-party log)
- Reproducible from observations on `data` branch

**Threats if compromised:** False stability claims, hidden tag movements, suppressed attack detection, loss of public trust.

### 2. Signing key (criticality: CRITICAL)

Ed25519 private seed that signs daily heads. Loss or compromise ends the v1 chain (no rotation procedure).

**Location:**
- GitHub Environment secret `REFLEDGER_SIGNING_KEY` (Environment `ledger`, main branch only)
- Offline age-encrypted backup (two copies, never on runner)

**Threats if compromised:** Attacker signs false heads; forged ledger entries; rotation forces new log_id.

### 3. Observations (criticality: HIGH)

Raw poll results on the `data` branch under `observations/`. Signed ObservationDigests commit to file hashes, so tampering with observations breaks signature verification.

**Threats if compromised:** Observations rewritten to hide evidence of missed detections; ledger still verifiable but reproducibility lost.

### 4. GitHub personal access tokens (criticality: MEDIUM)

- `REFLEDGER_GITHUB_TOKEN`: fine-grained PAT, public-repo read only
- `DISPATCH_TOKEN`: fine-grained PAT, actions write on two repos

**Threats if compromised:** REFLEDGER_GITHUB_TOKEN leak allows impersonation (ETags survive across runs). DISPATCH_TOKEN leak allows unauthorized poll/canary dispatches (annoyance, not integrity loss).

### 5. Public site (refledger.gautamkhosla.com) (criticality: MEDIUM)

Static Astro site on Cloudflare Pages. No accounts, no server-side logic, no secrets.

**Threats if compromised:** XSS to steal visitor data (but no data collected); defacement; false claims about ledger status.

### 6. Clock Worker (criticality: MEDIUM)

Cloudflare Worker `refledger-clock` that dispatches poll/canary workflows.

**Threats if compromised:** Dispatch spam (rate limits apply); clock stops (backup Actions `schedule` continues); DISPATCH_TOKEN leak (see above).

### 7. Poller state (criticality: LOW)

ETag journal, object cache, pending publishes on `data` branch under `state/`. Corruption stops polling until manual recovery, but does not compromise past ledger entries.

**Threats if compromised:** Denial of service (poller stops); detection latency increases until recovery.

---

## Trust Boundaries

### Boundary 1: GitHub API

**Trust assumption:** GitHub serves correct responses for public repositories. A 200 with JSON is accurate. A 304 means nothing changed. A 403/429 is a real rate limit.

**Attacker model:** Nation-state or GitHub insider could serve false data. Mitigation: independent verification (anyone can run verifier against published ledger); Rekor witness (third-party confirmation of heads).

**Residual risk:** If GitHub and Rekor collude, false data could appear legitimate. This is the weakest link by design; Refledger cannot be more trustworthy than GitHub's API.

### Boundary 2: GitHub Actions runner

**Trust assumption:** The runner executing poll.yml is not backdoored. Environment secrets are not exfiltrated by malicious Actions.

**Attacker model:** Malicious GitHub Actions action, compromised runner image, or GitHub insider exfiltrates signing key.

**Mitigations:**
- Signing key only in Environment `ledger` (main branch only, not repository-level secret)
- Offline age-encrypted backup for key recovery
- poll.yml runs only on push to main (no pull_request trigger)
- No third-party actions with access to secrets (checkout, setup-node, etc. run before Environment)

**Residual risk:** A compromised official GitHub action (e.g., actions/checkout) could exfiltrate secrets. SHA-pinning actions reduces this risk.

### Boundary 3: Cloudflare Workers / Pages

**Trust assumption:** Cloudflare does not tamper with static site content or Worker secrets.

**Attacker model:** Cloudflare insider or attacker with Cloudflare account access alters site or steals DISPATCH_TOKEN.

**Mitigations:**
- Site is static; no server-side secrets or logic
- DISPATCH_TOKEN scoped to dispatch only (no repo write)
- Clock Worker has no public routes (404 for all fetch)
- Cloudflare account 2FA enabled

**Residual risk:** Cloudflare compromise could deface site or stop clock (backup Actions schedule continues polling).

### Boundary 4: Git history

**Trust assumption:** GitHub protects main branch from force push when branch protection is enabled.

**Attacker model:** Attacker with push access rewrites ledger history.

**Mitigations:**
- Branch protection (required PR reviews, no force push) being enabled before launch
- Ledger publish enforces fast-forward only in code
- Rekor witness prevents silent rewind (third-party sees old heads)

**Residual risk:** GitHub admin or compromised maintainer account with bypass privileges could force-push. Rekor witness would reveal the rewrite.

---

## Threat Actors

### Attacker 1: Malicious GitHub Actions maintainer

**Capability:** Push access to a watched action; can move tags, delete tags, rewrite history.

**Goal:** Hide evidence of supply chain attack (e.g., move 346 tags to backdoor, then rewind them after compromise discovered).

**Refledger mitigations:**
- Every tag movement recorded with observation window timestamp
- Deletions recorded (tombstones prevent "new" tag claim)
- Batch correlation detects many-tags-to-one-commit pattern
- Signed heads prevent post-hoc suppression

**Detection probability:** HIGH (batch moves trigger correlation; deletions recorded; recreation flagged).

**Evasion attempts:**
- Slow roll: move tags one at a time over days. **Counter:** still recorded, still content-change High if exact tags.
- Delete ledger repo: attacker cannot; they do not control GautamTalksDev. **Counter:** third-party verification, Rekor witness.
- Compromise Refledger signing key: see Attacker 2.

### Attacker 2: Compromised Refledger operator

**Capability:** Access to GitHub account GautamTalksDev; ability to push to refledger repo; access to signing key via GitHub Secrets.

**Goal:** Suppress detection of a preferred action's compromise; forge ledger entries; rewrite history.

**Refledger mitigations:**
- Rekor witness prevents silent rewind (third party sees old heads)
- Independent verifier (anyone can check hash chain)
- Public observations on `data` branch (reproducibility check)
- Offline key backup (recovery without operator if key lost)

**Detection probability:** MEDIUM to HIGH. Rewriting past entries breaks hash chain (caught by verifier). Suppressing future entries possible but visible as stale seal (watchdog alerts).

**Residual risk:** Operator with signing key can append false entries that pass signature check but do not match reality. **Counter:** reproducibility from observations; third-party observers can re-poll and compare.

### Attacker 3: GitHub API attacker (MITM or insider)

**Capability:** Serve false responses to Refledger's GitHub API requests.

**Goal:** Hide tag movement from Refledger; false stability claim.

**Refledger mitigations:**
- TLS for all API requests (MITM requires CA compromise)
- ETag-based conditional requests (GitHub must lie consistently across polls)
- Third-party verification (anyone can query GitHub and compare to ledger)

**Detection probability:** LOW if GitHub colludes. HIGH if MITM only (TLS pinning by OS).

**Residual risk:** Nation-state adversary with GitHub insider access could serve false data to Refledger specifically. No technical defense; social defense is third-party verification.

### Attacker 4: Cloudflare or DNS attacker

**Capability:** Serve false content at refledger.gautamkhosla.com; stop clock dispatches.

**Goal:** Deface site; claim ledger says something it does not; deny service.

**Refledger mitigations:**
- Site is static (no secrets to steal)
- Ledger lives on GitHub (site is read-only view)
- Clock failure falls back to Actions `schedule`
- DNSSEC (if zone supports) and CAA record prevent unauthorized cert issuance

**Detection probability:** HIGH (defacement obvious to visitors; stale site build time visible).

**Residual risk:** Cloudflare compromise could serve false claims about ledger status. Visitors must verify ledger independently via GitHub.

### Attacker 5: Supply chain attacker targeting Refledger dependencies

**Capability:** Compromise a Rust crate or npm package that Refledger depends on.

**Goal:** Backdoor Refledger; exfiltrate signing key; suppress detection.

**Refledger mitigations:**
- Cargo.lock and package-lock.json pinned (frozen during M1)
- Dependabot enabled (after freeze lifts)
- All crates from crates.io, all npm from npmjs.org (no private registries)
- Independent verifier shares no code with signer (backdoor must compromise both)

**Detection probability:** MEDIUM. Backdoor in signer only would produce divergent hash chain (caught by verifier). Backdoor in both more difficult.

**Residual risk:** Sophisticated attacker compromises both implementations. **Counter:** conformance vectors (both must reproduce same hashes).

---

## Threats and Mitigations

### Threat 1: Signing key loss

**Impact:** Cannot sign new daily heads; v1 ledger ends (no rotation procedure).

**Likelihood:** LOW (GitHub Secrets encrypted at rest; offline backup).

**Mitigations:**
- Age-encrypted offline backup (two copies, never on runner)
- Backup procedure documented in docs/KEY-BACKUP.md
- Recovery procedure in RUNBOOK.md

**Residual risk:** Both backups lost and GitHub Secrets deleted. **Impact:** v2 with new key required; continuity broken.

### Threat 2: Signing key compromise

**Impact:** Attacker signs false heads; forged ledger entries appear legitimate.

**Likelihood:** LOW (Environment secret, main only; no exposure in logs).

**Mitigations:**
- Signing key only in Environment `ledger` (not repository-level secret)
- Never logged or echoed in Actions output
- Rust Zeroize for in-memory key material
- Offline backup under age encryption (requires operator passphrase)

**Detection:** Divergence between signed heads and reality (third-party re-polling). Rekor witness shows suspicious rewind.

**Response:** Revoke key, publish incident disclosure, start v2 with new key. See RUNBOOK.md.

### Threat 3: GitHub API outage or rate limit exhaustion

**Impact:** Polling stops; detection latency increases; gaps in coverage.

**Likelihood:** MEDIUM (GitHub incidents happen; rate limits documented).

**Mitigations:**
- Every failed poll recorded as Failed observation
- Exponential backoff on 429/403
- Secondary points governor (300/minute cap, one third of GitHub's limit)
- Scheduler lag recorded (scheduled vs actual start times)
- Backup schedule in workflow (if clock fails)

**Detection:** SchedulerLag and Failed observations in ledger; watchdog alerts on stale seal.

**Response:** Wait for GitHub recovery; backlog replays on next successful poll.

### Threat 4: Token expiry

**Impact:** REFLEDGER_GITHUB_TOKEN expires; polling fails until renewed. DISPATCH_TOKEN expires; clock cannot dispatch (backup schedule continues).

**Likelihood:** HIGH (fine-grained PATs expire in 1 year max).

**Mitigations:**
- Expiry dates tracked in RUNBOOK.md
- Watchdog will check token expiry and alert (being created)
- Rotation procedure in RUNBOOK.md

**Detection:** GitHub returns 401; logged as Failed observation.

**Response:** Mint replacement PAT with same scope, update secret, resume polling. See RUNBOOK.md for step-by-step.

### Threat 5: GitHub account compromise (GautamTalksDev)

**Impact:** Attacker pushes to refledger repo; could force-push main (if branch protection not enabled); could exfiltrate secrets; could delete repo.

**Likelihood:** LOW (2FA enabled, passkey preferred).

**Mitigations:**
- GitHub account 2FA enabled
- Branch protection (required PR reviews, no force push) being enabled before launch
- Signing key in Environment (not repository-level; harder to exfiltrate)
- Rekor witness prevents silent history rewrite

**Detection:** Forced push visible in git reflog; Rekor witness shows old heads.

**Response:** Revoke compromised credentials, audit ledger for false entries, publish incident disclosure. See RUNBOOK.md.

### Threat 6: Malicious workflow file in refledger repo

**Impact:** Attacker with push access adds workflow that exfiltrates secrets.

**Likelihood:** LOW (single-maintainer repo; PR reviews required after branch protection).

**Mitigations:**
- poll.yml runs only on push to main (no pull_request trigger)
- Signing key only in Environment `ledger` (restricted to main)
- Branch protection requires PR reviews (being enabled)
- No third-party actions with secret access

**Detection:** New workflow appears in `.github/workflows/`; PR review catches it.

**Response:** Delete malicious workflow, rotate exposed secrets, audit ledger.

### Threat 7: XSS on public site

**Impact:** Attacker injects script into site; steals visitor data (but no data collected); defacement; false claims.

**Likelihood:** MEDIUM (inline scripts still present; CSP being hardened).

**Mitigations:**
- Astro auto-escapes all content
- CSP being hardened (removing `unsafe-inline`, adding Trusted Types)
- No user-generated content rendered
- No cookies, localStorage, or sensitive data to steal

**Detection:** Defacement visible to visitors; CSP violation reports (once CSP hardened).

**Response:** Remove malicious content, harden CSP, publish incident disclosure.

### Threat 8: Denial of service (polling stopped)

**Impact:** Detection latency increases; gaps in coverage; stale seal.

**Likelihood:** MEDIUM (GitHub outages, token expiry, misconfiguration).

**Mitigations:**
- Every gap recorded (Failed, Skipped, SchedulerLag observations)
- Watchdog alerts on stale seal (being created)
- Backup Actions `schedule` if clock fails

**Detection:** Stale seal visible on site; watchdog alerts; users can check heads.jsonl timestamp.

**Response:** Investigate root cause (logs, GitHub status); fix (token rotation, config correction); resume polling. See RUNBOOK.md.

### Threat 9: False stability claim (missed tag movement)

**Impact:** Ledger claims a tag was stable when it actually moved; detection failure.

**Likelihood:** LOW (every poll recorded; 304 means GitHub says unchanged).

**Mitigations:**
- ETag-based conditional requests (GitHub must lie consistently)
- Third-party verification (anyone can re-poll GitHub and compare)
- Canary repo (deliberate tag moves for detection measurement)
- Published detection latency (docs/DETECTION.md)

**Detection:** Canary reveals missed movement; third-party observer notices discrepancy.

**Response:** Append correction entry to ledger; investigate cause (GitHub API issue? Bug?); publish incident disclosure.

### Threat 10: Batch correlation suppression

**Impact:** Attacker moves many tags but Refledger fails to correlate them; severity downgraded.

**Likelihood:** LOW (correlation logic frozen; conformance vectors test it).

**Mitigations:**
- Correlation logic pure (reproducible from observations)
- Conformance vectors for correlation (both implementations must match)
- Independent verifier checks member_seqs and timing

**Detection:** Third-party reproduces ledger from observations; finds missing correlation.

**Response:** Append correction entry; investigate classifier bug; publish incident disclosure.

---

## Attack Scenarios

### Scenario 1: tj-actions style batch attack

**Attacker:** Malicious GitHub Actions maintainer with push access to `some-org/some-action`.

**Attack:**
1. Compromise account (phishing, token theft, insider)
2. Force-push 346 existing exact-version tags to one malicious commit
3. Workflows using those tags execute backdoor (secrets printed to logs)
4. Attacker collects secrets from build logs
5. (Optionally) rewind tags to hide evidence

**Refledger response:**
1. Next poll (within 5 minutes) sees tags moved
2. Each Move classified as High severity (exact tag, content change)
3. Batch correlation emitted (346 tags to same commit in 5 minute window)
4. Correlation logged as separate entry pointing at Moves
5. If tags rewound, second batch of Moves recorded
6. Signed daily head locks observations

**Detection time:** 5 minutes (best case: move happens just before poll). 10 minutes worst case (move happens just after poll).

**Visibility:** Immediate (observations on `data` branch). Signed within 24 hours (daily seal).

**Attacker evasion:** Cannot suppress entries (append-only). Cannot rewrite history (hash chain + Rekor). Cannot delete ledger (third-party repo).

### Scenario 2: Slow-roll tag poisoning

**Attacker:** Malicious maintainer tries to evade batch correlation.

**Attack:**
1. Move exact tags one per day (below correlation threshold)
2. Each to different commit (avoid same-target pattern)
3. Spread over weeks

**Refledger response:**
1. Each Move still recorded as High severity (exact tag, content change)
2. No batch correlation (not ≥3 refs in 30 minute window)
3. Signed daily heads lock each day's observations

**Detection time:** Immediate per tag (within 5 minutes of each move).

**Visibility:** Each Move visible individually. Third-party analysts can aggregate and notice pattern.

**Attacker evasion defeated:** Cannot hide individual High-severity Moves. Slow roll reduces automation (good for defenders: more time to notice).

### Scenario 3: Refledger operator compromise

**Attacker:** Compromised GautamTalksDev account or insider.

**Attack:**
1. Exfiltrate signing key from GitHub Secrets
2. Append false entries to ledger (claim tags stable when moved)
3. Sign daily heads as usual
4. Hope no one re-polls GitHub to verify

**Refledger response:**
1. False entries pass signature check (attacker has key)
2. Independent observers re-poll GitHub; see discrepancy
3. Observations on `data` branch do not match false entries (if attacker also tampers, reproducibility lost)
4. Rekor witness unchanged (old heads still there; rewind visible)

**Detection time:** Depends on third-party verification. Watchdog does not catch this (it checks signature, which is valid).

**Visibility:** Discrepancy between ledger and GitHub API.

**Response:** Incident disclosure; revoke key; audit ledger; start v2 with new key.

---

## Monitoring and Detection

### Active monitoring (being deployed)

1. **Watchdog Worker** (separate Cloudflare Worker):
   - Checks heads.jsonl every hour
   - Alerts if latest head >25 hours old (stale seal)
   - Alerts if PAT expiry within 30 days
   - Alerts if Rekor witness backlog >48 hours

2. **Canary validation**:
   - GautamTalksDev/canary moves tags on schedule
   - Join canary's ledger against Refledger chain
   - Measure detection latency (published in docs/DETECTION.md)

3. **Third-party verification**:
   - Anyone can run the independent verifier in strict mode
   - Anyone can re-poll GitHub and compare to ledger
   - Discrepancy is detectable by external observers

### Passive detection

1. **Hash chain breaks**: verifier catches tampering
2. **Rekor witness mismatch**: old heads visible on Sigstore
3. **Reproducibility failure**: ledger cannot be regenerated from observations
4. **CSP violations**: once hardened, violations logged to Cloudflare
5. **Git reflog**: force-push visible in reflog (Rekor also catches)

---

## Incident Response Overview

See RUNBOOK.md for detailed procedures.

**On signing key compromise:**
1. Revoke key immediately (rotate if possible, or burn and start v2)
2. Audit ledger for false entries (compare to GitHub API)
3. Publish incident disclosure within 72 hours
4. Notify Rekor (if false heads submitted)

**On GitHub account compromise:**
1. Secure account (revoke sessions, reset 2FA)
2. Audit workflows and secrets
3. Check git reflog for unauthorized pushes
4. Rotate all PATs
5. Publish incident disclosure

**On stale seal (watchdog alert):**
1. Check GitHub Actions logs (poll.yml failures?)
2. Check GitHub status (API outage?)
3. Check PAT expiry (rotate if expired)
4. Manual dispatch if needed (`workflow_dispatch`)
5. Publish status update if >48 hours stale

**On detection failure (canary miss):**
1. Re-run canary pattern
2. Check observations (was poll successful but classification failed?)
3. Investigate classifier bug
4. Append correction entry if needed
5. Publish incident disclosure

---

## Review and Updates

This threat model is a living document. Update when:
- New threat actors identified
- New attack vectors discovered
- Mitigations added or changed
- Post-incident lessons learned

Last updated: 2 October 2026 (pre-launch)

Next review: After first incident or after 2026-10-10 seal (whichever first).
