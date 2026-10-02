# Refledger website: implementation handoff

reference.html is the approved website. It is the visual and behavioural
spec for every page. Rebuild it in refledger-site (Astro, static output)
on real data. Do not invent anything it doesn't show.

## Pages and routes
- /                      Check a repo (the one box)
- /check?repo=owner/name Results (also reachable from the box)
- /paste                 Paste a workflow file
- /moved                 What moved (ecosystem default, ?canary=1 includes tests)
- /how                   How it works: move the tag, time wall with play, live hash chain
- /verify                In-browser verifier plus the CLI command
- /incidents             What went wrong, on the record
- /a/[owner]/[repo]      Action page
- /a/[owner]/[repo]/[tag] Tag biography
- /e/[seq]               Ledger entry
- 404

## What is real in the reference, and stays real
- The check reads public workflows through the GitHub API from the visitor's
  browser, parses every uses: line, resolves tags to commits with the
  application/vnd.github.sha media type, and builds fixed files to copy.
- The How it works page hashes its own sections with SHA-256 live.

## What is snapshot data in the reference, and must come from the ledger
- WATCHED, MOVES, KNOWN, FEED, INCIDENTS, the time wall events and the
  record numbers. Replace with the static /api/v1 data built from the
  data branch. Wording comes from ref_form + classification + ancestry.
- The verify page animation must run the real third-implementation
  verifier against the published ledger.

## Rules
- No em dashes, en dashes or double hyphens in copy. CLI flags inside
  code blocks are the only exception.
- Facts, never verdicts. Canary always labelled. Corrections always shown.
- Accessibility, reduced motion, dark mode and mobile as in the reference.
