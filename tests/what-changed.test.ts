import { describe, it, expect } from 'vitest';
import {
  describeWhatChanged,
  describeFromTo,
  effectiveClassification,
  whatChangedFromEntry,
} from '../src/lib/what-changed';
import { getSiteData } from '../src/data';
import type { CorrectionEntry, MoveEntry } from '../src/data/types';

describe('describeWhatChanged', () => {
  it('floating content_change ahead', () => {
    expect(
      describeWhatChanged({
        event: 'move',
        classification: 'content_change',
        ref_form: 'floating_major',
        ancestry: 'ahead',
        fromCommit: 'aaa',
        toCommit: 'bbb',
      }),
    ).toBe('Floating tag moved forward to a new release');
  });

  it('floating content_change behind', () => {
    expect(
      describeWhatChanged({
        event: 'move',
        classification: 'content_change',
        ref_form: 'floating_major',
        ancestry: 'behind',
        fromCommit: 'aaa',
        toCommit: 'bbb',
      }),
    ).toBe('Floating tag moved off its release line');
  });

  it('floating content_change diverged', () => {
    expect(
      describeWhatChanged({
        event: 'move',
        classification: 'content_change',
        ref_form: 'floating_minor',
        ancestry: 'diverged',
        fromCommit: 'aaa',
        toCommit: 'bbb',
      }),
    ).toBe('Floating tag moved off its release line');
  });

  it('exact content_change', () => {
    expect(
      describeWhatChanged({
        event: 'move',
        classification: 'content_change',
        ref_form: 'exact',
        ancestry: 'ahead',
        fromCommit: 'aaa',
        toCommit: 'bbb',
      }),
    ).toBe('Code changed under an exact version');
  });

  it('commit_metadata_only', () => {
    expect(
      describeWhatChanged({
        event: 'move',
        classification: 'commit_metadata_only',
        ref_form: 'exact',
        fromCommit: 'aaa',
        toCommit: 'bbb',
      }),
    ).toBe('Commit rewritten, same files');
  });

  it('release_level_only', () => {
    expect(
      describeWhatChanged({
        event: 'move',
        classification: 'release_level_only',
        ref_form: 'floating_major',
        fromCommit: 'aaa',
        toCommit: 'aaa',
        fromTarget: '1111111aaaaaaaa',
        toTarget: '2222222bbbbbbbb',
      }),
    ).toBe('Tag type changed, same commit');
  });

  it('same commit overrides content_change classification', () => {
    expect(
      describeWhatChanged({
        event: 'move',
        classification: 'content_change',
        ref_form: 'floating_major',
        ancestry: 'ahead',
        fromCommit: 'f77ccacd8e1ae035fba46dd24456469832ea7c36',
        toCommit: 'f77ccacd8e1ae035fba46dd24456469832ea7c36',
        fromTarget: 'f77ccacd8e1ae035fba46dd24456469832ea7c36',
        toTarget: '549990ab396ef38a4feaba990473c3d66fb26be7',
      }),
    ).toBe('Tag type changed, same commit');
    expect(
      effectiveClassification({
        event: 'move',
        classification: 'content_change',
        fromCommit: 'f77ccacd8e1ae035fba46dd24456469832ea7c36',
        toCommit: 'f77ccacd8e1ae035fba46dd24456469832ea7c36',
      }),
    ).toBe('release_level_only');
  });

  it('from/to shows tag object SHAs for same commit, not two identical commits', () => {
    const ft = describeFromTo({
      event: 'move',
      fromCommit: 'f77ccacd8e1ae035fba46dd24456469832ea7c36',
      toCommit: 'f77ccacd8e1ae035fba46dd24456469832ea7c36',
      fromTarget: 'f77ccacd8e1ae035fba46dd24456469832ea7c36',
      toTarget: '549990ab396ef38a4feaba990473c3d66fb26be7',
    });
    expect(ft.sameCommit).toBe(true);
    expect(ft.text).toContain('same commit');
    expect(ft.text).not.toMatch(/^f77ccac → f77ccac$/);
    expect(ft.fromShown).toBe('f77ccac');
    expect(ft.toShown).toBe('549990a');
  });

  it('deletion and recreation', () => {
    expect(describeWhatChanged({ event: 'deletion' })).toBe('Tag deleted');
    expect(describeWhatChanged({ event: 'recreation' })).toBe(
      'Deleted tag came back, pointing somewhere new',
    );
  });

  it('correction overrides classification when commits differ', () => {
    const correction = {
      event: 'correction' as const,
      format_version: 1 as const,
      seq: 99,
      prev_hash: 'x',
      entry_hash: 'y',
      recorded_at: '2026-10-02T00:00:00.000Z',
      corrects_seq: 52,
      reason: 'misclassified',
      corrected_classification: 'release_level_only' as const,
    } satisfies CorrectionEntry;
    expect(
      describeWhatChanged(
        {
          event: 'move',
          classification: 'content_change',
          ref_form: 'exact',
          fromCommit: 'aaa',
          toCommit: 'bbb',
        },
        correction,
      ),
    ).toBe('Tag type changed, same commit');
  });
});

describe('live ledger rows', () => {
  it('seq 52 same-commit canary is never worded as content change', () => {
    const data = getSiteData();
    const entry = data.entriesBySeq.get(52) as MoveEntry;
    expect(entry).toBeTruthy();
    const correction = data.correctionsBySeq.get(52) ?? null;
    const { phrase, fromTo, classification } = whatChangedFromEntry(
      entry,
      correction,
    );
    expect(phrase).toBe('Tag type changed, same commit');
    expect(classification).toBe('release_level_only');
    expect(fromTo.sameCommit).toBe(true);
    expect(fromTo.text).not.toMatch(/f77ccac → f77ccac$/);
  });

  it('seq 57 reviewdog floating ahead', () => {
    const data = getSiteData();
    const entry = data.entriesBySeq.get(57) as MoveEntry | undefined;
    if (!entry) {
      // Data may advance; skip soft if seq gone
      expect(data.moves.some((m) => m.repo.includes('reviewdog'))).toBe(true);
      return;
    }
    const { phrase } = whatChangedFromEntry(entry);
    expect(phrase).toBe('Floating tag moved forward to a new release');
  });

  it('seq 53 release_level_only stays release-level wording', () => {
    const data = getSiteData();
    const entry = data.entriesBySeq.get(53) as MoveEntry;
    expect(entry.classification).toBe('release_level_only');
    expect(whatChangedFromEntry(entry).phrase).toBe(
      'Tag type changed, same commit',
    );
  });
});
