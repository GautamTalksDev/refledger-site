import type { Observation } from './types';

export type GapBand = {
  start: string;
  end: string;
  label: string;
  kind: string;
  /** Empty means all visible lines; otherwise only these repos. */
  repos: string[];
};

const MERGE_MS = 8 * 60 * 1000; // cluster nearby skip/fail moments
const SILENCE_MS = 15 * 60 * 1000; // population-wide silence = poller down

function kindFromOutcome(o: Observation): string {
  if (o.outcome.type === 'failed') return 'failed';
  const reason = o.outcome.type === 'skipped' ? o.outcome.reason : undefined;
  if (reason === 'budget_exhausted') return 'budget';
  if (reason === 'secondary_limit_backoff') return 'SecondaryLimitBackoff';
  if (reason === 'shutdown_mid_sweep') return 'shutdown';
  if (typeof reason === 'object' && reason) {
    if ('scheduler_lag' in reason) return 'SchedulerLag';
    if ('poller_down' in reason) return 'PollerDown';
  }
  return 'skipped';
}

function labelFor(kind: string): string {
  if (kind === 'PollerDown' || kind === 'silence') return 'gap';
  if (kind === 'failed') return 'failed';
  if (kind === 'budget') return 'budget';
  if (kind === 'SchedulerLag') return 'lag';
  if (kind === 'SecondaryLimitBackoff') return 'backoff';
  return 'gap';
}

/**
 * Build wall gap bands from skipped/failed observations and from
 * population-wide silence (covers the 2026-10-01 enrich outage).
 */
export function computeGapBands(
  observations: Observation[],
  allRepos: string[],
): GapBand[] {
  const events: { at: string; repo: string; kind: string }[] = [];
  for (const o of observations) {
    if (o.outcome.type === 'skipped' || o.outcome.type === 'failed') {
      events.push({
        at: o.observed_at,
        repo: o.repo,
        kind: kindFromOutcome(o),
      });
    }
  }
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const bands: GapBand[] = [];

  // Cluster skip/fail into bands.
  type Acc = {
    start: string;
    end: string;
    kind: string;
    repos: Set<string>;
  };
  let acc: Acc | null = null;
  for (const e of events) {
    if (!acc) {
      acc = {
        start: e.at,
        end: e.at,
        kind: e.kind,
        repos: new Set([e.repo]),
      };
      continue;
    }
    const gap = new Date(e.at).getTime() - new Date(acc.end).getTime();
    if (gap <= MERGE_MS) {
      acc.end = e.at;
      acc.repos.add(e.repo);
      // Prefer PollerDown / failed as the band kind when mixed.
      if (e.kind === 'PollerDown' || e.kind === 'failed') acc.kind = e.kind;
    } else {
      bands.push({
        start: acc.start,
        end: acc.end,
        kind: acc.kind,
        label: labelFor(acc.kind),
        repos: [...acc.repos],
      });
      acc = {
        start: e.at,
        end: e.at,
        kind: e.kind,
        repos: new Set([e.repo]),
      };
    }
  }
  if (acc) {
    bands.push({
      start: acc.start,
      end: acc.end,
      kind: acc.kind,
      label: labelFor(acc.kind),
      repos: [...acc.repos],
    });
  }

  // Population-wide silence between any consecutive observation times.
  const allTimes = [
    ...new Set(observations.map((o) => o.observed_at)),
  ].sort();
  for (let i = 1; i < allTimes.length; i++) {
    const prev = allTimes[i - 1];
    const next = allTimes[i];
    const dt = new Date(next).getTime() - new Date(prev).getTime();
    if (dt >= SILENCE_MS) {
      // Start a few minutes after last success to match recorded outage shape.
      const startMs = new Date(prev).getTime() + 60_000;
      const endMs = new Date(next).getTime();
      if (endMs - startMs < SILENCE_MS * 0.5) continue;
      const start = new Date(startMs).toISOString();
      const end = next;
      // Avoid duplicating an existing band that already covers this window.
      const covered = bands.some(
        (b) => b.start <= start && b.end >= end && b.repos.length === 0,
      );
      if (!covered) {
        bands.push({
          start,
          end,
          kind: 'silence',
          label: 'gap',
          repos: [...allRepos], // all watched lines
        });
      }
    }
  }

  // Merge overlapping all-repo silence with nearby bands for display.
  bands.sort((a, b) => (a.start < b.start ? -1 : 1));
  return bands;
}
