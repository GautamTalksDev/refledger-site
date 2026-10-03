import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findGluedLinks } from '../scripts/glued-links.mjs';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

describe('words glued to links', () => {
  it('flags a word or period sitting against an anchor', () => {
    const hits = findGluedLinks(
      'Nothing is stored.<a href="/paste">Paste a workflow instead</a>or<a href="/x">try</a>.',
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it('allows explicit spaces around anchors', () => {
    expect(
      findGluedLinks(
        'Nothing is stored. <a href="/paste">Paste a workflow instead</a> or <a href="/x">try an example</a>.',
      ),
    ).toEqual([]);
  });

  it('scans built HTML when dist is required', () => {
    if (process.env.REQUIRE_DIST !== '1') return;
    const dist = path.resolve('dist');
    if (!existsSync(dist)) {
      expect(existsSync(dist), 'dist/ missing').toBe(true);
      return;
    }
    const bad: string[] = [];
    for (const file of walk(dist)) {
      if (file.includes(`${path.sep}verify${path.sep}log${path.sep}`)) continue;
      const hits = findGluedLinks(readFileSync(file, 'utf8'));
      for (const hit of hits) bad.push(`${path.relative(dist, file)}: ${hit}`);
    }
    expect(bad).toEqual([]);
  });
});
