#!/usr/bin/env node
/**
 * Fail CI on high/critical npm audit findings, with an allowlist for
 * advisories that have no patched release yet.
 */
import { execFileSync } from 'node:child_process';

/** Advisories with no fixed package version published yet. */
const ALLOW = new Set([
  // Rechecked 2026-10-03. npm latest is still 4.2.0. Upstream issue
  // kornelski/http-cache-semantics#56 is open. The 2026-09-29 commit
  // "Fix: handle Vary wildcard and inherited headers" does not close
  // GHSA-ch52-4w7c-c8xp, so an override to that git revision is not a
  // patch. Used by astro@7.3.5 for build-time HTTP caching only, not
  // the static production site. Public since 2026-09-18.
  'GHSA-CH52-4W7C-C8XP',
]);

let raw;
try {
  raw = execFileSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
} catch (err) {
  raw = err.stdout?.toString?.() || '';
  if (!raw) throw err;
}

const report = JSON.parse(raw);
const vulns = report.vulnerabilities || {};
const bad = [];

function ghsaIds(v) {
  const vias = Array.isArray(v.via) ? v.via : [];
  return vias
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const url = String(x.url || '');
      const m = url.match(/GHSA-[a-z0-9-]+/i);
      return m ? m[0].toUpperCase() : null;
    })
    .filter(Boolean);
}

for (const [name, v] of Object.entries(vulns)) {
  if (!v || (v.severity !== 'high' && v.severity !== 'critical')) continue;
  const ids = ghsaIds(v);
  if (ids.length > 0 && ids.every((id) => ALLOW.has(id))) {
    console.log(`Allowlisted ${name}: ${ids.join(', ')} (no patched release yet)`);
    continue;
  }
  // Parent packages that only inherit allowlisted child advisories.
  if (ids.length === 0 && Array.isArray(v.via) && v.via.every((x) => typeof x === 'string')) {
    const parentsOk = v.via.every((dep) => {
      const child = vulns[dep];
      if (!child) return false;
      const childIds = ghsaIds(child);
      return childIds.length > 0 && childIds.every((id) => ALLOW.has(id));
    });
    if (parentsOk) {
      console.log(`Allowlisted ${name}: inherits ${v.via.join(', ')}`);
      continue;
    }
  }
  bad.push({ name, severity: v.severity, ids });
}

if (bad.length) {
  console.error('npm audit high/critical findings not allowlisted:');
  for (const b of bad) console.error(`  ${b.name} (${b.severity}) ${b.ids.join(' ')}`);
  process.exit(1);
}
console.log('npm audit OK (allowlist applied)');
