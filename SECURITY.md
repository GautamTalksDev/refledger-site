# Security policy

Refledger is maintained by one person. There is no on-call rotation and
no paid response team. This page says what you can actually expect.

## How to report

If you believe you have found a vulnerability in this website, the
watchdog Worker, or the build and deploy pipeline, report it privately.

**Preferred:** open a private vulnerability report at
[github.com/GautamTalksDev/refledger-site/security/advisories/new](https://github.com/GautamTalksDev/refledger-site/security/advisories/new).

Vulnerabilities in the poller, the log format, the verifier, or the
signing key belong on the ledger repository:
[github.com/GautamTalksDev/refledger/security/advisories/new](https://github.com/GautamTalksDev/refledger/security/advisories/new).

The public site also publishes
[/.well-known/security.txt](https://refledger.gautamkhosla.com/.well-known/security.txt).

Please include what you observed, the version or commit, and a way to
reproduce it. Do not open a public issue for an unfixed vulnerability.

## What is in scope

- The public website in this repository
- The static API under `/api/v1/`
- The watchdog Cloudflare Worker
- The GitHub Actions workflows that build and publish this site
- Secrets handling for this repository

## What is out of scope

- Third-party repositories we observe
- GitHub itself, npm, or Cloudflare, except where our own configuration
  is wrong
- Public tag movement we did not cause
- The canary repository, which moves tags on purpose
  ([its own policy](https://github.com/GautamTalksDev/canary/blob/main/SECURITY.md))
- Findings that require already-compromised maintainer credentials

## What to expect

- **Acknowledgement:** we aim to acknowledge a private report within
  72 hours. That is a target for one person, not a contractual SLA.
- **A fix:** may take longer than the acknowledgement. A same-day patch
  is not something this project can promise.
- **Disclosure:** we will agree a date with you before public discussion
  of an unfixed site vulnerability. The append-only ledger is a separate
  policy: raw observations publish immediately, and interpretation waits.
  That policy is in the ledger
  [SECURITY.md](https://github.com/GautamTalksDev/refledger/blob/main/SECURITY.md).

## Safe harbour

We will not pursue or support legal action against researchers who make
a good-faith effort to follow this process, avoid privacy violations,
avoid destruction of data, and give us a reasonable chance to respond
before public disclosure.
