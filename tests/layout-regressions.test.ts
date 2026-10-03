import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { daysRunning } from '../src/lib/format';
import { TILE_REVEAL_MS, revealImmediately } from '../src/lib/reveal';

const entry = readFileSync('src/pages/e/[seq].astro', 'utf8');
const css = readFileSync('src/styles/base.css', 'utf8');
const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');

describe('layout regressions', () => {
  it('names the disabled tip control Newest entry and never a bare Entry', () => {
    expect(entry).toMatch(/disabled[^>]*>\s*Newest entry/);
    expect(entry).toMatch(/disabled[^>]*>\s*Oldest entry/);
    expect(entry).not.toMatch(/>\s*Entry\s*<\/(span|button)>/);
  });

  it('keeps the JSON panel flush with its column and wrapping', () => {
    expect(css).toMatch(/\.entry-split > section \+ section \{\s*margin-top: 0;/);
    expect(css).toContain('white-space: pre-wrap');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('overflow-x: hidden');
  });

  it('puts the footer in the same padded wrap as the page', () => {
    expect(layout).toContain('class="wrap foot"');
    expect(css).toContain('padding-inline: var(--page-pad)');
    expect(css).toMatch(/footer\.site \.foot \{[\s\S]*padding-top: 32px;/);
  });

  it('paces verify tiles at 25ms and skips the pace when motion is reduced', () => {
    expect(TILE_REVEAL_MS).toBe(25);
    expect(revealImmediately(true)).toBe(true);
    expect(revealImmediately(false)).toBe(false);
    expect(daysRunning('2026-09-29T00:00:00.000Z', '2026-10-03T00:00:00.000Z')).toBe(4);
  });
});
