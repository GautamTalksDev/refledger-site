import type { SiteData } from '../data';
import type { LedgerLookup, MoveInfo } from './check-workflow';

function tagName(ref: string): string {
  return ref.replace(/^refs\/tags\//, '');
}

function invertCurrentByTag(
  currentByTag: Map<string, Map<string, string>>,
): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  for (const [repo, tags] of currentByTag) {
    const byCommit = new Map<string, string[]>();
    for (const [tag, sha] of tags) {
      const list = byCommit.get(sha) ?? [];
      list.push(tag);
      byCommit.set(sha, list);
    }
    for (const [, list] of byCommit) list.sort();
    out.set(repo, byCommit);
  }
  return out;
}

function buildEverFromCurrentAndHistory(
  currentByTag: Map<string, Map<string, string>>,
  historyByTag: Map<string, Map<string, string[]>>,
): Map<string, Map<string, string[]>> {
  const everSets = new Map<string, Map<string, Set<string>>>();

  const add = (repo: string, sha: string, tag: string) => {
    let byCommit = everSets.get(repo);
    if (!byCommit) {
      byCommit = new Map();
      everSets.set(repo, byCommit);
    }
    let set = byCommit.get(sha);
    if (!set) {
      set = new Set();
      byCommit.set(sha, set);
    }
    set.add(tag);
  };

  for (const [repo, tags] of currentByTag) {
    for (const [tag, sha] of tags) add(repo, sha, tag);
  }
  for (const [repo, tags] of historyByTag) {
    for (const [tag, shas] of tags) {
      for (const sha of shas) add(repo, sha.toLowerCase(), tag);
    }
  }

  const out = new Map<string, Map<string, string[]>>();
  for (const [repo, byCommit] of everSets) {
    out.set(
      repo,
      new Map([...byCommit].map(([sha, set]) => [sha, [...set].sort()])),
    );
  }
  return out;
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
  const historyByTag = new Map<string, Map<string, string[]>>();

  for (const repo of data.repos) {
    const byTag = new Map<string, string>();
    const hist = new Map<string, string[]>();

    for (const t of repo.tags) {
      const tag = tagName(t.ref);
      const pin = t.tip?.pin_commit ?? t.tip?.commit_sha ?? null;
      const current = pin ? pin.toLowerCase() : null;
      if (current) byTag.set(tag, current);

      const past = new Set<string>();
      for (const ev of t.events) {
        if (ev.kind === 'move' || ev.kind === 'recreation') {
          for (const sha of [ev.from.commit_sha, ev.to.commit_sha]) {
            const lower = sha.toLowerCase();
            if (lower && lower !== current) past.add(lower);
          }
        } else if (ev.kind === 'deletion') {
          const lower = ev.from.commit_sha.toLowerCase();
          if (lower && lower !== current) past.add(lower);
        }
      }
      if (past.size) hist.set(tag, [...past].sort());
    }

    currentByTag.set(repo.repo, byTag);
    if (hist.size) historyByTag.set(repo.repo, hist);
  }

  const tagsByCommitNow = invertCurrentByTag(currentByTag);
  const tagsByCommitEver = buildEverFromCurrentAndHistory(
    currentByTag,
    historyByTag,
  );

  const watchedSinceMs = data.genesisAt
    ? new Date(data.genesisAt).getTime()
    : nowMs;

  return {
    watched,
    moves,
    currentByTag,
    tagsByCommitNow,
    tagsByCommitEver,
    // Carried for the public payload; assess uses the derived maps above.
    historyByTag,
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
  /** repo -> tag -> current pin commit */
  currentByTag: Record<string, Record<string, string>>;
  /** repo -> tag -> past pin commits (not including the current tip) */
  historyByTag: Record<string, Record<string, string[]>>;
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
  const historyByTag: PublicLedgerPayload['historyByTag'] = {};
  for (const [repo, tags] of lookup.historyByTag ?? []) {
    historyByTag[repo] = Object.fromEntries(tags);
  }
  return {
    watched: [...lookup.watched],
    moves,
    currentByTag,
    historyByTag,
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
  const currentByTag = mapOfMapsFromRecord(p.currentByTag ?? {});
  const historyByTag = mapOfStringListsFromRecord(p.historyByTag ?? {});
  return {
    watched: new Set(p.watched),
    moves,
    currentByTag,
    tagsByCommitNow: invertCurrentByTag(currentByTag),
    tagsByCommitEver: buildEverFromCurrentAndHistory(currentByTag, historyByTag),
    historyByTag,
    watchedSinceMs: p.watchedSinceMs,
    nowMs: p.nowMs,
  };
}
