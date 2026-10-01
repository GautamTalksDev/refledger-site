import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchFromFixtureRoot } from './fetch';
import {
  buildIndex,
  ecosystemMovesLast7Days,
  isCanary,
  topWallEntrée,
} from './index';
import { displayClassification } from './types';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

describe('parse fixtures', () => {
  const data = fetchFromFixtureRoot(FIXTURES);

  it('parses log entries including move/deletion/recreation/correction', () => {
    const events = new Set(data.entries.map((e) => e.event));
    expect(events.has('move')).toBe(true);
    expect(events.has('deletion')).toBe(true);
    expect(events.has('recreation')).toBe(true);
    expect(events.has('correction')).toBe(true);
    expect(data.entries.length).toBeGreaterThanOrEqual(5);
    for (const e of data.entries) {
      expect(e.format_version).toBe(1);
      expect(typeof e.seq).toBe('number');
      expect(e.entry_hash.startsWith('sha256:')).toBe(true);
    }
  });

  it('parses heads line', () => {
    expect(data.heads.length).toBe(1);
    const h = data.heads[0];
    expect(h.public_key).toMatch(/^[0-9a-f]{64}$/);
    expect(h.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(h.key_id.startsWith('sha256:')).toBe(true);
    expect(typeof h.head.seq).toBe('number');
  });

  it('parses observations with skipped and ok', () => {
    const types = new Set(data.observations.map((o) => o.outcome.type));
    expect(types.has('ok')).toBe(true);
    expect(types.has('skipped')).toBe(true);
    expect(types.has('failed')).toBe(true);
  });

  it('parses watched snippet including canary', () => {
    expect(data.watched.length).toBeGreaterThanOrEqual(3);
    const canary = data.watched.find((w) => isCanary(w.repo));
    expect(canary).toBeDefined();
    expect(canary!.note).toBe('canary');
  });

  it('never displays classification for deletions', () => {
    const deletion = data.entries.find((e) => e.event === 'deletion');
    expect(deletion).toBeDefined();
    expect(displayClassification(deletion!)).toBeNull();
  });

  it('builds index aggregations', () => {
    const index = buildIndex(data);
    expect(index.entriesBySeq.size).toBe(data.entries.length);
    expect(index.deletions.length).toBeGreaterThanOrEqual(1);
    expect(index.moves.length).toBeGreaterThanOrEqual(1);
    expect(index.gaps.length).toBeGreaterThanOrEqual(1);
    expect(index.reposByName.has('GautamTalksDev/canary')).toBe(true);

    const canary = index.reposByName.get('GautamTalksDev/canary')!;
    expect(canary.canary).toBe(true);
    expect(canary.tags.length).toBeGreaterThan(0);

    const entrée = topWallEntrée(index, 12);
    expect(entrée.every((repo) => !isCanary(repo))).toBe(true);

    const eco = ecosystemMovesLast7Days(
      index,
      new Date('2026-10-02T00:00:00.000Z'),
    );
    expect(eco.every((m) => !isCanary(m.repo))).toBe(true);
  });

  it('fails loudly on corrupt JSONL', () => {
    expect(() =>
      fetchFromFixtureRoot(join(process.cwd(), 'tests', 'fixtures-missing')),
    ).toThrow();
  });
});
