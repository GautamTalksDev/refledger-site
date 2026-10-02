#!/usr/bin/env node
/**
 * Live GitHub check against three public repos + rate-limit status.
 * Mirrors src/lib/check-workflow.ts fetch/parse paths.
 */
const USES =
  /^(\s*-?\s*)uses:\s*(['"]?)([^'"\s#]+)\2\s*(?:#\s*(.*?))?\s*$/;
const BRANCHES = new Set([
  'main',
  'master',
  'develop',
  'dev',
  'trunk',
  'latest',
  'stable',
  'next',
  'HEAD',
  'nightly',
]);

function parseFiles(files) {
  const out = [];
  for (const f of files) {
    f.text.split('\n').forEach((line, i) => {
      const m = line.match(USES);
      if (!m) return;
      const spec = m[3];
      if (spec.startsWith('./') || spec.startsWith('docker://')) {
        out.push({ file: f.name, line: i + 1, spec, kind: 'local' });
        return;
      }
      const at = spec.lastIndexOf('@');
      if (at < 1) return;
      const target = spec.slice(0, at);
      const ref = spec.slice(at + 1);
      const key = target.split('/').slice(0, 2).join('/');
      let kind;
      if (/^[0-9a-f]{40}$/.test(ref)) kind = 'sha';
      else if (/^[0-9a-f]{7,39}$/.test(ref)) kind = 'short';
      else if (BRANCHES.has(ref) || !/\d/.test(ref)) kind = 'branch';
      else kind = 'tag';
      out.push({
        file: f.name,
        line: i + 1,
        spec,
        target,
        key,
        ref,
        kind,
        comment: m[4] || '',
      });
    });
  }
  return out;
}

async function loadRepo(repo) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/.github/workflows`,
  );
  if (res.status === 404) {
    const e = new Error('notfound');
    e.code = 404;
    throw e;
  }
  if (res.status === 403 || res.status === 429) {
    const e = new Error('ratelimit');
    e.code = 403;
    throw e;
  }
  if (!res.ok) throw new Error(`status ${res.status}`);
  const list = await res.json();
  const ymls = (Array.isArray(list) ? list : []).filter(
    (f) => /\.ya?ml$/.test(f.name) && f.download_url,
  );
  return Promise.all(
    ymls.map(async (f) => ({
      name: f.name,
      text: await (await fetch(f.download_url)).text(),
    })),
  );
}

async function resolveSha(item) {
  const url = `https://api.github.com/repos/${item.key}/commits/${encodeURIComponent(item.ref)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.sha' },
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const t = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(t)) throw new Error('bad sha');
  return t;
}

async function checkRepo(label, repo) {
  const out = { label, repo };
  try {
    const files = await loadRepo(repo);
    out.files = files.map((f) => f.name);
    const items = parseFiles(files);
    out.actions = items.filter((i) => i.kind !== 'local').length;
    out.kinds = items.reduce((a, i) => {
      a[i.kind] = (a[i.kind] || 0) + 1;
      return a;
    }, {});
    const need = items.filter((i) =>
      ['tag', 'branch', 'short'].includes(i.kind),
    );
    const uniq = {};
    for (const i of need) uniq[`${i.key}@${i.ref}`] = i;
    let resolved = 0;
    let failed = 0;
    await Promise.all(
      Object.keys(uniq).map((k) =>
        resolveSha(uniq[k])
          .then(() => {
            resolved++;
          })
          .catch(() => {
            failed++;
          }),
      ),
    );
    out.uniqueRefs = Object.keys(uniq).length;
    out.resolved = resolved;
    out.resolveFailed = failed;
    out.sample = items
      .filter((i) => i.kind !== 'local')
      .slice(0, 6)
      .map((i) => i.spec);
  } catch (e) {
    out.error = e.code ? `${e.message} (code ${e.code})` : String(e.message || e);
  }
  return out;
}

const results = [];
results.push(await checkRepo('actions/checkout', 'actions/checkout'));
results.push(await checkRepo('large (facebook/react)', 'facebook/react'));
results.push(
  await checkRepo('no workflows (octocat/Hello-World)', 'octocat/Hello-World'),
);

const rr = await fetch('https://api.github.com/rate_limit', {
  headers: { Accept: 'application/vnd.github+json' },
});
const j = await rr.json();
const remaining = j.resources?.core?.remaining;
const rate = {
  remaining,
  limit: j.resources?.core?.limit,
  reset: j.resources?.core?.reset,
  currentlyLimited: remaining === 0,
  siteMessageOn403:
    'GitHub asked us to slow down. Your browser has used its hourly allowance of GitHub lookups. Try again in a little while, or paste a workflow file instead.',
};

console.log(JSON.stringify({ results, rate }, null, 2));
