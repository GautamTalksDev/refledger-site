/**
 * Build-time data fetch for the Refledger site.
 * Prefers `.cache/refledger-{data,main}`; otherwise shallow-clones from GitHub.
 * Parse errors throw — never partial or guessed data.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import type {
  LedgerEntry,
  Observation,
  RawLedgerData,
  SignedHead,
  WatchedEntry,
} from './types';
import { loadObjectCache } from './objects';

const REPO_URL = 'https://github.com/GautamTalksDev/refledger.git';

export type FetchOptions = {
  /** Site root (directory containing `.cache/`). Defaults to process.cwd(). */
  root?: string;
  /** Allow network clone when cache is missing. Default true. */
  allowClone?: boolean;
};

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function shallowClone(url: string, branch: string, dest: string): void {
  ensureDir(join(dest, '..'));
  if (existsSync(dest)) {
    execFileSync('git', ['-C', dest, 'fetch', '--depth', '1', 'origin', branch], {
      stdio: 'inherit',
    });
    execFileSync('git', ['-C', dest, 'checkout', '-f', 'FETCH_HEAD'], {
      stdio: 'inherit',
    });
    return;
  }
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--branch', branch, '--single-branch', url, dest],
    { stdio: 'inherit' },
  );
}

function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

function parseJsonlLine<T>(line: string, source: string, lineNo: number): T {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error(`${source}:${lineNo}: empty line in JSONL`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${source}:${lineNo}: JSON parse failed: ${msg}`);
  }
}

function readJsonlFile<T>(path: string): T[] {
  const text = readFileSync(path, 'utf8');
  // Allow a trailing newline; reject otherwise-empty files that are not valid JSONL rows.
  const rawLines = text.split('\n');
  const rows: T[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim() === '') {
      // Trailing or blank separators are fine; skip.
      continue;
    }
    rows.push(parseJsonlLine<T>(line, path, i + 1));
  }
  return rows;
}

function assertEntry(raw: unknown, source: string): LedgerEntry {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`${source}: entry is not an object`);
  }
  const o = raw as Record<string, unknown>;
  if (o.format_version !== 1) {
    throw new Error(`${source}: format_version must be 1, got ${String(o.format_version)}`);
  }
  if (typeof o.seq !== 'number' || !Number.isInteger(o.seq)) {
    throw new Error(`${source}: seq must be an integer`);
  }
  if (typeof o.event !== 'string') {
    throw new Error(`${source}: missing event`);
  }
  if (typeof o.entry_hash !== 'string' || typeof o.prev_hash !== 'string') {
    throw new Error(`${source}: missing entry_hash or prev_hash`);
  }
  if (typeof o.recorded_at !== 'string') {
    throw new Error(`${source}: missing recorded_at`);
  }
  return raw as LedgerEntry;
}

function assertHead(raw: unknown, source: string): SignedHead {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`${source}: head line is not an object`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.signature !== 'string' || typeof o.public_key !== 'string') {
    throw new Error(`${source}: head missing signature or public_key`);
  }
  if (typeof o.key_id !== 'string') {
    throw new Error(`${source}: head missing key_id`);
  }
  if (o.head === null || typeof o.head !== 'object') {
    throw new Error(`${source}: head missing head object`);
  }
  const h = o.head as Record<string, unknown>;
  if (typeof h.seq !== 'number' || typeof h.entry_hash !== 'string') {
    throw new Error(`${source}: head object missing seq or entry_hash`);
  }
  if (typeof h.recorded_at !== 'string' || typeof h.log_id !== 'string') {
    throw new Error(`${source}: head object missing recorded_at or log_id`);
  }
  return raw as SignedHead;
}

function assertObservation(raw: unknown, source: string): Observation {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`${source}: observation is not an object`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.observation_id !== 'string' || typeof o.repo !== 'string') {
    throw new Error(`${source}: observation missing id or repo`);
  }
  if (typeof o.observed_at !== 'string') {
    throw new Error(`${source}: observation missing observed_at`);
  }
  if (o.outcome === null || typeof o.outcome !== 'object') {
    throw new Error(`${source}: observation missing outcome`);
  }
  const outcome = o.outcome as Record<string, unknown>;
  if (typeof outcome.type !== 'string') {
    throw new Error(`${source}: observation outcome missing type`);
  }
  return raw as Observation;
}

function assertWatched(raw: unknown, source: string): WatchedEntry {
  if (raw === null || typeof raw !== 'object') {
    throw new Error(`${source}: watched entry is not an object`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.repo !== 'string') {
    throw new Error(`${source}: watched entry missing repo`);
  }
  if (typeof o.added_at !== 'string') {
    throw new Error(`${source}: watched entry missing added_at`);
  }
  if (typeof o.active !== 'boolean') {
    throw new Error(`${source}: watched entry missing active`);
  }
  if (o.reason === null || typeof o.reason !== 'object') {
    throw new Error(`${source}: watched entry missing reason`);
  }
  return raw as WatchedEntry;
}

function resolveCacheDirs(root: string): { dataDir: string; mainDir: string } {
  return {
    dataDir: join(root, '.cache', 'refledger-data'),
    mainDir: join(root, '.cache', 'refledger-main'),
  };
}

/**
 * Ensure cache clones exist (refresh via shallow clone/fetch when allowed).
 */
export function ensureCaches(options: FetchOptions = {}): {
  dataDir: string;
  mainDir: string;
} {
  const root = options.root ?? process.cwd();
  const { dataDir, mainDir } = resolveCacheDirs(root);
  const allowClone = options.allowClone !== false;

  const dataOk = existsSync(join(dataDir, 'log'));
  const mainOk =
    existsSync(join(mainDir, 'population', 'watched.jsonl')) ||
    existsSync(join(mainDir, 'docs', 'PUBLIC-KEY.md'));

  if (!dataOk || !mainOk) {
    if (!allowClone) {
      throw new Error(
        `Missing .cache clones under ${root}. Run scripts/fetch-data.mjs first.`,
      );
    }
    if (!dataOk) shallowClone(REPO_URL, 'data', dataDir);
    if (!mainOk) shallowClone(REPO_URL, 'main', mainDir);
  }

  return { dataDir, mainDir };
}

function loadDayEntries(logDir: string): LedgerEntry[] {
  const files = listFilesRecursive(logDir)
    .filter((p) => p.endsWith('.jsonl') && !p.endsWith('heads.jsonl'))
    .sort();
  if (files.length === 0) {
    throw new Error(`No day JSONL files under ${logDir}`);
  }
  const entries: LedgerEntry[] = [];
  for (const file of files) {
    const rel = relative(logDir, file);
    // Expect YYYY/MM/DD.jsonl
    if (!/^\d{4}\/\d{2}\/\d{2}\.jsonl$/.test(rel.replace(/\\/g, '/'))) {
      // Non-chain files under log/ are ignored by the CLI verifier; we skip similarly
      // but only accept dated day files for the site data layer.
      continue;
    }
    const rows = readJsonlFile<unknown>(file);
    for (let i = 0; i < rows.length; i++) {
      entries.push(assertEntry(rows[i], `${file}:${i + 1}`));
    }
  }
  entries.sort((a, b) => a.seq - b.seq);
  return entries;
}

function loadHeads(logDir: string): SignedHead[] {
  const path = join(logDir, 'heads.jsonl');
  if (!existsSync(path)) {
    return [];
  }
  const rows = readJsonlFile<unknown>(path);
  return rows.map((row, i) => assertHead(row, `${path}:${i + 1}`));
}

function loadObservations(obsDir: string): Observation[] {
  if (!existsSync(obsDir)) {
    return [];
  }
  const files = listFilesRecursive(obsDir)
    .filter((p) => p.endsWith('.jsonl'))
    .sort();
  const out: Observation[] = [];
  for (const file of files) {
    const rows = readJsonlFile<unknown>(file);
    for (let i = 0; i < rows.length; i++) {
      out.push(assertObservation(rows[i], `${file}:${i + 1}`));
    }
  }
  return out;
}

function loadWatched(path: string): WatchedEntry[] {
  if (!existsSync(path)) {
    throw new Error(`Missing watched population file: ${path}`);
  }
  const rows = readJsonlFile<unknown>(path);
  return rows.map((row, i) => assertWatched(row, `${path}:${i + 1}`));
}

function readMarkdown(path: string, required: boolean): string {
  if (!existsSync(path)) {
    if (required) throw new Error(`Missing required file: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

/**
 * Load and parse all site inputs. Throws on any parse/validation error.
 */
export function fetchLedgerData(options: FetchOptions = {}): RawLedgerData {
  const root = options.root ?? process.cwd();
  const { dataDir, mainDir } = ensureCaches({ ...options, root });

  const logDir = join(dataDir, 'log');
  const obsDir = join(dataDir, 'observations');
  const watchedPath = join(mainDir, 'population', 'watched.jsonl');
  const incidentsPath = join(mainDir, 'docs', 'INCIDENTS.md');
  const publicKeyPath = join(mainDir, 'docs', 'PUBLIC-KEY.md');
  const methodPath = join(mainDir, 'population', 'METHOD.md');

  if (!existsSync(logDir)) {
    throw new Error(`Log directory missing: ${logDir}`);
  }

  const entries = loadDayEntries(logDir);
  const heads = loadHeads(logDir);
  const observations = loadObservations(obsDir);
  const watched = loadWatched(watchedPath);
  const incidents_md = readMarkdown(incidentsPath, true);
  const public_key_md = readMarkdown(publicKeyPath, true);
  const method_md = readMarkdown(methodPath, true);
  const objects = loadObjectCache(dataDir);

  return {
    entries,
    heads,
    observations,
    watched,
    incidents_md,
    public_key_md,
    method_md,
    objects,
  };
}

/** Alias used by tests and scripts. */
export function loadRawLedger(root?: string): RawLedgerData {
  return fetchLedgerData({ root: root ?? process.cwd(), allowClone: false });
}

/**
 * Parse fixtures from an arbitrary layout (tests). Expects:
 *   root/log/**, root/log/heads.jsonl, root/observations/**, root/population/watched.jsonl
 * Markdown files optional for fixture tests.
 */
export function fetchFromFixtureRoot(fixtureRoot: string): RawLedgerData {
  const logDir = join(fixtureRoot, 'log');
  const obsDir = join(fixtureRoot, 'observations');
  const watchedPath = join(fixtureRoot, 'population', 'watched.jsonl');

  if (!existsSync(logDir)) {
    throw new Error(`Fixture log directory missing: ${logDir}`);
  }

  return {
    entries: loadDayEntries(logDir),
    heads: loadHeads(logDir),
    observations: loadObservations(obsDir),
    watched: loadWatched(watchedPath),
    incidents_md: readMarkdown(join(fixtureRoot, 'INCIDENTS.md'), false),
    public_key_md: readMarkdown(join(fixtureRoot, 'PUBLIC-KEY.md'), false),
    method_md: readMarkdown(join(fixtureRoot, 'METHOD.md'), false),
    objects: loadObjectCache(fixtureRoot),
  };
}
