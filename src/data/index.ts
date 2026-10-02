/**
 * Aggregated site data built from fetchLedgerData().
 * Build fails loudly if the raw layer throws.
 */

import { computeGapBands, type GapBand } from './gaps';
import { resolvePinCommit, type ObjectRecord } from './objects';
import { fetchLedgerData } from './fetch';
import {
  describeFromTo,
  describeWhatChanged,
  effectiveClassification,
} from '../lib/what-changed';
import {
  CANARY_REPO,
  displayClassification,
  effectiveDisplayClassification,
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
export type { GapBand } from './gaps';

export type TraceEvent = {
  seq: number;
  repo: string;
  ref: string;
  tag: string;
  event: 'move' | 'deletion' | 'recreation';
  recorded_at: string;
  severity?: string;
  classification?: string | null;
  ref_form?: string | null;
  ancestry?: string | null;
  toCommit?: string;
  fromCommit?: string;
  fromTarget?: string;
  toTarget?: string;
  whatChanged?: string;
  fromToText?: string;
  isCanary: boolean;
};

export type CorrelationCaption = {
  seq: number;
  at: string;
  repo: string;
  caption: string;
  member_seqs: number[];
  tags: string[];
  targetShort?: string;
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
  /** Map corrects_seq → newest correction entry. */
  correctionsBySeq: Map<number, CorrectionEntry>;
  digests: ObservationDigestEntry[];
  populationChanges: PopulationChangeEntry[];
  heads: SignedHead[];
  observations: Observation[];
  watched: WatchedEntry[];
  repos: RepoView[];
  reposByName: Map<string, RepoView>;
  gaps: RecordedGap[];
  gapBands: GapBand[];
  seals: Seal[];
  traceEvents: TraceEvent[];
  correlationCaptions: CorrelationCaption[];
  genesisAt: string;
  buildTime: string;
  chainLength: number;
  signingKeyPrefix: string;
  signingKeyShort: string;
  latestRekor: { log_index: number; seq: number } | null;
  lastSealedDate: string | null;
  digestGapTotals: { skipped: number; failed: number };
  incidentsMd: string;
  publicKeyMd: string;
  methodMd: string;
  wallDefaultRepos: string[];
  ecosystemMovesLast7Days: number;
  pinStats: { total: number; pinned: number; unresolved: number };
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
  objects: Map<string, ObjectRecord>,
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
      const pin = resolvePinCommit(r, objects);
      tips.set(r.name, {
        name: r.name,
        ref_type: r.ref_type,
        target_sha: r.target_sha,
        commit_sha: r.commit_sha,
        tree_sha: r.tree_sha,
        action_yml_sha: r.action_yml_sha,
        pin_commit: pin,
        peeled: Boolean(pin),
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
  const { entries, heads, observations, watched, objects } = raw;
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
  const correctionsBySeq = new Map<number, CorrectionEntry>();
  for (const c of corrections) {
    const prev = correctionsBySeq.get(c.corrects_seq);
    if (!prev || c.seq > prev.seq) correctionsBySeq.set(c.corrects_seq, c);
  }
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

  const obsByRepo = new Map<string, Observation[]>();
  for (const o of observations) {
    const list = obsByRepo.get(o.repo) ?? [];
    list.push(o);
    obsByRepo.set(o.repo, list);
  }

  const repos: RepoView[] = repoOrder.map((repo) => {
    const meta = watchedMeta.get(repo);
    const ev = eventsByRepo.get(repo) ?? [];
    const obs = obsByRepo.get(repo) ?? [];
    const lastCheck =
      obs.length === 0
        ? null
        : [...obs].sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1))[0]
            .observed_at;
    const bindingTimes = ev
      .filter(
        (e) =>
          e.event === 'move' || e.event === 'deletion' || e.event === 'recreation',
      )
      .map((e) => e.recorded_at);
    const lastBinding =
      bindingTimes.length === 0
        ? null
        : bindingTimes.sort()[bindingTimes.length - 1];
    // Prefer earliest population_change added or watched.added_at.
    let watchedSince = meta?.added_at ?? null;
    for (const e of ev) {
      if (e.event === 'population_change' && e.population_change.change === 'added') {
        if (!watchedSince || e.recorded_at < watchedSince) {
          watchedSince = e.recorded_at;
        }
      }
    }
    return {
      repo,
      path: meta?.path,
      canary: isCanary(repo),
      watched_since: watchedSince,
      active: meta?.active ?? true,
      tags: buildTagTimelines(repo, ev, tipByRepo.get(repo), objects),
      entries: ev,
      checks_so_far: obs.length,
      last_check_at: lastCheck,
      last_change_at: lastBinding ?? lastCheck,
    };
  });
  const reposByName = new Map(repos.map((r) => [r.repo, r]));

  let pinStats = { total: 0, pinned: 0, unresolved: 0 };
  for (const r of repos) {
    for (const t of r.tags) {
      if (!t.tip) continue;
      pinStats.total += 1;
      if (t.tip.pin_commit) pinStats.pinned += 1;
      else pinStats.unresolved += 1;
    }
  }

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

  const gapBands = computeGapBands(observations, repoOrder);

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
    const correction = correctionsBySeq.get(e.seq) ?? null;
    const fromCommit = e.from?.commit_sha ?? e.from?.target_sha;
    const toCommit =
      e.event === 'deletion' ? undefined : e.to?.commit_sha ?? e.to?.target_sha;
    const fromTarget = e.from?.target_sha;
    const toTarget = e.event === 'deletion' ? undefined : e.to?.target_sha;
    const input = {
      event: e.event as 'move' | 'deletion' | 'recreation',
      classification: displayClassification(e),
      ref_form: 'ref_form' in e ? e.ref_form : null,
      ancestry: 'ancestry' in e ? e.ancestry : null,
      fromCommit,
      toCommit,
      fromTarget,
      toTarget,
    };
    const whatChanged = describeWhatChanged(input, correction);
    const fromTo = describeFromTo(input);
    traceEvents.push({
      seq: e.seq,
      repo: e.repo,
      ref: e.ref,
      tag: tagFromRef(e.ref),
      event: e.event,
      recorded_at: e.recorded_at,
      severity: e.severity,
      classification: effectiveClassification(input, correction),
      ref_form: input.ref_form ?? null,
      ancestry: input.ancestry ?? null,
      toCommit,
      fromCommit,
      fromTarget,
      toTarget,
      whatChanged,
      fromToText: fromTo.text,
      isCanary: isCanary(e.repo),
    });
  }
  traceEvents.sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1));

  const correlationCaptions: CorrelationCaption[] = correlations.map((c) => {
    const tags = (c.correlation.refs_moved_together ?? []).map(tagFromRef);
    const members = c.correlation.member_seqs
      .map((s) => entriesBySeq.get(s))
      .filter(Boolean) as LedgerEntry[];
    const target =
      members.find((m) => m.event === 'move' && 'to' in m)?.to?.commit_sha ??
      members.find((m) => m.event === 'move' && 'to' in m)?.to?.target_sha;
    const n = tags.length || c.correlation.refs_moved_together?.length || 0;
    const time = formatUtcClock(c.recorded_at);
    const form = describeTagForm(tags);
    const caption = `${n === 0 ? 'Several' : n === 1 ? 'One' : n === 2 ? 'Two' : n === 3 ? 'Three' : String(n)} ${form} moved to one new commit at ${time} UTC. Recorded as one correlation.`;
    return {
      seq: c.seq,
      at: c.recorded_at,
      repo: c.repo ?? '',
      caption,
      member_seqs: c.correlation.member_seqs,
      tags,
      targetShort: target ? target.slice(0, 7) : undefined,
    };
  });

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

  const lastSealedDate =
    seals.length > 0
      ? seals[seals.length - 1].digest.observation_digest.date
      : null;

  const pubkey =
    heads.find((h) => h.public_key)?.public_key ??
    'b3e7e795c35dee53731e039b76da930fc54e87e2edc632449a8a2e55252e276a';

  return {
    raw,
    entries,
    entriesBySeq,
    moves,
    deletions,
    recreations,
    correlations,
    corrections,
    correctionsBySeq,
    digests,
    populationChanges,
    heads,
    observations,
    watched,
    repos,
    reposByName,
    gaps,
    gapBands,
    seals,
    traceEvents,
    correlationCaptions,
    genesisAt: entries[0]?.recorded_at ?? buildTime,
    buildTime,
    chainLength: entries.length,
    signingKeyPrefix: pubkey.slice(0, 4),
    signingKeyShort: pubkey.slice(0, 32),
    latestRekor,
    lastSealedDate,
    digestGapTotals,
    incidentsMd: raw.incidents_md,
    publicKeyMd: raw.public_key_md,
    methodMd: raw.method_md,
    wallDefaultRepos,
    ecosystemMovesLast7Days,
    pinStats,
  };
}

function formatUtcClock(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function describeTagForm(tags: string[]): string {
  if (tags.length === 0) return 'tags';
  const exact = tags.every((t) => /^\d+\.\d+\.\d+$/.test(t) || /^v\d+\.\d+\.\d+$/.test(t));
  if (exact) return tags.length === 1 ? 'exact tag' : 'exact tags';
  return tags.length === 1 ? 'tag' : 'tags';
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

export { displayClassification, effectiveDisplayClassification, isCanary, CANARY_REPO, tagFromRef };
