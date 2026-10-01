import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fetchLedgerData, fetchFromFixtureRoot } from '../src/data/fetch';
import { displayClassification, getSiteData } from '../src/data/index';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('data layer against live cache', () => {
  it('loads chain from genesis without gaps', () => {
    const bundle = fetchLedgerData({ root, allowClone: false });
    expect(bundle.entries.length).toBeGreaterThan(0);
    expect(bundle.entries[0].seq).toBe(0);
    expect(bundle.watched.length).toBeGreaterThan(0);
    for (let i = 0; i < bundle.entries.length; i++) {
      expect(bundle.entries[i].seq).toBe(i);
    }
  });

  it('aggregates repos and never shows deletion classification', () => {
    const data = getSiteData();
    expect(data.repos.length).toBeGreaterThan(0);
    expect(data.wallDefaultRepos.length).toBeLessThanOrEqual(12);
    for (const d of data.deletions) {
      expect(displayClassification(d)).toBeNull();
    }
  });
});

describe('fixtures', () => {
  it('records fixture provenance and parses fixture root', () => {
    const src = path.join(root, 'tests/fixtures/SOURCE.txt');
    expect(fs.existsSync(src)).toBe(true);
    expect(fs.readFileSync(src, 'utf8')).toMatch(/Copied/);

    // Arrange fixture layout expected by fetchFromFixtureRoot
    const fixtureRoot = path.join(root, 'tests/fixtures');
    const pop = path.join(fixtureRoot, 'population');
    fs.mkdirSync(pop, { recursive: true });
    if (!fs.existsSync(path.join(pop, 'watched.jsonl'))) {
      fs.copyFileSync(
        path.join(fixtureRoot, 'watched.jsonl'),
        path.join(pop, 'watched.jsonl'),
      );
    }
    const data = fetchFromFixtureRoot(fixtureRoot);
    expect(data.entries.length).toBeGreaterThan(0);
  });
});
