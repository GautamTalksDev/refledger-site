import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_MS,
  isDataStale,
  newestObservedAt,
  staleNoticeText,
} from '../src/lib/freshness';
import { fmtLedgerAsOf } from '../src/lib/format';

describe('isDataStale', () => {
  const iso = '2026-10-03T12:00:00.000Z';
  const base = Date.parse(iso);

  it('is fresh within 30 minutes', () => {
    expect(isDataStale(iso, base + STALE_AFTER_MS - 1)).toBe(false);
  });

  it('is stale after 30 minutes', () => {
    expect(isDataStale(iso, base + STALE_AFTER_MS + 1)).toBe(true);
  });

  it('quiet day: old tip with fresh checks shows no notice', () => {
    // Tip only moves on seals/moves; checks keep advancing.
    const oldTip = '2026-10-01T00:05:00.000Z';
    const lastChecked = '2026-10-03T12:00:00.000Z';
    const buildNowMs = Date.parse(lastChecked) + 5 * 60 * 1000;
    expect(isDataStale(lastChecked, buildNowMs)).toBe(false);
    // Using the tip would have falsely flagged a quiet day.
    expect(isDataStale(oldTip, buildNowMs)).toBe(true);
  });
});

describe('newestObservedAt', () => {
  it('picks the newest observation, not an older tip-era check', () => {
    expect(
      newestObservedAt([
        { observed_at: '2026-10-01T00:00:00.000Z' },
        { observed_at: '2026-10-03T12:05:00.000Z' },
        { observed_at: '2026-10-02T08:00:00.000Z' },
      ]),
    ).toBe('2026-10-03T12:05:00.000Z');
  });

  it('returns null when there are no observations', () => {
    expect(newestObservedAt([])).toBeNull();
  });
});

describe('staleNoticeText', () => {
  it('uses the build-time label, never invents a visitor clock', () => {
    expect(staleNoticeText('3 Oct, 12:00 UTC')).toBe(
      'Data is from 3 Oct, 12:00 UTC. Our last update was delayed.',
    );
  });
});

describe('fmtLedgerAsOf', () => {
  it('formats the ISO from data in UTC', () => {
    expect(fmtLedgerAsOf('2026-10-03T12:34:00.000Z')).toBe('3 Oct, 12:34 UTC');
  });
});
