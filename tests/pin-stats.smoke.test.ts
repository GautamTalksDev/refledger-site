import { describe, it, expect } from 'vitest';
import { getSiteData } from '../src/data/index';

describe('polish stats', () => {
  it('reports pin and gap coverage', () => {
    // Force fresh by importing buildIndex path - getSiteData is cached from prior tests possibly
    const d = getSiteData();
    console.log('PIN_STATS', JSON.stringify(d.pinStats));
    console.log(
      'GAP_BANDS',
      JSON.stringify(
        d.gapBands.map((g) => ({ s: g.start, e: g.end, l: g.label, n: g.repos.length })),
      ),
    );
    console.log('CORR', JSON.stringify(d.correlationCaptions));
    expect(d.pinStats.pinned).toBeGreaterThan(100);
    expect(d.gapBands.some((g) => g.start.startsWith('2026-10-01') || g.end.startsWith('2026-10-01'))).toBe(true);
  });
});
