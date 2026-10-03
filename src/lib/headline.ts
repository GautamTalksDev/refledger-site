/**
 * Entry headlines are sentences. Never the raw event name.
 * Canary entries are flagged so the page can show the Canary label.
 */

import { CANARY_REPO, type LedgerEntry } from '../data/types';
import { whatChangedFromEntry } from './what-changed';

export type EntryHeadline = {
  /** Full sentence, including the final period. */
  text: string;
  canary: boolean;
  /** Leading subject to link, when the sentence starts with a repo and tag. */
  subject?: string;
  href?: string;
};

const COUNT = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
];

function countWord(n: number): string {
  return COUNT[n] ?? String(n);
}

function tagOf(ref: string): string {
  return ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ref;
}

function monthName(isoDate: string): string {
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
  const [y, m, d] = isoDate.split('-').map((n) => Number(n));
  if (!y || !m || !d) return isoDate;
  return `${d} ${months[m - 1]} ${y}`;
}

function sentenceFromPhrase(subject: string, phrase: string): string {
  switch (phrase) {
    case 'Tag deleted':
      return `${subject} was deleted.`;
    case 'Deleted tag came back, pointing somewhere new':
      return `${subject} came back, pointing somewhere new.`;
    case 'Floating tag moved forward to a new release':
      return `${subject} moved forward to a new release.`;
    case 'Floating tag moved off its release line':
      return `${subject} moved off its release line.`;
    case 'Tag type changed, same commit':
      return `${subject} changed tag type on the same commit.`;
    case 'Commit rewritten, same files':
      return `${subject} was rewritten on the same files.`;
    case 'Code changed under an exact version':
      return `The code under ${subject} changed.`;
    default:
      return `${subject} moved to a new commit.`;
  }
}

function correctionClause(reason: string): string {
  const r = reason.toLowerCase();
  if (
    r.includes('same commit') &&
    (r.includes('content_change') || r.includes('release_level_only'))
  ) {
    return 'the tag type changed on the same commit';
  }
  if (
    r.includes('meaningless for a deletion') ||
    r.includes('deletion carried classification')
  ) {
    return 'a deletion was labelled as a content change';
  }
  if (r.includes('tree_sha equals commit') || r.includes('tree_sha == commit')) {
    return 'the recorded tree was the commit itself';
  }
  return 'an earlier entry recorded a fact that was not true';
}

function entryRepo(entry: LedgerEntry): string | null {
  if ('repo' in entry && typeof entry.repo === 'string') return entry.repo;
  return null;
}

export function entryHeadline(
  entry: LedgerEntry,
  corrected?: LedgerEntry | null,
): EntryHeadline {
  const ownRepo = entryRepo(entry);
  const canary =
    ownRepo === CANARY_REPO ||
    (corrected ? entryRepo(corrected) === CANARY_REPO : false) ||
    (entry.event === 'correction' && /canary/i.test(entry.reason));

  if (
    entry.event === 'move' ||
    entry.event === 'deletion' ||
    entry.event === 'recreation'
  ) {
    const tag = tagOf(entry.ref);
    const subject = `${entry.repo} ${tag}`;
    const phrase = whatChangedFromEntry(entry, null).phrase;
    return {
      text: sentenceFromPhrase(subject, phrase),
      canary: entry.repo === CANARY_REPO,
      subject,
      href: `/a/${entry.repo}/${tag}`,
    };
  }

  if (entry.event === 'correlation') {
    const n =
      entry.correlation.refs_moved_together.length ||
      entry.correlation.member_seqs.length;
    const word = countWord(n);
    const canaryBatch = entry.repo === CANARY_REPO;
    const noun =
      n === 1
        ? canaryBatch
          ? 'canary tag'
          : 'tag'
        : canaryBatch
          ? 'canary tags'
          : 'tags';
    const text = entry.correlation.all_to_same_target
      ? n <= 1
        ? `${word} ${noun} moved to a new commit.`
        : `${word} ${noun} moved to the same commit together.`
      : `${word} ${noun} moved together.`;
    return { text, canary: canaryBatch };
  }

  if (entry.event === 'correction') {
    return {
      text: `Correction to entry ${entry.corrects_seq}: ${correctionClause(entry.reason)}.`,
      canary,
    };
  }

  if (entry.event === 'observation_digest') {
    return {
      text: `The ${monthName(entry.observation_digest.date)} check is signed and sealed.`,
      canary: false,
    };
  }

  if (entry.event === 'population_change') {
    const repo = entry.repo;
    const pc = entry.population_change;
    if (pc.change === 'removed') {
      return { text: `${repo} left the watched set.`, canary: repo === CANARY_REPO };
    }
    if (pc.reason.type === 'manual') {
      return {
        text: `${repo} was added to the watched set by hand.`,
        canary: repo === CANARY_REPO,
      };
    }
    if (pc.reason.type === 'restored') {
      return {
        text: `${repo} was restored to the watched set.`,
        canary: repo === CANARY_REPO,
      };
    }
    if (pc.reason.type === 'transitive') {
      const via = pc.reason.via.split('@')[0];
      return {
        text: `${repo} joined the watched set because ${via} uses it.`,
        canary: repo === CANARY_REPO,
      };
    }
    return { text: `${repo} joined the watched set.`, canary: repo === CANARY_REPO };
  }

  if (entry.event === 'repo_unavailable') {
    return {
      text: `${entry.repo} could not be read, and the server returned status ${entry.http_status}.`,
      canary: entry.repo === CANARY_REPO,
    };
  }

  if (entry.event === 'repo_redirected') {
    return {
      text: `${entry.repo} now redirects to ${entry.redirect_location}.`,
      canary: entry.repo === CANARY_REPO,
    };
  }

  return { text: 'A ledger entry was recorded.', canary: false };
}
