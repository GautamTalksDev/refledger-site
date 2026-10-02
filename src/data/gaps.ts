import type { Observation } from './types';

export type GapSource = 'recorded' | 'inferred';

export type GapBand = {
  start: string;
  end: string;
  label: string;
  kind: string;
  /** Empty means all visible lines; otherwise only these repos. */
  repos: string[];
  /** recorded = Skipped/Failed observations; inferred = missing checks. */
  source: GapSource;
};

const MERGE_MS = 8 * 60 * 1000; // cluster nearby skip/fail moments
const SILENCE_MS = 15 * 60 * 1000; // population-wide silence

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

/** Plain labels for recorded gaps. Never use unexplained "lag". */
function labelForRecorded(kind: string): string {
  if (kind === 'failed') return 'failed';
  if (kind === 'budget') return 'budget';
  if (kind === 'SecondaryLimitBackoff') return 'backoff';
  if (kind === 'PollerDown') return 'poller down';
  if (kind === 'SchedulerLag') return 'skipped';
  if (kind === 'shutdown') return 'shutdown';
  return 'skipped';
}

/**
 * Build wall gap bands.
 * Recorded: Skipped and Failed observations only (hatched).
 * Inferred: population-wide silence ("No checks seen", never hatched as recorded).
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
      if (e.kind === 'PollerDown' || e.kind === 'failed') acc.kind = e.kind;
    } else {
      bands.push({
        start: acc.start,
        end: acc.end,
        kind: acc.kind,
        label: labelForRecorded(acc.kind),
        repos: [...acc.repos],
        source: 'recorded',
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
      label: labelForRecorded(acc.kind),
      repos: [...acc.repos],
      source: 'recorded',
    });
  }

  // Inferred: population-wide silence between consecutive observation times.
  const allTimes = [
    ...new Set(observations.map((o) => o.observed_at)),
  ].sort();
  for (let i = 1; i < allTimes.length; i++) {
    const prev = allTimes[i - 1];
    const next = allTimes[i];
    const dt = new Date(next).getTime() - new Date(prev).getTime();
    if (dt >= SILENCE_MS) {
      const startMs = new Date(prev).getTime() + 60_000;
      const endMs = new Date(next).getTime();
      if (endMs - startMs < SILENCE_MS * 0.5) continue;
      const start = new Date(startMs).toISOString();
      const end = next;
      const covered = bands.some(
        (b) =>
          b.source === 'inferred' &&
          b.start <= start &&
          b.end >= end &&
          b.repos.length >= allRepos.length,
      );
      if (!covered) {
        bands.push({
          start,
          end,
          kind: 'silence',
          label: 'No checks seen',
          repos: [...allRepos],
          source: 'inferred',
        });
      }
    }
  }

  bands.sort((a, b) => (a.start < b.start ? -1 : 1));
  return bands;
}

export function recordedGaps(bands: GapBand[]): GapBand[] {
  return bands.filter((b) => b.source === 'recorded');
}

export function inferredGaps(bands: GapBand[]): GapBand[] {
  return bands.filter((b) => b.source === 'inferred');
}
