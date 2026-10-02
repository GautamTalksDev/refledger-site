/**
 * Static /api/v1 payload builders. Facts only; no verdict fields.
 */

import {
  getSiteData,
  shortSha,
  tagFromRef,
  type Binding,
  type RepoView,
  type SiteData,
  type TraceEvent,
} from '../data';
import { describeWhatChanged, describeFromTo } from './what-changed';

export type ApiIndex = {
  api_version: 'v1';
  build_time: string;
  ledger_tip_seq: number;
  last_seal_date: string | null;
  public_key: string;
  population: {
    action_count: number;
    repository_count: number;
    canary_repo: string;
  };
  genesis_at: string;
  chain_length: number;
};

export type ApiBinding = {
  target_sha: string;
  commit_sha: string;
  tree_sha: string;
  first_observed: string;
  last_observed?: string;
  observation_count: number;
  stable_days: number;
  action_yml_sha?: string;
};

export type ApiTagEvent = {
  seq: number;
  event: string;
  recorded_at: string;
  observation_window_seconds?: number;
  what_changed: string;
  from_to: string;
  classification?: string | null;
  ref_form?: string | null;
  ancestry?: string | null;
  severity?: string | null;
  from?: ApiBinding;
  to?: ApiBinding | null;
};

export type ApiTag = {
  tag: string;
  ref: string;
  current: ApiBinding | null;
  pin_commit: string | null;
  ref_type?: string;
  history: ApiTagEvent[];
};

export type ApiAction = {
  api_version: 'v1';
  repo: string;
  canary: boolean;
  watched_since: string | null;
  checks_so_far: number;
  last_change_at: string | null;
  tags: ApiTag[];
};

export type ApiAtSnapshot = {
  api_version: 'v1';
  as_of: string;
  as_of_utc: string;
  bindings: {
    repo: string;
    tag: string;
    target_sha: string | null;
    commit_sha: string | null;
    tree_sha: string | null;
    ref_type?: string;
    source: 'observation' | 'event' | 'absent';
    evidence_seqs: number[];
    observation_ids: string[];
  }[];
};

export type ApiMoved = {
  api_version: 'v1';
  generated_at: string;
  events: {
    seq: number;
    repo: string;
    tag: string;
    event: string;
    recorded_at: string;
    what_changed: string;
    from_to: string;
    canary: boolean;
    observation_window_seconds?: number;
  }[];
};

function bindingApi(b: Binding): ApiBinding {
  return {
    target_sha: b.target_sha,
    commit_sha: b.commit_sha,
    tree_sha: b.tree_sha,
    first_observed: b.first_observed,
    last_observed: b.last_observed,
    observation_count: b.observation_count,
    stable_days: b.stable_days,
    action_yml_sha: b.action_yml_sha,
  };
}

function populationCounts(data: SiteData) {
  const CANARY = 'GautamTalksDev/canary';
  const keys = data.watched.filter((w) => w.active && w.repo !== CANARY);
  return {
    action_count: new Set(keys.map((w) => `${w.repo}#${w.path ?? ''}`)).size,
    repository_count: new Set(keys.map((w) => w.repo)).size,
    canary_repo: CANARY,
  };
}

export function buildIndex(data: SiteData = getSiteData()): ApiIndex {
  return {
    api_version: 'v1',
    build_time: data.buildTime,
    ledger_tip_seq: Math.max(0, data.chainLength - 1),
    last_seal_date: data.lastSealedDate,
    public_key: data.signingKeyPrefix,
    population: populationCounts(data),
    genesis_at: data.genesisAt,
    chain_length: data.chainLength,
  };
}

function tagEventsFor(
  data: SiteData,
  repo: RepoView,
  ref: string,
): ApiTagEvent[] {
  const out: ApiTagEvent[] = [];
  for (const e of repo.entries) {
    if (!('ref' in e) || e.ref !== ref) continue;
    if (e.event !== 'move' && e.event !== 'deletion' && e.event !== 'recreation')
      continue;
    const correction = data.correctionsBySeq.get(e.seq) ?? null;
    const { phrase, fromTo, classification } = (() => {
      const input = {
        event: e.event as 'move' | 'deletion' | 'recreation',
        classification: 'classification' in e ? e.classification : null,
        ref_form: 'ref_form' in e ? e.ref_form : null,
        ancestry: 'ancestry' in e ? e.ancestry : null,
        fromCommit: e.from?.commit_sha,
        toCommit: e.event === 'deletion' ? null : e.to?.commit_sha,
        fromTarget: e.from?.target_sha,
        toTarget: e.event === 'deletion' ? null : e.to?.target_sha,
      };
      return {
        phrase: describeWhatChanged(input, correction),
        fromTo: describeFromTo(input),
        classification: input.classification,
      };
    })();
    out.push({
      seq: e.seq,
      event: e.event,
      recorded_at: e.recorded_at,
      observation_window_seconds:
        'observation_window_seconds' in e
          ? e.observation_window_seconds
          : undefined,
      what_changed: phrase,
      from_to: fromTo.text,
      classification:
        fromTo.sameCommit ? 'release_level_only' : classification ?? null,
      ref_form: 'ref_form' in e ? e.ref_form ?? null : null,
      ancestry: 'ancestry' in e ? e.ancestry ?? null : null,
      severity: 'severity' in e ? e.severity ?? null : null,
      from: e.from ? bindingApi(e.from) : undefined,
      to: e.event === 'deletion' ? null : e.to ? bindingApi(e.to) : null,
    });
  }
  out.sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1));
  return out;
}

export function buildAction(
  owner: string,
  name: string,
  data: SiteData = getSiteData(),
): ApiAction | null {
  const repo = data.reposByName.get(`${owner}/${name}`);
  if (!repo) return null;
  const tags: ApiTag[] = repo.tags.map((t) => {
    const tag = tagFromRef(t.ref);
    const tip = t.tip;
    const current: ApiBinding | null = tip
      ? {
          target_sha: tip.target_sha,
          commit_sha: tip.commit_sha ?? tip.target_sha,
          tree_sha: tip.tree_sha ?? '',
          first_observed: tip.observed_at,
          observation_count: 1,
          stable_days: 0,
          action_yml_sha: tip.action_yml_sha,
        }
      : null;
    return {
      tag,
      ref: t.ref,
      current,
      pin_commit: tip?.pin_commit ?? null,
      ref_type: tip?.ref_type,
      history: tagEventsFor(data, repo, t.ref),
    };
  });
  return {
    api_version: 'v1',
    repo: repo.repo,
    canary: repo.canary,
    watched_since: repo.watched_since,
    checks_so_far: repo.checks_so_far,
    last_change_at: repo.last_change_at,
    tags,
  };
}

export function buildTag(
  owner: string,
  name: string,
  tag: string,
  data: SiteData = getSiteData(),
) {
  const action = buildAction(owner, name, data);
  if (!action) return null;
  const found = action.tags.find((t) => t.tag === tag);
  if (!found) return null;
  return {
    api_version: 'v1' as const,
    repo: action.repo,
    canary: action.canary,
    ...found,
  };
}

/**
 * Replay bindings at 00:00 UTC on date (YYYY-MM-DD).
 * Prefer Ok observation tips at/before that instant; fall back to last
 * move/recreation before that time; deletions clear the tip.
 */
export function buildAt(
  date: string,
  data: SiteData = getSiteData(),
): ApiAtSnapshot {
  const asOf = `${date}T00:00:00.000Z`;
  const asOfMs = new Date(asOf).getTime();
  const bindings: ApiAtSnapshot['bindings'] = [];

  // Newest Ok observation per repo at/before asOf
  const tipObsByRepo = new Map<string, (typeof data.observations)[number]>();
  for (const o of data.observations) {
    if (o.outcome.type !== 'ok') continue;
    if (new Date(o.observed_at).getTime() > asOfMs) continue;
    const prev = tipObsByRepo.get(o.repo);
    if (!prev || o.observed_at > prev.observed_at) tipObsByRepo.set(o.repo, o);
  }

  for (const repo of data.repos) {
    const tipObs = tipObsByRepo.get(repo.repo);
    for (const timeline of repo.tags) {
      const tag = tagFromRef(timeline.ref);
      let target: string | null = null;
      let commit: string | null = null;
      let tree: string | null = null;
      let refType: string | undefined;
      let source: 'observation' | 'event' | 'absent' = 'absent';
      const evidence_seqs: number[] = [];
      const observation_ids: string[] = [];

      const events = [...timeline.events].sort((a, b) =>
        a.recorded_at < b.recorded_at ? -1 : 1,
      );
      for (const ev of events) {
        if (new Date(ev.recorded_at).getTime() > asOfMs) break;
        evidence_seqs.push(ev.seq);
        if (ev.kind === 'deletion') {
          target = null;
          commit = null;
          tree = null;
          source = 'event';
        } else {
          target = ev.to.target_sha;
          commit = ev.to.commit_sha;
          tree = ev.to.tree_sha;
          source = 'event';
        }
      }

      if (tipObs && tipObs.outcome.type === 'ok') {
        const ref = tipObs.outcome.refs.find(
          (r) => r.name === tag || `refs/tags/${r.name}` === timeline.ref,
        );
        if (ref) {
          target = ref.target_sha;
          commit = ref.commit_sha ?? ref.target_sha;
          tree = ref.tree_sha ?? null;
          refType = ref.ref_type;
          source = 'observation';
          observation_ids.push(tipObs.observation_id);
        }
      }

      bindings.push({
        repo: repo.repo,
        tag,
        target_sha: target,
        commit_sha: commit,
        tree_sha: tree,
        ref_type: refType,
        source,
        evidence_seqs,
        observation_ids,
      });
    }
  }

  return {
    api_version: 'v1',
    as_of: date,
    as_of_utc: asOf,
    bindings,
  };
}

export function buildMoved(data: SiteData = getSiteData()): ApiMoved {
  const events = data.traceEvents.map((ev: TraceEvent) => {
    const entry = data.entriesBySeq.get(ev.seq);
    const window =
      entry && 'observation_window_seconds' in entry
        ? entry.observation_window_seconds
        : undefined;
    return {
      seq: ev.seq,
      repo: ev.repo,
      tag: ev.tag,
      event: ev.event,
      recorded_at: ev.recorded_at,
      what_changed: ev.whatChanged ?? ev.event,
      from_to: ev.fromToText ?? '',
      canary: ev.isCanary,
      observation_window_seconds: window,
    };
  });
  return {
    api_version: 'v1',
    generated_at: data.buildTime,
    events,
  };
}

export function listAtDates(data: SiteData = getSiteData()): string[] {
  const dates = new Set<string>();
  for (const s of data.seals) {
    dates.add(s.digest.observation_digest.date);
  }
  // Also include genesis day and build day for scrubber coverage
  if (data.genesisAt) dates.add(data.genesisAt.slice(0, 10));
  if (data.buildTime) dates.add(data.buildTime.slice(0, 10));
  return [...dates].sort();
}

export { shortSha };
