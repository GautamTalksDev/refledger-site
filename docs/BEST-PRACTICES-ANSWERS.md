# OpenSSF Best Practices badge, passing level

Prepared 2026-10-03 for the **refledger-site** repository. You submit the form. These answers are the evidence, not a claim that the badge is already awarded.

Form: https://www.bestpractices.dev/en/projects

Suggested form header:

- Project name: Refledger Site
- Project URL: https://github.com/GautamTalksDev/refledger-site
- Repository URL: https://github.com/GautamTalksDev/refledger-site
- Implementation languages: TypeScript, JavaScript

The public site at https://refledger.gautamkhosla.com is the same project. Use it as the project URL once that page is the one you want the badge to point at. Both URLs are HTTPS.

Passing requires every MUST below to be Met or N/A. SHOULD and SUGGESTED do not block the passing badge. They are included so the form is complete.

## Read this before you submit

One MUST is Unmet, so the passing badge is not earnable yet:

- **warnings_fixed (MUST): Unmet.** The TypeScript compiler in check-only mode reports 27 errors under the strict config (2026-10-03), including `src/lib/hash.ts`, `src/lib/verify.ts`, `src/lib/pin-workflow.ts`, and `src/data/index.ts`. CI does not run that check. The strict config is on, and the errors are not addressed.

Two criteria are about you, not about a file. They are marked Met only if you are willing to say so on the form:

- **know_secure_design** and **know_common_errors**. The evidence is that you wrote `docs/SECURITY-REVIEW.md`. If that overclaims your background, change both to Unmet. Unmet on either one also blocks the passing badge.

One MUST stays Met only for a limited time:

- **vulnerabilities_fixed_60_days.** GHSA-ch52-4w7c-c8xp (`http-cache-semantics` through 4.2.0) has been public since 2026-09-18. Day 60 is 2026-11-17. There is still no patched release. On that date, if the advisory is still unpatched in this repo, change this answer to Unmet.

Genuinely Unmet, and not required for the passing badge:

- **version_tags** (SUGGESTED). No git release tags.
- **test_most** (SUGGESTED). No coverage report shows that most branches are tested.

## Basics

### description_good (MUST)

**Met.** The README's opening paragraphs say what the site does: a public site for a signed log of GitHub Actions tag movements.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### interact (MUST)

**Met.** The README says how to clone and run the site, how to report security issues, and how to contribute.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### contribution (MUST)

**Met.** Contributions are pull requests. The Contributing section says tests must pass, copy rules apply, and a new page needs an end-to-end test. During the ledger freeze, docs-only changes are the ones that can land.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### contribution_requirements (SHOULD)

**Met.** The same Contributing section is the requirement list: `npm test`, no em or en dashes in prose, match the existing style, add an end-to-end test for a new page.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### floss_license (MUST)

**Met.** Site code is Apache-2.0. Ledger data, which this site displays, is CC0-1.0 and lives in the ledger repository.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/LICENSE

### floss_license_osi (SUGGESTED)

**Met.** Apache-2.0 is OSI-approved. CC0 applies to ledger data, not to the software produced by this repository.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/LICENSE

### license_location (MUST)

**Met.** `LICENSE` is at the root of the repository. `package.json` has `"license": "Apache-2.0"`.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/LICENSE

### documentation_basics (MUST)

**Met.** The README covers what the software does, how to install it, and how to build it.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### documentation_interface (MUST)

**Met.** The README HTTP API section lists each `/api/v1/` path and what it returns. JSON Schemas for those documents are in `public/api/v1/schemas/`. The same section names the human pages.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### sites_https (MUST)

**Met.** The repository is on https://github.com/GautamTalksDev/refledger-site. The public site is https://refledger.gautamkhosla.com. There is no download URL that uses plain HTTP.

### discussion (MUST)

**Met.** GitHub Issues are open on this repository. Each issue has its own URL, the list is searchable, and new people can open an issue.

Evidence: https://github.com/GautamTalksDev/refledger-site/issues

### english (SHOULD)

**Met.** Documentation, issues, and the site copy are in English.

### maintained (MUST)

**Met.** The repository is under active development (October 2026), with a published security policy and a maintainer who responds to private vulnerability reports. This is not the Scorecard "Maintained" check. That one stays at 0 until the repository is 90 days old. See the Scorecard note at the end.

Evidence: https://github.com/GautamTalksDev/refledger-site/commits/main

## Change control

### repo_public (MUST)

**Met.** https://github.com/GautamTalksDev/refledger-site is public.

### repo_track (MUST)

**Met.** Git records the change, the author, and the time.

### repo_interim (MUST)

**Met.** `main` contains the current source, not only release tarballs. Pull requests are the review point between pushes.

### repo_distributed (SUGGESTED)

**Met.** The version control system is git.

### version_unique (MUST)

**Met.** `package.json` version is `0.0.1`. Each commit on `main` has its own git commit id. No two releases share an identifier, because no numbered release has been cut twice. Commit ids are an allowed form of unique version identifier.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/package.json

### version_semver (SUGGESTED)

**Met.** `0.0.1` is semantic versioning. Later releases should keep that.

### version_tags (SUGGESTED)

**Unmet.** There are no git tags identifying a release. This does not block the passing badge. Add an annotated tag when the first release is cut, then change this to Met.

### release_notes (MUST)

**N/A.** This repository produces one website, deployed continuously by Cloudflare Pages when `main` updates. It is not a library that users upgrade in many places. The criterion allows N/A for that case.

Justification to paste: The software is a single website with continuous delivery. Users do not install discrete releases.

### release_notes_vulns (MUST)

**N/A.** No versioned release has been cut, and this criterion allows N/A when there are no release notes. It also applies to vulnerabilities in the project results, not in dependencies.

## Reporting

### report_process (MUST)

**Met.** Bug reports go to GitHub Issues. Vulnerability reports go through private vulnerability reporting, described in `SECURITY.md`.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/SECURITY.md

### report_tracker (SHOULD)

**Met.** GitHub Issues is the tracker.

Evidence: https://github.com/GautamTalksDev/refledger-site/issues

### report_responses (MUST)

**Met.** The repository was created on 2026-10-02. No bug report falls in the 2 to 12 month window this criterion asks about, so there is no unanswered majority.

### enhancement_responses (SHOULD)

**Met.** Same window, same fact: no enhancement request is old enough to be in that window.

### report_archive (MUST)

**Met.** GitHub Issues keeps the public archive of reports and responses.

Evidence: https://github.com/GautamTalksDev/refledger-site/issues

### vulnerability_report_process (MUST)

**Met.** `SECURITY.md` is in the repository and linked from the README. The public site also has `/security` and `/.well-known/security.txt`.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/SECURITY.md

### vulnerability_report_private (MUST)

**Met.** Private reports use GitHub private vulnerability reporting: https://github.com/GautamTalksDev/refledger-site/security/advisories/new

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/SECURITY.md

### vulnerability_report_response (MUST)

**N/A.** No vulnerability report has been received in the last 6 months. The criterion says to choose N/A in that case. The published target, once a report arrives, is acknowledgement within 72 hours by one maintainer. That is not an SLA.

## Quality

### build (MUST)

**Met.** `npm ci` then `npm run build` rebuilds the static site from source. The README documents both.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### build_common_tools (SUGGESTED)

**Met.** The build uses Node.js and npm.

### build_floss_tools (SHOULD)

**Met.** Node.js, npm, and Astro are FLOSS. The build does not require a proprietary compiler.

### test (MUST)

**Met.** Vitest runs the unit, conformance, and property tests. Playwright runs the end-to-end tests. Both are FLOSS. `npm test` is documented.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/package.json

### test_invocation (SHOULD)

**Met.** `npm test` is the normal Node invocation. End-to-end tests are `npm run test:e2e`.

### test_most (SUGGESTED)

**Unmet.** There is no coverage report showing that most branches, inputs, and functionality are tested. The suite is real, and it is not measured against "most". This does not block the passing badge.

### test_continuous_integration (SUGGESTED)

**Met.** `.github/workflows/ci.yml` runs the test suite on every pull request and every push to `main`.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/.github/workflows/ci.yml

### test_policy (MUST)

**Met.** The Contributing section says a new page or feature gets an end-to-end test, and that `npm test` must pass.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### tests_are_added (MUST)

**Met.** Recent functionality landed with tests in `tests/` and `src/**/*.test.ts`, including the property tests in `tests/fuzz-properties.test.ts` and the API test that checks `ledger_data_license`.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/tests/fuzz-properties.test.ts

### tests_documented_added (SUGGESTED)

**Met.** The policy is written in the Contributing section, not only in conversation.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/README.md

### warnings (MUST)

**Met.** `tsconfig.json` extends `astro/tsconfigs/strict`. TypeScript is the FLOSS tool.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/tsconfig.json

### warnings_fixed (MUST)

**Unmet.** The TypeScript compiler in check-only mode, run on 2026-10-03, reports 27 errors. They are not fixed, and CI does not fail on them. Do not mark this Met until that command is clean. This MUST blocks the passing badge.

### warnings_strict (SUGGESTED)

**Met** for the compiler mode (`strict` is on). It does not excuse `warnings_fixed`. The strict flags are enabled, and the reported errors are a separate, unmet MUST.

## Security

### know_secure_design (MUST)

**Met, only if you attest it.** You are the only primary developer. `docs/SECURITY-REVIEW.md` is the written security review for this site (CSP, Trusted Types, input limits, no secrets in the repo, pinned actions). The criterion is about the person. If you do not want to claim that knowledge, mark Unmet.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/docs/SECURITY-REVIEW.md

### know_common_errors (MUST)

**Met, only if you attest it.** The same review names the errors that matter here (XSS, supply chain, credential handling, hostile workflow input) and the mitigation for each. Change to Unmet if you will not attest that.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/docs/SECURITY-REVIEW.md

### crypto_published (MUST)

**Met.** Signature checks use Ed25519. The hash chain uses SHA-256. SHA-512 is available in the same module. All three are published and reviewed. Implementation is WebCrypto or Node's `crypto`, not a private cipher.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/src/lib/verify.ts

### crypto_call (SHOULD)

**Met.** Cryptography is not the purpose of the site. Verification calls WebCrypto and Node `crypto`.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/src/lib/hash.ts

### crypto_floss (MUST)

**Met.** The same operations can be implemented with FLOSS (WebCrypto in a FLOSS browser, or a FLOSS Ed25519 library). The site does not require a proprietary crypto module.

### crypto_keylength (MUST)

**Met.** The published signing key is Ed25519 (256-bit curve, 128-bit security), which meets the NIST minimums through 2030. The site verifies that key. It does not offer a shorter default.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/src/lib/verify.ts

### crypto_working (MUST)

**Met.** Defaults are Ed25519, SHA-256, and SHA-512. The site does not use MD4, MD5, single DES, RC4, or Dual_EC_DRBG as a security mechanism.

### crypto_weaknesses (SHOULD)

**Met.** SHA-1 and SSH CBC are not used as security mechanisms. Git's own object ids are Git's, not this site's hash chain.

### crypto_pfs (SHOULD)

**N/A.** The site does not do key agreement. It verifies detached signatures.

### crypto_password_storage (MUST)

**N/A.** The site stores no passwords.

### crypto_random (MUST)

**N/A.** This repository verifies signatures. It does not generate keys or nonces. Key generation is in the ledger repository, outside this form.

## Delivery

### delivery_mitm (MUST)

**Met.** Source is cloned over HTTPS from GitHub. The website is served over HTTPS by Cloudflare.

### delivery_unsigned (MUST)

**Met.** The project does not tell users to download a checksum over plain HTTP and trust it without a signature.

## Vulnerabilities

### vulnerabilities_fixed_60_days (MUST)

**Met on 2026-10-03, with a deadline.** The only medium-or-higher advisory in the tree is GHSA-ch52-4w7c-c8xp, public since 2026-09-18, which is 15 days, not more than 60. npm `http-cache-semantics` 4.2.0 is still the latest release. Upstream issue 56 is open. The 2026-09-29 commit on that repository does not close the advisory, so there is no honest git override. The package is a build-time dependency of Astro, not code shipped in the static site. If it is still unpatched on 2026-11-17, change this answer to Unmet.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/scripts/check-audit.mjs

### vulnerabilities_critical_fixed (SHOULD)

**Met.** No critical advisory is open. The known issue is high, not critical, and it has no patch to apply.

### no_leaked_credentials (MUST)

**Met.** The signing seed is a GitHub Environment secret, not a file in this repository. A search of the current tree found no private key block and no AWS access key id. The public Ed25519 key is meant to be public.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/src/pages/security.astro

## Analysis

### static_analysis (MUST)

**Met.** CodeQL analyzes JavaScript and TypeScript on pull requests, on pushes to `main`, and on a weekly schedule. The workflow is `.github/workflows/codeql.yml`. GitHub's CodeQL default setup is turned off so this workflow is the one that runs.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/.github/workflows/codeql.yml

### static_analysis_common_vulnerabilities (SUGGESTED)

**Met.** CodeQL's JavaScript queries include the vulnerability rules (the HTML filtering alerts were from those rules).

### static_analysis_fixed (MUST)

**Met, after you confirm the Security tab.** The four open CodeQL alerts were incomplete HTML filtering in `scripts/glued-links.mjs` and `scripts/check-copy-rules.mjs`. Those scripts now parse with parse5. Before you submit, the code scanning page should show 0 open alerts for those rules. If any medium-or-higher exploitable alert is still open, mark this Unmet.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/scripts/glued-links.mjs

### static_analysis_often (SUGGESTED)

**Met.** CodeQL runs on every pull request and every push to `main`, plus a weekly schedule.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/.github/workflows/codeql.yml

### dynamic_analysis (SUGGESTED)

**Met.** `tests/fuzz-properties.test.ts` uses fast-check. CI runs it via `npm test`.

Evidence: https://github.com/GautamTalksDev/refledger-site/blob/main/tests/fuzz-properties.test.ts

### dynamic_analysis_unsafe (SUGGESTED)

**N/A.** This repository is TypeScript and JavaScript. It does not include C or C++.

### dynamic_analysis_enable_assertions (SUGGESTED)

**Met.** The property tests assert the invariants on every CI run: parsers do not throw or hang on hostile input inside the size limits, and every URL the builders return is the encoded form. Those assertions are the test configuration, not a production build.

### dynamic_analysis_fixed (MUST)

**Met.** The property tests have not confirmed a medium or higher vulnerability. There is nothing in that class left unfixed. If a later run confirms one, this answer stays Met only after that finding is fixed.

## What this file does not do

It does not claim a Scorecard 10. Scorecard "Code-Review" needs a second person's approval. Scorecard "Contributors" needs another organisation. Scorecard "Maintained" stays low until the repository is 90 days old. Those are recorded in the Scorecard report, not papered over here.
