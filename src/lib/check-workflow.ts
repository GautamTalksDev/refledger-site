/**
 * Check-a-repo island: parse uses: lines, assess status, resolve SHAs via
 * GitHub Contents API + application/vnd.github.sha. Browser-safe.
 */

export type WorkflowFile = { name: string; text: string };

export type UsesKind = 'local' | 'sha' | 'short' | 'branch' | 'tag';

export type ParsedUses = {
  file: string;
  line: number;
  raw?: string;
  indent?: string;
  spec: string;
  target?: string;
  key?: string;
  ref?: string;
  comment?: string;
  kind: UsesKind;
};

export type AssessResult = {
  item: ParsedUses;
  status: string;
  detail: string;
  fix: string | null;
  attn: boolean;
  link: { href: string; text: string } | null;
};

export type MoveInfo = {
  at: number;
  from: string;
  to: string;
  what: string;
  sev?: string;
  entry?: number;
};

export type LedgerLookup = {
  watched: Set<string>;
  /** repo -> tag -> move */
  moves: Map<string, Map<string, MoveInfo>>;
  /** full sha -> known version comment */
  known: Map<string, string>;
  /** ISO or ms of watch start for "has not moved since" copy */
  watchedSinceMs: number;
  nowMs: number;
};

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

export { USES, BRANCHES };

export function parseFiles(files: WorkflowFile[]): ParsedUses[] {
  const out: ParsedUses[] = [];
  for (const f of files) {
    const lines = f.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(USES);
      if (!m) continue;
      const spec = m[3];
      if (spec.startsWith('./') || spec.startsWith('docker://')) {
        out.push({
          file: f.name,
          line: i + 1,
          spec,
          kind: 'local',
        });
        continue;
      }
      const at = spec.lastIndexOf('@');
      if (at < 1) continue;
      const target = spec.slice(0, at);
      const ref = spec.slice(at + 1);
      const parts = target.split('/');
      const key = parts.slice(0, 2).join('/');
      let kind: UsesKind;
      if (/^[0-9a-f]{40}$/.test(ref)) kind = 'sha';
      else if (/^[0-9a-f]{7,39}$/.test(ref)) kind = 'short';
      else if (BRANCHES.has(ref) || !/\d/.test(ref)) kind = 'branch';
      else kind = 'tag';
      out.push({
        file: f.name,
        line: i + 1,
        raw: line,
        indent: m[1],
        spec,
        target,
        key,
        ref,
        comment: m[4] || '',
        kind,
      });
    }
  }
  return out;
}

function ago(ms: number, nowMs: number): string {
  const h = Math.round((nowMs - ms) / 3_600_000);
  if (h < 1) return 'less than an hour';
  if (h < 48) return h + (h === 1 ? ' hour' : ' hours');
  return Math.round(h / 24) + ' days';
}

function formatWatchStart(ms: number): string {
  const d = new Date(ms);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export function assess(
  item: ParsedUses,
  sha: string | null,
  ledger: LedgerLookup,
): AssessResult {
  const r: AssessResult = {
    item,
    fix: null,
    attn: false,
    link: null,
    status: '',
    detail: '',
  };
  const w = item.key ? ledger.watched.has(item.key) : false;

  if (item.kind === 'local') {
    r.status = 'Local or container action';
    r.detail =
      'Defined in your own repository or pulled by image. Moved tags upstream do not affect it.';
    return r;
  }

  if (item.kind === 'sha' && item.ref && item.target) {
    const known = ledger.known.get(item.ref.toLowerCase()) ?? ledger.known.get(item.ref);
    if (known && item.comment && item.comment !== known) {
      r.status = 'Pinned, but the comment is wrong';
      r.detail = `This commit was never ${item.comment}. It is ${known}. The code cannot move, but the label will mislead whoever updates it next.`;
      r.fix = `${item.target}@${item.ref} # ${known}`;
      r.attn = true;
    } else {
      r.status = 'Pinned to a commit. Nothing to do.';
      r.detail = 'This line always runs the same code.';
    }
    if (w && item.key) r.link = { href: `/a/${item.key}`, text: 'See its history' };
    return r;
  }

  r.attn = true;
  if (item.kind === 'branch') {
    r.status = 'Follows a branch';
    r.detail =
      'Branches move with every commit, so this runs whatever was pushed last.' +
      (w ? '' : " We don't watch this one yet.");
    r.fix = sha && item.target
      ? `${item.target}@${sha} # ${item.ref} at the time of pinning`
      : null;
    return r;
  }
  if (item.kind === 'short') {
    r.status = 'A short commit hash';
    r.detail =
      'Short hashes can be ambiguous. Use the full 40 character commit.';
    r.fix =
      sha && item.target ? `${item.target}@${sha} # ${item.ref}` : null;
    return r;
  }

  const mv =
    item.key && item.ref
      ? ledger.moves.get(item.key)?.get(item.ref)
      : undefined;
  if (w && mv) {
    r.status = `Uses a tag that moved ${ago(mv.at, ledger.nowMs)} ago`;
    r.detail = `${mv.what}. Pin to the new commit, or keep the old one until you have reviewed it.`;
    r.link = {
      href: `/a/${item.key}/${item.ref}`,
      text: 'See exactly what changed',
    };
  } else if (w) {
    r.status = 'Uses a tag that can be moved';
    r.detail = `It has not moved since we started watching on ${formatWatchStart(ledger.watchedSinceMs)}. Pinning locks in the code it runs today.`;
    r.link = item.key
      ? { href: `/a/${item.key}`, text: 'See its history' }
      : null;
  } else {
    r.status = "Uses a tag we don't watch yet";
    r.detail =
      'We can still pin it to the code it runs today. We just have no history to show you.';
  }
  r.fix =
    sha && item.target ? `${item.target}@${sha} # ${item.ref}` : null;
  return r;
}

export class GithubApiError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

export async function resolveSha(
  item: Pick<ParsedUses, 'key' | 'ref'>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!item.key || !item.ref) throw new Error('missing key/ref');
  const url = `https://api.github.com/repos/${item.key}/commits/${encodeURIComponent(item.ref)}`;
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/vnd.github.sha' },
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const t = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(t)) throw new Error('bad sha');
  return t;
}

export async function loadRepo(
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkflowFile[]> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${repo}/contents/.github/workflows`,
  );
  if (res.status === 404) {
    // Contents 404 means either the repo is missing, or it exists with no
    // .github/workflows tree. Distinguish with a cheap repo metadata GET.
    const meta = await fetchImpl(`https://api.github.com/repos/${repo}`);
    if (meta.status === 404) throw new GithubApiError('notfound', 404);
    if (meta.status === 403 || meta.status === 429)
      throw new GithubApiError('ratelimit', 403);
    if (!meta.ok) throw new Error(`status ${meta.status}`);
    return [];
  }
  if (res.status === 403 || res.status === 429)
    throw new GithubApiError('ratelimit', 403);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const list = (await res.json()) as {
    name: string;
    download_url?: string;
  }[];
  const ymls = (Array.isArray(list) ? list : []).filter(
    (f) => /\.ya?ml$/.test(f.name) && f.download_url,
  );
  return Promise.all(
    ymls.map(async (f) => {
      const r = await fetchImpl(f.download_url!);
      const text = await r.text();
      return { name: f.name, text };
    }),
  );
}

export function fixedFiles(
  files: WorkflowFile[],
  results: AssessResult[],
): { name: string; text: string; changed: number }[] {
  return files.map((f) => {
    const lines = f.text.split('\n');
    let changed = 0;
    for (const r of results) {
      if (r.item.file === f.name && r.fix && r.item.raw && r.item.indent != null) {
        lines[r.item.line - 1] = `${r.item.indent}uses: ${r.fix}`;
        changed++;
      }
    }
    return { name: f.name, text: lines.join('\n'), changed };
  });
}

export function normalizeRepo(input: string): string | null {
  const repo = input
    .trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return repo;
}

export const EXAMPLE_FILES: WorkflowFile[] = [
  {
    name: 'ci.yml',
    text: `name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4.2.2
      - run: npm ci && npm test
      - uses: reviewdog/action-actionlint@v1
`,
  },
  {
    name: 'release.yml',
    text: `name: release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.1.0
      - uses: ./.github/actions/build
      - uses: some-org/deploy-tool@main
`,
  },
];

export const EXAMPLE_SHAS: Record<string, string> = {
  'actions/checkout@v4.2.2':
    '11bd71901bbe5b1630ceea73d27597364c9af683',
};
