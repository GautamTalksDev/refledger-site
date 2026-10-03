import { describe, expect, it } from 'vitest';
import { entryHeadline } from '../src/lib/headline';
import type { LedgerEntry } from '../src/data/types';

const base = {
  format_version: 1 as const,
  seq: 1,
  prev_hash: 'sha256:aa',
  entry_hash: 'sha256:bb',
  recorded_at: '2026-10-02T05:28:00.000Z',
};

function move(over: Record<string, unknown>): LedgerEntry {
  return {
    ...base,
    event: 'move',
    repo: 'reviewdog/action-actionlint',
    ref: 'refs/tags/v1',
    from: {
      target_sha: 'a'.repeat(40),
      commit_sha: 'b'.repeat(40),
      tree_sha: 'c'.repeat(40),
      first_observed: base.recorded_at,
      observation_count: 1,
      stable_days: 1,
    },
    to: {
      target_sha: 'd'.repeat(40),
      commit_sha: 'e'.repeat(40),
      tree_sha: 'f'.repeat(40),
      first_observed: base.recorded_at,
      observation_count: 1,
      stable_days: 1,
    },
    classification: 'content_change',
    severity: 'low',
    observation_window_seconds: 60,
    source_observations: [],
    ref_form: 'floating_major',
    ancestry: 'ahead',
    ...over,
  } as LedgerEntry;
}

const EVENTS = [
  'move',
  'deletion',
  'recreation',
  'correlation',
  'correction',
  'observation_digest',
  'population_change',
  'repo_unavailable',
  'repo_redirected',
] as const;

function sample(event: (typeof EVENTS)[number]): LedgerEntry {
  if (event === 'move') return move({});
  if (event === 'deletion')
    return move({ event: 'deletion', seq: 2, classification: undefined });
  if (event === 'recreation')
    return move({
      event: 'recreation',
      seq: 3,
      gap_seconds: 10,
      from: {
        target_sha: 'a'.repeat(40),
        commit_sha: 'b'.repeat(40),
        tree_sha: 'c'.repeat(40),
        first_observed: base.recorded_at,
        observation_count: 1,
        stable_days: 1,
      },
      to: {
        target_sha: '1'.repeat(40),
        commit_sha: '2'.repeat(40),
        tree_sha: '3'.repeat(40),
        first_observed: base.recorded_at,
        observation_count: 1,
        stable_days: 1,
      },
    });
  if (event === 'correlation')
    return {
      ...base,
      event: 'correlation',
      repo: 'GautamTalksDev/canary',
      correlation: {
        batch_id: 'b',
        member_seqs: [1, 2, 3],
        refs_moved_together: ['refs/tags/v9.0.0', 'refs/tags/v9.0.1', 'refs/tags/v9.0.2'],
        all_to_same_target: true,
      },
    };
  if (event === 'correction')
    return {
      ...base,
      seq: 66,
      event: 'correction',
      corrects_seq: 52,
      reason:
        'tree-invariant: seq 52 move GautamTalksDev/canary refs/tags/v2: same commit f77ccacd classified content_change; only release_level_only is possible',
    };
  if (event === 'observation_digest')
    return {
      ...base,
      event: 'observation_digest',
      observation_digest: {
        date: '2026-09-29',
        repos_polled: 1,
        ok: 1,
        not_modified: 0,
        failed: 0,
        skipped: 0,
        files: [],
      },
    };
  if (event === 'population_change')
    return {
      ...base,
      event: 'population_change',
      repo: 'actions/checkout',
      population_change: { change: 'added', reason: { type: 'seed' } },
    };
  if (event === 'repo_unavailable')
    return { ...base, event: 'repo_unavailable', repo: 'acme/missing', http_status: 404 };
  return {
    ...base,
    event: 'repo_redirected',
    repo: 'acme/old',
    http_status: 301,
    redirect_location: 'https://github.com/acme/new',
  };
}

describe('entry headlines', () => {
  it('covers every event type with a sentence, never the raw name', () => {
    for (const event of EVENTS) {
      const line = entryHeadline(sample(event));
      expect(line.text.endsWith('.'), event).toBe(true);
      expect(line.text.includes(' '), event).toBe(true);
      expect(line.text.toLowerCase(), event).not.toBe(event);
      expect(line.text.split(/\s+/).length, event).toBeGreaterThan(3);
      expect(line.text, event).not.toMatch(/[\u2013\u2014]|--/);
    }
  });

  it('matches the forward-move, canary batch, and correction examples', () => {
    expect(entryHeadline(sample('move')).text).toBe(
      'reviewdog/action-actionlint v1 moved forward to a new release.',
    );
    const batch = entryHeadline(sample('correlation'));
    expect(batch.text).toBe('Three canary tags moved to the same commit together.');
    expect(batch.canary).toBe(true);
    expect(entryHeadline(sample('correction')).text).toBe(
      'Correction to entry 52: the tag type changed on the same commit.',
    );
  });

  it('labels a canary move and a correction of a canary entry', () => {
    const canaryMove = entryHeadline(
      move({ repo: 'GautamTalksDev/canary', ref: 'refs/tags/v2' }),
    );
    expect(canaryMove.canary).toBe(true);
    expect(canaryMove.text.startsWith('GautamTalksDev/canary v2 ')).toBe(true);

    const correction = sample('correction');
    const target = move({
      seq: 52,
      repo: 'GautamTalksDev/canary',
      ref: 'refs/tags/v2',
    });
    expect(entryHeadline(correction, target).canary).toBe(true);
  });
});
