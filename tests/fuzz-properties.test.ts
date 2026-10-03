/**
 * Property tests (fast-check). Random and hostile inputs must not throw
 * (inside the published size limits), hang, or come back as an unencoded URL.
 * CI runs this file as part of `npm test`.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseFiles } from '../src/lib/check-workflow';
import { collectUses, parseUsesString } from '../src/lib/pin-workflow';
import {
  actionHistoryHref,
  githubRepoUrl,
  isValidRepoKey,
} from '../src/lib/safe-link';

const RUNS = 100;

function assertNoHang(started: number): void {
  if (Date.now() - started > 1000) {
    throw new Error('case exceeded 1s');
  }
}

describe('property tests', () => {
  it('parses hostile workflow text without throwing or hanging', () => {
    const file = fc.record({
      name: fc.string({ maxLength: 40 }),
      text: fc.string({ maxLength: 1500, unit: 'binary' }),
    });
    fc.assert(
      fc.property(fc.array(file, { maxLength: 3 }), (files) => {
        const started = Date.now();
        const parsed = parseFiles(files);
        assertNoHang(started);
        for (const item of parsed) {
          expect(typeof item.spec).toBe('string');
          expect(item.line).toBeGreaterThan(0);
          if (item.key) {
            expect(isValidRepoKey(item.key)).toBe(true);
            const href = actionHistoryHref(item.key, item.ref);
            if (href) expect(href).toBe(encodedHistory(item.key, item.ref));
          }
        }
        const blob = files.map((f) => f.text).join('\n');
        const startedUses = Date.now();
        const uses = collectUses(blob);
        assertNoHang(startedUses);
        for (const u of uses) {
          expect(() => parseUsesString(u.raw)).not.toThrow();
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('extracts uses: lines from hostile single lines', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500, unit: 'binary' }), (line) => {
        const started = Date.now();
        const wrapped = `jobs:\n  build:\n    steps:\n      - uses: ${line}`;
        expect(() => parseFiles([{ name: 'w.yml', text: wrapped }])).not.toThrow();
        expect(() => collectUses(wrapped)).not.toThrow();
        expect(() => parseUsesString(line)).not.toThrow();
        assertNoHang(started);
      }),
      { numRuns: RUNS },
    );
  });

  it('rejects hostile repo slugs and encodes every URL it returns', () => {
    const chunk = fc.string({ maxLength: 80, unit: 'binary' });
    fc.assert(
      fc.property(chunk, chunk, fc.string({ maxLength: 80 }), (owner, repo, ref) => {
        const key = `${owner}/${repo}`;
        const ok = isValidRepoKey(key);
        const href = actionHistoryHref(key, ref);
        const gh = githubRepoUrl(key);
        if (!ok) {
          expect(href).toBeNull();
          expect(gh).toBeNull();
          return;
        }
        expect(gh).toBe(encodedGithub(key));
        if (ref.length > 256) {
          expect(href).toBeNull();
        } else {
          expect(href).toBe(encodedHistory(key, ref));
        }
        for (const url of [href, gh]) {
          if (!url) continue;
          expect(url).not.toMatch(/[\s<>"\\`{}^|]/);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

function encodedGithub(key: string): string {
  const [owner, repo] = key.split('/');
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function encodedHistory(key: string, ref?: string): string {
  const [owner, repo] = key.split('/');
  let href = `/a/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  if (ref != null && ref !== '') href += `/${encodeURIComponent(ref)}`;
  return href;
}
