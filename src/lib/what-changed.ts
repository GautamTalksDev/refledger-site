/**
 * Fact-truthful "what changed" wording from ref_form + classification + ancestry.
 * Same-commit override is absolute: never call a same-commit move a content change.
 */

import type {
  Ancestry,
  Classification,
  CorrectionEntry,
  LedgerEntry,
  RefForm,
} from '../data/types';

export type WhatChangedInput = {
  event: 'move' | 'deletion' | 'recreation' | 'correlation';
  classification?: Classification | string | null;
  ref_form?: RefForm | string | null;
  ancestry?: Ancestry | string | null;
  fromCommit?: string | null;
  toCommit?: string | null;
  fromTarget?: string | null;
  toTarget?: string | null;
  /** When true, treat as a correlation batch caption (caller supplies count separately). */
  correlationTagCount?: number;
};

export type FromToDisplay = {
  text: string;
  fromShown: string;
  toShown: string;
  sameCommit: boolean;
};

function isFloating(refForm?: string | null): boolean {
  return (
    refForm === 'floating_major' ||
    refForm === 'floating_minor' ||
    refForm === 'named_channel'
  );
}

function isExact(refForm?: string | null): boolean {
  return refForm === 'exact';
}

export function commitsEqual(
  from?: string | null,
  to?: string | null,
): boolean {
  if (!from || !to) return false;
  return from.toLowerCase() === to.toLowerCase();
}

/**
 * Effective classification for display: same-commit forces release_level_only;
 * a Correction may override the signed classification.
 */
export function effectiveClassification(
  input: WhatChangedInput,
  correction?: CorrectionEntry | null,
): Classification | null {
  if (input.event === 'deletion') return null;

  const corrected =
    correction?.corrected_classification ??
    correction?.sets?.classification ??
    null;

  if (commitsEqual(input.fromCommit, input.toCommit)) {
    return 'release_level_only';
  }

  if (corrected) return corrected;

  const c = input.classification;
  if (
    c === 'content_change' ||
    c === 'commit_metadata_only' ||
    c === 'release_level_only'
  ) {
    return c;
  }
  return null;
}

export function describeWhatChanged(
  input: WhatChangedInput,
  correction?: CorrectionEntry | null,
): string {
  if (input.event === 'deletion') return 'Tag deleted';
  if (input.event === 'recreation') {
    return 'Deleted tag came back, pointing somewhere new';
  }
  if (input.event === 'correlation') {
    const n = input.correlationTagCount ?? 0;
    const word =
      n === 3 ? 'Three' : n === 2 ? 'Two' : n === 1 ? 'One' : n > 0 ? String(n) : 'Several';
    return `${word} tags moved together`;
  }

  const classification = effectiveClassification(input, correction);

  if (
    classification === 'release_level_only' ||
    commitsEqual(input.fromCommit, input.toCommit)
  ) {
    return 'Tag type changed, same commit';
  }

  if (classification === 'commit_metadata_only') {
    return 'Commit rewritten, same files';
  }

  if (classification === 'content_change' || !classification) {
    if (isFloating(input.ref_form)) {
      if (input.ancestry === 'behind' || input.ancestry === 'diverged') {
        return 'Floating tag moved off its release line';
      }
      // ahead, identical, or unknown → forward when we saw a content change
      return 'Floating tag moved forward to a new release';
    }
    if (isExact(input.ref_form)) {
      return 'Code changed under an exact version';
    }
    // other / missing form
    return 'Tag tip moved';
  }

  return 'Tag tip moved';
}

function short(sha?: string | null): string {
  if (!sha) return '?';
  return sha.slice(0, 7);
}

/**
 * From/to cell: for same-commit / release-level, show tag object SHAs
 * (or "same commit"), never two identical commit SHAs.
 */
export function describeFromTo(input: WhatChangedInput): FromToDisplay {
  const same = commitsEqual(input.fromCommit, input.toCommit);
  if (input.event === 'deletion') {
    return {
      text: `${short(input.fromCommit)} → gone`,
      fromShown: short(input.fromCommit),
      toShown: 'gone',
      sameCommit: false,
    };
  }

  if (same) {
    const fromT = input.fromTarget;
    const toT = input.toTarget;
    if (fromT && toT && fromT.toLowerCase() !== toT.toLowerCase()) {
      return {
        text: `${short(fromT)} → ${short(toT)} (same commit)`,
        fromShown: short(fromT),
        toShown: short(toT),
        sameCommit: true,
      };
    }
    return {
      text: 'same commit',
      fromShown: 'same commit',
      toShown: 'same commit',
      sameCommit: true,
    };
  }

  return {
    text: `${short(input.fromCommit)} → ${short(input.toCommit)}`,
    fromShown: short(input.fromCommit),
    toShown: short(input.toCommit),
    sameCommit: false,
  };
}

export function whatChangedFromEntry(
  entry: LedgerEntry,
  correction?: CorrectionEntry | null,
): { phrase: string; fromTo: FromToDisplay; classification: Classification | null } {
  if (entry.event === 'move' || entry.event === 'recreation' || entry.event === 'deletion') {
    const input: WhatChangedInput = {
      event: entry.event,
      classification: 'classification' in entry ? entry.classification : null,
      ref_form: 'ref_form' in entry ? entry.ref_form : null,
      ancestry: 'ancestry' in entry ? entry.ancestry : null,
      fromCommit: entry.from?.commit_sha,
      toCommit: entry.event === 'deletion' ? null : entry.to?.commit_sha,
      fromTarget: entry.from?.target_sha,
      toTarget: entry.event === 'deletion' ? null : entry.to?.target_sha,
    };
    return {
      phrase: describeWhatChanged(input, correction),
      fromTo: describeFromTo(input),
      classification: effectiveClassification(input, correction),
    };
  }
  return {
    phrase: entry.event,
    fromTo: { text: '', fromShown: '', toShown: '', sameCommit: false },
    classification: null,
  };
}

export function tooltipForChange(input: WhatChangedInput & {
  tag: string;
  recorded_at: string;
  severity?: string | null;
}, correction?: CorrectionEntry | null): string {
  const phrase = describeWhatChanged(input, correction);
  const fromTo = describeFromTo(input);
  const when = input.recorded_at.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  const sev = input.severity ? `; ${input.severity}` : '';
  return `${input.tag}: ${phrase}; ${fromTo.text}; ${when}${sev}`;
}
