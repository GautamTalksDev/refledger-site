/**
 * Check-a-repo island: parse uses: lines, assess status, resolve SHAs via
 * GitHub Contents API + application/vnd.github.sha. Browser-safe.
 *
 * Every byte from GitHub is treated as hostile. Parsing is line-oriented with
 * a linear-time regex, hard size limits, and AbortController timeouts.
 */

import {
  FETCH_TIMEOUT_MS,
  LIMIT_MESSAGES,
  LimitError,
  MAX_UNIQUE_REFS,
  MAX_WORKFLOW_FILE_BYTES,
  MAX_WORKFLOW_FILES,
  MAX_WORKFLOW_LINES,
  PARSE_TIME_BUDGET_MS,
} from './limits';
import { actionHistoryHref } from './safe-link';

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
  /** repo -> tag -> current pin commit (lowercase) */
  currentByTag: Map<string, Map<string, string>>;
  /** repo -> commit (lowercase) -> tags currently at that commit */
  tagsByCommitNow: Map<string, Map<string, string[]>>;
  /** repo -> commit (lowercase) -> tags that pointed there at any time in our history */
  tagsByCommitEver: Map<string, Map<string, string[]>>;
  /** repo -> tag -> past commits (wire payload; optional on hand-built test ledgers) */
  historyByTag?: Map<string, Map<string, string[]>>;
  /** ISO or ms of watch start for "has not moved since" copy */
  watchedSinceMs: number;
  nowMs: number;
};

export type AssessOptions = {
  /**
   * For unwatched actions: GitHub resolution of the pin comment tag today.
   * Omitted or null means we could not resolve it; do not claim a mismatch.
   */
  commentSha?: string | null;
};

/**
 * Linear-time uses: matcher. No nested quantifiers that can explode.
 * Indent, optional quotes, owner/repo/path@ref, optional # comment to EOL.
 */
const USES =
  /^([ \t]*-?[ \t]*)uses:[ \t]*(['"]?)([^'"#\s]+)\2[ \t]*(?:#[ \t]*(.*))?$/;

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

function enforceFileLimits(files: WorkflowFile[]): void {
  if (files.length > MAX_WORKFLOW_FILES) {
    throw new LimitError('too_many_files', LIMIT_MESSAGES.too_many_files);
  }
  for (const f of files) {
    if (f.text.length > MAX_WORKFLOW_FILE_BYTES) {
      throw new LimitError('file_too_large', LIMIT_MESSAGES.file_too_large);
    }
    // Cheap line count without allocating a huge array for pathological input.
    let lines = 1;
    for (let i = 0; i < f.text.length; i++) {
      if (f.text.charCodeAt(i) === 10) {
        lines++;
        if (lines > MAX_WORKFLOW_LINES) {
          throw new LimitError('too_many_lines', LIMIT_MESSAGES.too_many_lines);
        }
      }
    }
  }
}

/**
 * Parse uses: lines. Aborts with a LimitError if matching a single file
 * exceeds PARSE_TIME_BUDGET_MS (guards against future regex regressions).
 */
export function parseFiles(files: WorkflowFile[]): ParsedUses[] {
  enforceFileLimits(files);
  const out: ParsedUses[] = [];
  for (const f of files) {
    const started = performance.now();
    const lines = f.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if ((i & 0x3ff) === 0 && performance.now() - started > PARSE_TIME_BUDGET_MS) {
        throw new LimitError(
          'too_many_lines',
          'Parsing this workflow took too long. Paste a shorter excerpt.',
        );
      }
      const line = lines[i];
      // Cap per-line work: ignore absurdly long lines without matching.
      if (line.length > 4096) continue;
      const m = USES.exec(line);
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
      if (!ref || ref.length > 256) continue;
      const parts = target.split('/');
      if (parts.length < 2) continue;
      const key = `${parts[0]}/${parts[1]}`;
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(key)) continue;
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

export function formatWatchStart(ms: number): string {
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

/** Prefer the most specific version-like tag (v7.0.1 over v7.0 over v7). */
export function preferExactTag(tags: string[]): string | null {
  const versionish = tags.filter((t) => /^v?\d/.test(t));
  if (!versionish.length) return null;
  const ranked = [...versionish].sort((a, b) => {
    const da = a.replace(/^v/, '').split('.').length;
    const db = b.replace(/^v/, '').split('.').length;
    if (da !== db) return db - da;
    return b.length - a.length;
  });
  return ranked[0] ?? null;
}

export function formatTagList(tags: string[]): string {
  const sorted = [...new Set(tags)].sort((a, b) => {
    const exact = preferExactTag([a, b]);
    if (exact === a) return -1;
    if (exact === b) return 1;
    return a.localeCompare(b);
  });
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return sorted[0]!;
  if (sorted.length === 2) return `${sorted[0]} and ${sorted[1]}`;
  return `${sorted.slice(0, -1).join(', ')}, and ${sorted[sorted.length - 1]}`;
}

function tagsNow(ledger: LedgerLookup, repo: string, sha: string): string[] {
  return ledger.tagsByCommitNow.get(repo)?.get(sha.toLowerCase()) ?? [];
}

function tagsEver(ledger: LedgerLookup, repo: string, sha: string): string[] {
  return ledger.tagsByCommitEver.get(repo)?.get(sha.toLowerCase()) ?? [];
}

function currentTagCommit(
  ledger: LedgerLookup,
  repo: string,
  tag: string,
): string | undefined {
  return ledger.currentByTag.get(repo)?.get(tag);
}

function preferExactSuggestion(exact: string | null, comment: string): string {
  if (exact && exact !== comment) {
    return ` You could name the exact version, ${exact}, so updates read clearly.`;
  }
  return '';
}

/** Honest pin copy: SHA locks this action's own code, not transitive tags. */
const PINNED_OWN_CODE =
  "This action's own code cannot change. If it calls other actions or images by tag, those can still move.";

const PINNED_OWN_CODE_WRONG_SUFFIX =
  "This action's own code cannot move, but the label will mislead whoever updates it next.";

function assessPinnedComment(
  item: ParsedUses,
  ledger: LedgerLookup,
  opts: AssessOptions,
): Pick<AssessResult, 'status' | 'detail' | 'fix' | 'attn'> {
  const sha = item.ref!.toLowerCase();
  const comment = (item.comment || '').trim();
  const repo = item.key!;
  const watched = ledger.watched.has(repo);
  const now = tagsNow(ledger, repo, sha);
  const exact = preferExactTag(now);

  if (!comment) {
    return {
      status: 'Pinned to a commit. Nothing to do.',
      detail: PINNED_OWN_CODE + preferExactSuggestion(exact, ''),
      fix: null,
      attn: false,
    };
  }

  if (!watched) {
    const resolved = opts.commentSha?.toLowerCase() ?? null;
    if (resolved && resolved === sha) {
      return {
        status: 'Pinned to a commit. Nothing to do.',
        detail: PINNED_OWN_CODE,
        fix: null,
        attn: false,
      };
    }
    if (resolved && resolved !== sha) {
      return {
        status: 'Pinned, but the comment is wrong',
        detail: `${comment} does not point at this commit today. ${PINNED_OWN_CODE_WRONG_SUFFIX}`,
        // No suggested rewrite: we do not invent a version name for unwatched actions.
        fix: null,
        attn: true,
      };
    }
    return {
      status: 'Pinned to a commit. Nothing to do.',
      detail: PINNED_OWN_CODE,
      fix: null,
      attn: false,
    };
  }

  const current = currentTagCommit(ledger, repo, comment);
  if (current === sha) {
    return {
      status: 'Pinned to a commit. Nothing to do.',
      detail: PINNED_OWN_CODE + preferExactSuggestion(exact, comment),
      fix: null,
      attn: false,
    };
  }

  const ever = tagsEver(ledger, repo, sha);
  if (ever.includes(comment)) {
    const named = formatTagList(now);
    const status = named
      ? `Pinned. ${comment} has moved on since; this commit is ${named}`
      : `Pinned. ${comment} has moved on since.`;
    return {
      status,
      detail:
        "This action's own code cannot move. The comment names a tag that has moved on since we started watching.",
      fix: null,
      attn: false,
    };
  }

  const named = formatTagList(now);
  const since = formatWatchStart(ledger.watchedSinceMs);
  let detail = `${comment} has not pointed at this commit since we started watching on ${since}.`;
  if (named) detail += ` This commit is ${named}.`;
  detail += ` ${PINNED_OWN_CODE_WRONG_SUFFIX}`;
  return {
    status: 'Pinned, but the comment is wrong',
    detail,
    fix: item.target
      ? `${item.target}@${item.ref}${exact ? ` # ${exact}` : named ? ` # ${now[0]}` : ''}`
      : null,
    attn: true,
  };
}

export type ResultGroup = 'moved' | 'movable' | 'pinned' | 'local';

export function resultGroup(result: AssessResult): ResultGroup {
  const spec = result.item.spec;
  if (
    result.item.kind === 'local' ||
    spec.startsWith('./') ||
    spec.startsWith('docker://')
  ) {
    return 'local';
  }
  if (result.status.startsWith('Uses a tag that moved')) return 'moved';
  if (result.item.kind === 'sha') return 'pinned';
  return 'movable';
}

const GROUP_ORDER: Record<Exclude<ResultGroup, 'local'>, number> = {
  moved: 0,
  movable: 1,
  pinned: 2,
};

/** Moved tags, then movable tags, then pins. Local and docker are separate. */
export function orderResults(results: AssessResult[]): {
  rows: AssessResult[];
  local: AssessResult[];
} {
  const local: AssessResult[] = [];
  const rows: AssessResult[] = [];
  for (const result of results) {
    if (resultGroup(result) === 'local') local.push(result);
    else rows.push(result);
  }
  rows.sort((a, b) => GROUP_ORDER[resultGroup(a) as Exclude<ResultGroup, 'local'>] - GROUP_ORDER[resultGroup(b) as Exclude<ResultGroup, 'local'>]);
  return { rows, local };
}

export function localSkipLabel(count: number): string {
  const noun = count === 1 ? 'local action' : 'local actions';
  return `${count} ${noun} skipped (not affected by moved tags)`;
}

export function assess(
  item: ParsedUses,
  sha: string | null,
  ledger: LedgerLookup,
  opts: AssessOptions = {},
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

  if (item.kind === 'sha' && item.ref && item.target && item.key) {
    const pin = assessPinnedComment(item, ledger, opts);
    r.status = pin.status;
    r.detail = pin.detail;
    r.fix = pin.fix;
    r.attn = pin.attn;
    if (w) {
      const href = actionHistoryHref(item.key);
      if (href) r.link = { href, text: 'See its history' };
    }
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
    const href = item.key && item.ref ? actionHistoryHref(item.key, item.ref) : null;
    if (href) r.link = { href, text: 'See exactly what changed' };
  } else if (w) {
    r.status = 'Uses a tag that can be moved';
    r.detail = `It has not moved since we started watching on ${formatWatchStart(ledger.watchedSinceMs)}. Pinning locks in the code it runs today.`;
    const href = item.key ? actionHistoryHref(item.key) : null;
    r.link = href ? { href, text: 'See its history' } : null;
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

function withTimeout(
  fetchImpl: typeof fetch,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const parent = init?.signal;
    if (parent) {
      if (parent.aborted) ctrl.abort();
      else parent.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    return fetchImpl(input, { ...init, signal: ctrl.signal }).finally(() =>
      clearTimeout(timer),
    );
  };
}

async function timedFetch(
  fetchImpl: typeof fetch,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await withTimeout(fetchImpl)(input, init);
  } catch (err) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
    const msg = err instanceof Error ? err.message : String(err);
    if (name === 'AbortError' || /abort/i.test(msg)) {
      throw new LimitError('fetch_timeout', LIMIT_MESSAGES.fetch_timeout);
    }
    throw err;
  }
}

export async function resolveSha(
  item: Pick<ParsedUses, 'key' | 'ref'>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!item.key || !item.ref) throw new Error('missing key/ref');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.key)) {
    throw new Error('bad key');
  }
  const [owner, repo] = item.key.split('/');
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(item.ref)}`;
  const res = await timedFetch(fetchImpl, url, {
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
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new GithubApiError('notfound', 404);
  }
  const [owner, name] = repo.split('/');
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const res = await timedFetch(fetchImpl, `${base}/contents/.github/workflows`);
  if (res.status === 404) {
    const meta = await timedFetch(fetchImpl, base);
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
    size?: number;
  }[];
  const ymls = (Array.isArray(list) ? list : []).filter(
    (f) => /\.ya?ml$/.test(f.name) && f.download_url,
  );
  if (ymls.length > MAX_WORKFLOW_FILES) {
    throw new LimitError('too_many_files', LIMIT_MESSAGES.too_many_files);
  }
  for (const f of ymls) {
    if (typeof f.size === 'number' && f.size > MAX_WORKFLOW_FILE_BYTES) {
      throw new LimitError('file_too_large', LIMIT_MESSAGES.file_too_large);
    }
  }
  const files = await Promise.all(
    ymls.map(async (f) => {
      const url = f.download_url!;
      // Only allow raw.githubusercontent.com (and rare githubusercontent hosts).
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        throw new Error('bad download url');
      }
      if (
        host !== 'raw.githubusercontent.com' &&
        !host.endsWith('.githubusercontent.com')
      ) {
        throw new Error('unexpected download host');
      }
      const r = await timedFetch(fetchImpl, url);
      if (!r.ok) throw new Error(`status ${r.status}`);
      const text = await r.text();
      if (text.length > MAX_WORKFLOW_FILE_BYTES) {
        throw new LimitError('file_too_large', LIMIT_MESSAGES.file_too_large);
      }
      return { name: f.name, text };
    }),
  );
  enforceFileLimits(files);
  return files;
}

/** Count unique refs that need SHA resolution; throw if over the cap. */
export function assertUniqueRefBudget(items: ParsedUses[]): number {
  const uniq = new Set<string>();
  for (const it of items) {
    if (['tag', 'branch', 'short'].includes(it.kind) && it.key && it.ref) {
      uniq.add(`${it.key}@${it.ref}`);
    }
  }
  if (uniq.size > MAX_UNIQUE_REFS) {
    throw new LimitError('too_many_refs', LIMIT_MESSAGES.too_many_refs);
  }
  return uniq.size;
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

const SEGMENT = /^[A-Za-z0-9_.-]+$/;

export type RepoParseResult =
  | { kind: 'repo'; repo: string }
  | { kind: 'account'; account: string }
  | { kind: 'gist' }
  | { kind: 'host' }
  | { kind: 'invalid' };

/**
 * Reduce anything a visitor might paste into a GitHub repository key.
 * Extra path segments (tree, blob, pull, issues, …), query strings, and
 * fragments are dropped. Matching of host names is case insensitive.
 */
export function parseRepoInput(raw: string): RepoParseResult {
  const s = String(raw ?? '').trim();
  if (!s) return { kind: 'invalid' };

  if (
    /^(?:https?:\/\/)?(?:www\.)?gist\.github\.com\b/i.test(s) ||
    /^git@gist\.github\.com:/i.test(s)
  ) {
    return { kind: 'gist' };
  }

  if (
    /^(?:https?:\/\/)?(?:www\.)?(?:gitlab\.com|bitbucket\.org|codeberg\.org)\b/i.test(
      s,
    ) ||
    /^git@(?:gitlab\.com|bitbucket\.org|codeberg\.org):/i.test(s)
  ) {
    return { kind: 'host' };
  }

  const httpHost = s.match(/^(?:https?:\/\/)(?:www\.)?([^/?#]+)/i);
  if (httpHost && !/^github\.com$/i.test(httpHost[1])) {
    return { kind: 'host' };
  }

  let path = s;
  const ssh = path.match(/^git@github\.com:(.+)$/i);
  if (ssh) {
    path = ssh[1];
  } else {
    path = path.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\/?/i, '');
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    return { kind: 'host' };
  }
  if (/^git@/i.test(path)) {
    return { kind: 'host' };
  }

  path = path.split(/[?#]/, 1)[0] ?? '';
  path = path.replace(/\/+$/, '');
  if (!path) return { kind: 'invalid' };

  const parts = path.split('/').filter((p) => p.length > 0);
  if (parts.length === 0) return { kind: 'invalid' };

  const owner = parts[0];
  if (!SEGMENT.test(owner) || owner.includes('..')) return { kind: 'invalid' };

  if (parts.length === 1) {
    return { kind: 'account', account: owner };
  }

  const repoName = parts[1].replace(/\.git$/i, '');
  if (!SEGMENT.test(repoName) || repoName.includes('..')) {
    return { kind: 'invalid' };
  }

  return { kind: 'repo', repo: `${owner}/${repoName}` };
}

/** owner/name, or null when the input is not a single repository. */
export function normalizeRepo(input: string): string | null {
  const parsed = parseRepoInput(input);
  return parsed.kind === 'repo' ? parsed.repo : null;
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
