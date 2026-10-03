import { describe, expect, it } from 'vitest';
import {
  STALE_AFTER_MS,
  isDataStale,
  staleNoticeText,
} from '../src/lib/freshness';
import { fmtLedgerAsOf } from '../src/lib/format';

describe('isDataStale', () => {
  const iso = '2026-10-03T12:00:00.000Z';
  const base = Date.parse(iso);

  it('is fresh within six hours', () => {
    expect(isDataStale(iso, base + STALE_AFTER_MS - 1)).toBe(false);
  });

  it('is stale after six hours', () => {
    expect(isDataStale(iso, base + STALE_AFTER_MS + 1)).toBe(true);
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
