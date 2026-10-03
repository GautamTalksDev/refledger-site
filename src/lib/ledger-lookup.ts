import type { SiteData } from '../data';
import type { LedgerLookup, MoveInfo } from './check-workflow';

function tagName(ref: string): string {
  return ref.replace(/^refs\/tags\//, '');
}

function addTag(
  map: Map<string, Set<string>>,
  sha: string | undefined | null,
  tag: string,
): void {
  if (!sha) return;
  const key = sha.toLowerCase();
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(tag);
}

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

  const currentByTag = new Map<string, Map<string, string>>();
  const tagsByCommitNow = new Map<string, Map<string, string[]>>();
  const tagsByCommitEver = new Map<string, Map<string, string[]>>();

  for (const repo of data.repos) {
    const byTag = new Map<string, string>();
    const nowSets = new Map<string, Set<string>>();
    const everSets = new Map<string, Set<string>>();

    for (const t of repo.tags) {
      const tag = tagName(t.ref);
      const pin = t.tip?.pin_commit ?? t.tip?.commit_sha ?? null;
      if (pin) {
        const sha = pin.toLowerCase();
        byTag.set(tag, sha);
        addTag(nowSets, sha, tag);
        addTag(everSets, sha, tag);
      }
      for (const ev of t.events) {
        if (ev.kind === 'move' || ev.kind === 'recreation') {
          addTag(everSets, ev.from.commit_sha, tag);
          addTag(everSets, ev.to.commit_sha, tag);
        } else if (ev.kind === 'deletion') {
          addTag(everSets, ev.from.commit_sha, tag);
        }
      }
    }

    currentByTag.set(repo.repo, byTag);
    tagsByCommitNow.set(
      repo.repo,
      new Map([...nowSets].map(([sha, set]) => [sha, [...set].sort()])),
    );
    tagsByCommitEver.set(
      repo.repo,
      new Map([...everSets].map(([sha, set]) => [sha, [...set].sort()])),
    );
  }

  const watchedSinceMs = data.genesisAt
    ? new Date(data.genesisAt).getTime()
    : nowMs;

  return {
    watched,
    moves,
    currentByTag,
    tagsByCommitNow,
    tagsByCommitEver,
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
  currentByTag: Record<string, Record<string, string>>;
  tagsByCommitNow: Record<string, Record<string, string[]>>;
  tagsByCommitEver: Record<string, Record<string, string[]>>;
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
  const currentByTag: PublicLedgerPayload['currentByTag'] = {};
  for (const [repo, tags] of lookup.currentByTag) {
    currentByTag[repo] = Object.fromEntries(tags);
  }
  const tagsByCommitNow: PublicLedgerPayload['tagsByCommitNow'] = {};
  for (const [repo, commits] of lookup.tagsByCommitNow) {
    tagsByCommitNow[repo] = Object.fromEntries(commits);
  }
  const tagsByCommitEver: PublicLedgerPayload['tagsByCommitEver'] = {};
  for (const [repo, commits] of lookup.tagsByCommitEver) {
    tagsByCommitEver[repo] = Object.fromEntries(commits);
  }
  return {
    watched: [...lookup.watched],
    moves,
    currentByTag,
    tagsByCommitNow,
    tagsByCommitEver,
    watchedSinceMs: lookup.watchedSinceMs,
    nowMs: lookup.nowMs,
    latestEcoMove: latestEco,
  };
}

function mapOfMapsFromRecord(
  rec: Record<string, Record<string, string>>,
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [repo, inner] of Object.entries(rec)) {
    out.set(repo, new Map(Object.entries(inner)));
  }
  return out;
}

function mapOfStringListsFromRecord(
  rec: Record<string, Record<string, string[]>>,
): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  for (const [repo, inner] of Object.entries(rec)) {
    out.set(repo, new Map(Object.entries(inner)));
  }
  return out;
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
    currentByTag: mapOfMapsFromRecord(p.currentByTag ?? {}),
    tagsByCommitNow: mapOfStringListsFromRecord(p.tagsByCommitNow ?? {}),
    tagsByCommitEver: mapOfStringListsFromRecord(p.tagsByCommitEver ?? {}),
    watchedSinceMs: p.watchedSinceMs,
    nowMs: p.nowMs,
  };
}
