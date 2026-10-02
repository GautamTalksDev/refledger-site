#!/usr/bin/env node
/**
 * Resolve every pinned actions/* SHA in .github/workflows against the
 * version comment (e.g. # v5.0.0) via git ls-remote. Fail on mismatch.
 * Never type SHAs by hand: this script is the source of truth check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const workflowsDir = join(root, '.github', 'workflows');

const PIN_RE =
  /uses:\s*(actions\/[\w-]+)@([0-9a-f]{40})\s*#\s*(v[\w.-]+)/gi;

function listWorkflowFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isFile() && /\.ya?ml$/i.test(name)) out.push(p);
  }
  return out;
}

function resolveTagSha(repo, tag) {
  // Prefer git ls-remote (no auth). Fall back to gh api.
  try {
    const out = execFileSync(
      'git',
      ['ls-remote', `https://github.com/${repo}.git`, `refs/tags/${tag}`],
      { encoding: 'utf8', timeout: 60_000 },
    ).trim();
    if (out) {
      // annotated tags: may show tag object; peel with ^{}
      const peeled = execFileSync(
        'git',
        ['ls-remote', `https://github.com/${repo}.git`, `refs/tags/${tag}^{}`],
        { encoding: 'utf8', timeout: 60_000 },
      ).trim();
      const line = (peeled || out).split('\n')[0];
      const sha = line.split(/\s+/)[0];
      if (/^[0-9a-f]{40}$/.test(sha)) return sha;
    }
  } catch {
    // fall through
  }
  const json = execFileSync(
    'gh',
    ['api', `repos/${repo}/git/refs/tags/${tag}`, '--jq', '.object'],
    { encoding: 'utf8', timeout: 60_000 },
  );
  const obj = JSON.parse(json);
  if (obj.type === 'commit') return obj.sha;
  if (obj.type === 'tag') {
    const tagObj = JSON.parse(
      execFileSync('gh', ['api', `repos/${repo}/git/tags/${obj.sha}`], {
        encoding: 'utf8',
        timeout: 60_000,
      }),
    );
    return tagObj.object.sha;
  }
  throw new Error(`Cannot resolve ${repo}@${tag}`);
}

const pins = [];
for (const file of listWorkflowFiles(workflowsDir)) {
  const text = readFileSync(file, 'utf8');
  let m;
  const re = new RegExp(PIN_RE.source, PIN_RE.flags);
  while ((m = re.exec(text))) {
    pins.push({
      file: file.replace(root + '/', ''),
      action: m[1],
      sha: m[2].toLowerCase(),
      tag: m[3],
    });
  }
}

if (pins.length === 0) {
  console.error('No pinned actions/* SHAs with version comments found.');
  process.exit(1);
}

let failed = 0;
for (const pin of pins) {
  process.stdout.write(`Resolving ${pin.action}@${pin.tag} ... `);
  let expected;
  try {
    expected = resolveTagSha(pin.action, pin.tag).toLowerCase();
  } catch (err) {
    console.log('ERROR');
    console.error(`  ${pin.file}: ${err.message || err}`);
    failed++;
    continue;
  }
  if (expected !== pin.sha) {
    console.log('MISMATCH');
    console.error(
      `  ${pin.file}: pinned ${pin.sha} but ${pin.tag} resolves to ${expected}`,
    );
    failed++;
  } else {
    console.log('ok');
  }
}

if (failed) {
  console.error(`\n${failed} pin mismatch(es).`);
  process.exit(1);
}
console.log(`\nAll ${pins.length} pin(s) match their version tags.`);
