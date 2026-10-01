/**
 * Aggregated site data built from fetchLedgerData().
 * Build fails loudly if the raw layer throws.
 */

import { fetchLedgerData } from './fetch';
import {
  CANARY_REPO,
  displayClassification,
  isCanary,
  type CorrectionEntry,
  type CorrelationEntry,
  type DeletionEntry,
  type LedgerEntry,
  type MoveEntry,
  type Observation,
  type ObservationDigestEntry,
  type PopulationChangeEntry,
  type RawLedgerData,
  type RecordedGap,
  type RecreationEntry,
  type RepoView,
  type Seal,
  type SignedHead,
  type TagBindingEvent,
  type TagTimeline,
  type TagTip,
  type WatchedEntry,
} from './types';

export * from './types';
export {
  fetchLedgerData,
  fetchFromFixtureRoot,
  ensureCaches,
  loadRawLedger,
} from './fetch';

export type TraceEvent = {
  seq: number;
  repo: string;
  ref: string;
  tag: string;
  event: 'move' | 'deletion' | 'recreation';
  recorded_at: string;
  severity?: string;
  toCommit?: string;
  fromCommit?: string;
  isCanary: boolean;
};

export type SiteData = {
  raw: RawLedgerData;
  entries: LedgerEntry[];
  entriesBySeq: Map<number, LedgerEntry>;
  moves: MoveEntry[];
  deletions: DeletionEntry[];
  recreations: RecreationEntry[];
  correlations: CorrelationEntry[];
  corrections: CorrectionEntry[];
  digests: ObservationDigestEntry[];
  populationChanges: PopulationChangeEntry[];
  heads: SignedHead[];
  observations: Observation[];
  watched: WatchedEntry[];
  repos: RepoView[];
  reposByName: Map<string, RepoView>;
  gaps: RecordedGap[];
  seals: Seal[];
  traceEvents: TraceEvent[];
  genesisAt: string;
  buildTime: string;
  chainLength: number;
  signingKeyPrefix: string;
  latestRekor: { log_index: number; seq: number } | null;
  digestGapTotals: { skipped: number; failed: number };
  incidentsMd: string;
  publicKeyMd: string;
  methodMd: string;
  wallDefaultRepos: string[];
  ecosystemMovesLast7Days: number;
};

function tagFromRef(ref: string): string {
  return ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ref;
}

export function shortSha(sha: string | undefined, n = 7): string {
  if (!sha) return '';
  return sha.slice(0, n);
}

export function repoParts(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split('/');
  return { owner, name };
}

function newestOkWithRefs(observations: Observation[]): Map<string, Observation> {
  const map = new Map<string, Observation>();
  const sorted = [...observations].sort((a, b) =>
    a.observed_at < b.observed_at ? -1 : a.observed_at > b.observed_at ? 1 : 0,
  );
  for (const o of sorted) {
    if (o.outcome.type === 'ok' && o.outcome.refs.length > 0) {
      map.set(o.repo, o);
    }
  }
  return map;
}

function classifySkip(reason: Observation['outcome'] extends { type: 'skipped'; reason: infer R }
  ? R
  : never): RecordedGap['kind'] {
  if (reason === 'budget_exhausted') return 'budget_exhausted';
  if (reason === 'secondary_limit_backoff') return 'secondary_limit_backoff';
  if (reason === 'shutdown_mid_sweep') return 'shutdown_mid_sweep';
  if (typeof reason === 'object' && reason && 'scheduler_lag' in reason) {
    return 'scheduler_lag';
  }
  if (typeof reason === 'object' && reason && 'poller_down' in reason) {
    return 'poller_down';
  }
  return 'other_skip';
}

function buildTagTimelines(
  repo: string,
  entries: LedgerEntry[],
  tipObs: Observation | undefined,
): TagTimeline[] {
  const byRef = new Map<string, TagBindingEvent[]>();

  for (const e of entries) {
    if (e.event === 'move' || e.event === 'deletion' || e.event === 'recreation') {
      if (e.repo !== repo) continue;
      const list = byRef.get(e.ref) ?? [];
      if (e.event === 'move') {
        list.push({
          kind: 'move',
          seq: e.seq,
          recorded_at: e.recorded_at,
          from: e.from,
          to: e.to,
        });
      } else if (e.event === 'deletion') {
        list.push({
          kind: 'deletion',
          seq: e.seq,
          recorded_at: e.recorded_at,
          from: e.from,
        });
      } else {
        list.push({
          kind: 'recreation',
          seq: e.seq,
          recorded_at: e.recorded_at,
          from: e.from,
          to: e.to,
          gap_seconds: e.gap_seconds,
        });
      }
      byRef.set(e.ref, list);
    }
  }

  const tips = new Map<string, TagTip>();
  if (tipObs?.outcome.type === 'ok') {
    for (const r of tipObs.outcome.refs) {
      tips.set(r.name, {
        name: r.name,
        ref_type: r.ref_type,
        target_sha: r.target_sha,
        commit_sha: r.commit_sha,
        tree_sha: r.tree_sha,
        action_yml_sha: r.action_yml_sha,
        peeled: Boolean(r.commit_sha),
        observed_at: tipObs.observed_at,
        observation_id: tipObs.observation_id,
      });
    }
  }

  const refs = new Set([...byRef.keys(), ...tips.keys()]);
  return [...refs]
    .sort()
    .map((ref) => ({
      ref,
      events: byRef.get(ref) ?? [],
      tip: tips.get(ref) ?? null,
    }));
}

function buildSiteData(raw: RawLedgerData): SiteData {
  const { entries, heads, observations, watched } = raw;
  const entriesBySeq = new Map(entries.map((e) => [e.seq, e]));
  const moves = entries.filter((e): e is MoveEntry => e.event === 'move');
  const deletions = entries.filter((e): e is DeletionEntry => e.event === 'deletion');
  const recreations = entries.filter(
    (e): e is RecreationEntry => e.event === 'recreation',
  );
  const correlations = entries.filter(
    (e): e is CorrelationEntry => e.event === 'correlation',
  );
  const corrections = entries.filter(
    (e): e is CorrectionEntry => e.event === 'correction',
  );
  const digests = entries.filter(
    (e): e is ObservationDigestEntry => e.event === 'observation_digest',
  );
  const populationChanges = entries.filter(
    (e): e is PopulationChangeEntry => e.event === 'population_change',
  );

  const tipByRepo = newestOkWithRefs(observations);

  const repoOrder: string[] = [];
  const seen = new Set<string>();
  for (const w of watched) {
    if (!seen.has(w.repo)) {
      seen.add(w.repo);
      repoOrder.push(w.repo);
    }
  }
  for (const e of entries) {
    if ('repo' in e && typeof e.repo === 'string' && !seen.has(e.repo)) {
      seen.add(e.repo);
      repoOrder.push(e.repo);
    }
  }

  const eventsByRepo = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    if (!('repo' in e) || typeof e.repo !== 'string') continue;
    const list = eventsByRepo.get(e.repo) ?? [];
    list.push(e);
    eventsByRepo.set(e.repo, list);
  }

  const watchedMeta = new Map<string, WatchedEntry>();
  for (const w of watched) {
    const prev = watchedMeta.get(w.repo);
    if (!prev || w.added_at < prev.added_at) watchedMeta.set(w.repo, w);
  }

  const repos: RepoView[] = repoOrder.map((repo) => {
    const meta = watchedMeta.get(repo);
    const ev = eventsByRepo.get(repo) ?? [];
    return {
      repo,
      path: meta?.path,
      canary: isCanary(repo),
      watched_since: meta?.added_at ?? null,
      active: meta?.active ?? true,
      tags: buildTagTimelines(repo, ev, tipByRepo.get(repo)),
      entries: ev,
    };
  });
  const reposByName = new Map(repos.map((r) => [r.repo, r]));

  const gaps: RecordedGap[] = [];
  for (const o of observations) {
    if (o.outcome.type !== 'skipped') continue;
    const kind = classifySkip(o.outcome.reason);
    const detail: Record<string, string> = {};
    const reason = o.outcome.reason;
    if (typeof reason === 'object' && reason) {
      for (const [k, v] of Object.entries(reason)) {
        detail[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    } else if (typeof reason === 'string') {
      detail.reason = reason;
    }
    gaps.push({
      kind,
      repo: o.repo,
      observed_at: o.observed_at,
      observation_id: o.observation_id,
      detail,
    });
  }

  const headBySeq = new Map<number, SignedHead>();
  for (const h of heads) {
    const prev = headBySeq.get(h.head.seq);
    if (!prev || (h.rekor?.log_index != null && prev.rekor?.log_index == null)) {
      headBySeq.set(h.head.seq, h);
    }
  }

  const seals: Seal[] = digests.map((digest) => {
    const head = headBySeq.get(digest.seq) ?? null;
    return {
      digest,
      head,
      rekor_log_index: head?.rekor?.log_index ?? null,
    };
  });

  const traceEvents: TraceEvent[] = [];
  for (const e of [...moves, ...deletions, ...recreations]) {
    traceEvents.push({
      seq: e.seq,
      repo: e.repo,
      ref: e.ref,
      tag: tagFromRef(e.ref),
      event: e.event,
      recorded_at: e.recorded_at,
      severity: e.severity,
      toCommit: e.to?.commit_sha ?? e.to?.target_sha,
      fromCommit: e.from?.commit_sha ?? e.from?.target_sha,
      isCanary: isCanary(e.repo),
    });
  }
  traceEvents.sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1));

  const buildTime = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const ecosystemMovesLast7Days = traceEvents.filter(
    (t) => !t.isCanary && t.event === 'move' && t.recorded_at >= sevenDaysAgo,
  ).length;

  const nonCanary = repoOrder.filter((r) => !isCanary(r));
  const movedRepos = new Set(
    traceEvents.filter((t) => !t.isCanary).map((t) => t.repo),
  );
  const wallDefaultRepos: string[] = [];
  for (const r of nonCanary) {
    if (movedRepos.has(r) && !wallDefaultRepos.includes(r)) wallDefaultRepos.push(r);
  }
  for (const r of nonCanary) {
    if (wallDefaultRepos.length >= 12) break;
    if (!wallDefaultRepos.includes(r)) wallDefaultRepos.push(r);
  }

  let digestGapTotals = { skipped: 0, failed: 0 };
  for (const d of digests) {
    digestGapTotals.skipped += d.observation_digest.skipped;
    digestGapTotals.failed += d.observation_digest.failed;
  }

  let latestRekor: SiteData['latestRekor'] = null;
  for (const h of [...heads].reverse()) {
    if (h.rekor?.log_index != null) {
      latestRekor = { log_index: h.rekor.log_index, seq: h.head.seq };
      break;
    }
  }

  return {
    raw,
    entries,
    entriesBySeq,
    moves,
    deletions,
    recreations,
    correlations,
    corrections,
    digests,
    populationChanges,
    heads,
    observations,
    watched,
    repos,
    reposByName,
    gaps,
    seals,
    traceEvents,
    genesisAt: entries[0]?.recorded_at ?? buildTime,
    buildTime,
    chainLength: entries.length,
    signingKeyPrefix: 'b3e7',
    latestRekor,
    digestGapTotals,
    incidentsMd: raw.incidents_md,
    publicKeyMd: raw.public_key_md,
    methodMd: raw.method_md,
    wallDefaultRepos,
    ecosystemMovesLast7Days,
  };
}

let cached: SiteData | null = null;

export function getSiteData(root?: string): SiteData {
  if (!cached) {
    cached = buildSiteData(
      fetchLedgerData(root ? { root, allowClone: false } : undefined),
    );
  }
  return cached;
}

/** Build aggregations from already-parsed raw data (fixtures / tests). */
export function buildIndex(raw: RawLedgerData): SiteData {
  return buildSiteData(raw);
}

/** Ecosystem move count helper (excludes canary). */
export function ecosystemMovesLast7DaysCount(
  data: SiteData = getSiteData(),
): number {
  return data.ecosystemMovesLast7Days;
}

/**
 * Trace-wall entrée repos: seed/watched order, promote any with moves,
 * cap at `limit`. Canary excluded.
 */
export function topWallEntree(
  data: SiteData,
  limit = 12,
): string[] {
  return data.wallDefaultRepos.slice(0, limit);
}

/** @see topWallEntree */
export function topWallEntrée(data: SiteData, limit = 12): string[] {
  return topWallEntree(data, limit);
}

export function ecosystemMovesLast7Days(
  data: SiteData,
  now: Date = new Date(),
): MoveEntry[] {
  const cutoff = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  return data.moves
    .filter((m) => !isCanary(m.repo) && m.recorded_at >= cutoff)
    .sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1));
}

export function getEntry(seq: number): LedgerEntry | undefined {
  return getSiteData().entriesBySeq.get(seq);
}

export function getRepo(owner: string, name: string): RepoView | undefined {
  return getSiteData().reposByName.get(`${owner}/${name}`);
}

export function movedInLastDays(days: number, includeCanary = false): TraceEvent[] {
  const data = getSiteData();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  return data.traceEvents.filter(
    (t) => t.recorded_at >= since && (includeCanary || !t.isCanary),
  );
}

export function ecosystemSentence(): string {
  const n = getSiteData().ecosystemMovesLast7Days;
  if (n === 0) return 'No ecosystem tag has moved since genesis.';
  return `${n} ecosystem tag${n === 1 ? '' : 's'} moved in the last 7 days.`;
}

export { displayClassification, isCanary, CANARY_REPO, tagFromRef };
