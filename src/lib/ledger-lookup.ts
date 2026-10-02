import type { SiteData } from '../data';
import type { LedgerLookup, MoveInfo } from './check-workflow';

/** Build browser check lookup from the published ledger snapshot. */
export function buildLedgerLookup(data: SiteData, nowMs = Date.now()): LedgerLookup {
  const watched = new Set(
    data.watched.filter((w) => w.active).map((w) => w.repo),
  );

  const moves = new Map<string, Map<string, MoveInfo>>();
  for (const ev of data.traceEvents) {
    if (ev.event !== 'move' && ev.event !== 'recreation') continue;
    let byTag = moves.get(ev.repo);
    if (!byTag) {
      byTag = new Map();
      moves.set(ev.repo, byTag);
    }
    // Keep newest move per tag
    const prev = byTag.get(ev.tag);
    const at = new Date(ev.recorded_at).getTime();
    if (prev && prev.at >= at) continue;
    byTag.set(ev.tag, {
      at,
      from: (ev.fromCommit ?? ev.fromTarget ?? '').slice(0, 8),
      to: (ev.toCommit ?? ev.toTarget ?? '').slice(0, 8),
      what: ev.whatChanged ?? ev.event,
      sev: ev.severity,
      entry: ev.seq,
    });
  }

  const known = new Map<string, string>();
  for (const repo of data.repos) {
    for (const t of repo.tags) {
      const tip = t.tip;
      if (!tip?.pin_commit) continue;
      const tag = t.ref.replace(/^refs\/tags\//, '');
      known.set(tip.pin_commit.toLowerCase(), tag);
      known.set(tip.pin_commit, tag);
    }
  }

  const watchedSinceMs = data.genesisAt
    ? new Date(data.genesisAt).getTime()
    : nowMs;

  return {
    watched,
    moves,
    known,
    watchedSinceMs,
    nowMs,
  };
}

export type PublicLedgerPayload = {
  watched: string[];
  moves: Record<
    string,
    Record<
      string,
      {
        at: number;
        from: string;
        to: string;
        what: string;
        sev?: string;
        entry?: number;
      }
    >
  >;
  known: Record<string, string>;
  watchedSinceMs: number;
  nowMs: number;
  latestEcoMove: {
    repo: string;
    tag: string;
    what: string;
    at: number;
    ago: string;
  } | null;
};

export function toPublicLedgerPayload(
  lookup: LedgerLookup,
  latestEco: PublicLedgerPayload['latestEcoMove'],
): PublicLedgerPayload {
  const moves: PublicLedgerPayload['moves'] = {};
  for (const [repo, tags] of lookup.moves) {
    moves[repo] = {};
    for (const [tag, m] of tags) {
      moves[repo][tag] = { ...m };
    }
  }
  const known: Record<string, string> = {};
  for (const [k, v] of lookup.known) known[k] = v;
  return {
    watched: [...lookup.watched],
    moves,
    known,
    watchedSinceMs: lookup.watchedSinceMs,
    nowMs: lookup.nowMs,
    latestEcoMove: latestEco,
  };
}

export function fromPublicLedgerPayload(
  p: PublicLedgerPayload,
): LedgerLookup {
  const moves = new Map<string, Map<string, MoveInfo>>();
  for (const [repo, tags] of Object.entries(p.moves)) {
    const inner = new Map<string, MoveInfo>();
    for (const [tag, m] of Object.entries(tags)) {
      inner.set(tag, m);
    }
    moves.set(repo, inner);
  }
  return {
    watched: new Set(p.watched),
    moves,
    known: new Map(Object.entries(p.known)),
    watchedSinceMs: p.watchedSinceMs,
    nowMs: p.nowMs,
  };
}
