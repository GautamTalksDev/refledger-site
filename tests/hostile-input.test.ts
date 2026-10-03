import { describe, expect, it } from 'vitest';
import {
  assertUniqueRefBudget,
  normalizeRepo,
  parseFiles,
} from '../src/lib/check-workflow';
import { LimitError, MAX_UNIQUE_REFS, MAX_WORKFLOW_FILE_BYTES } from '../src/lib/limits';
import { actionHistoryHref, isValidRepoKey } from '../src/lib/safe-link';
import { USES } from '../src/lib/check-workflow';

describe('hostile repo input', () => {
  it('rejects script-like and path tricks in normalizeRepo', () => {
    expect(normalizeRepo('<script>alert(1)</script>/x')).toBeNull();
    expect(normalizeRepo('owner/repo"onclick="alert(1)')).toBeNull();
    expect(normalizeRepo('owner/repo/../../../etc/passwd')).toBeNull();
    expect(normalizeRepo('owner/repo\u202Egit')).toBeNull();
    expect(normalizeRepo('ok/repo')).toBe('ok/repo');
    expect(normalizeRepo('https://github.com/ok/repo.git')).toBe('ok/repo');
  });

  it('rejects javascript: and event-handler shaped keys for links', () => {
    expect(isValidRepoKey('javascript:alert(1)//x')).toBe(false);
    expect(actionHistoryHref('a/b"onclick="x')).toBeNull();
    expect(actionHistoryHref('actions/checkout', 'v4')).toBe(
      '/a/actions/checkout/v4',
    );
    expect(actionHistoryHref('actions/checkout', 'v4/../../x')).toBe(
      '/a/actions/checkout/v4%2F..%2F..%2Fx',
    );
  });
});

describe('hostile workflow content', () => {
  it('does not treat script tags or handlers as uses lines', () => {
    const yaml = `
name: evil
on: push
jobs:
  x:
    runs-on: ubuntu-latest
    steps:
      - run: echo '<script>alert(1)</script>'
      - run: echo 'onclick="alert(1)"'
      - run: echo 'javascript:alert(1)'
      - uses: actions/checkout@v4
`;
    const items = parseFiles([{ name: 'evil.yml', text: yaml }]);
    expect(items).toHaveLength(1);
    expect(items[0].spec).toBe('actions/checkout@v4');
  });

  it('handles Unicode bidi and zero-width without executing anything', () => {
    const bidi = '\u202E';
    const zw = '\u200B';
    const yaml = `steps:\n  - uses: actions${zw}/checkout@v4\n  - uses: ${bidi}actions/checkout@v4\n`;
    const items = parseFiles([{ name: 'u.yml', text: yaml }]);
    // Zero-width inside owner breaks the charset filter; bidi prefix also fails key check.
    expect(items.every((i) => i.key == null || isValidRepoKey(i.key))).toBe(true);
  });

  it('rejects a 10 MB file with a clear LimitError', () => {
    const big = 'x'.repeat(10 * 1024 * 1024);
    expect(() => parseFiles([{ name: 'huge.yml', text: big }])).toThrow(LimitError);
    try {
      parseFiles([{ name: 'huge.yml', text: big }]);
    } catch (e) {
      expect(e).toBeInstanceOf(LimitError);
      expect((e as LimitError).message).toMatch(/512 KiB/);
    }
  });

  it('rejects 500 workflow files', () => {
    const files = Array.from({ length: 500 }, (_, i) => ({
      name: `w${i}.yml`,
      text: 'uses: actions/checkout@v4\n',
    }));
    expect(() => parseFiles(files)).toThrow(LimitError);
  });

  it('skips absurdly long lines without hanging', () => {
    const long = 'a'.repeat(50_000);
    const yaml = `steps:\n  - run: ${long}\n  - uses: actions/checkout@v4\n`;
    const t0 = performance.now();
    const items = parseFiles([{ name: 'long.yml', text: yaml }]);
    const ms = performance.now() - t0;
    expect(items).toHaveLength(1);
    expect(ms).toBeLessThan(200);
  });

  it('survives deeply nested YAML structure (line scanner, not a YAML parser)', () => {
    const nest = Array.from({ length: 200 }, (_, i) => '  '.repeat(i) + `k${i}:`).join(
      '\n',
    );
    const yaml = `${nest}\n${'  '.repeat(200)}- uses: actions/checkout@v4\n`;
    const items = parseFiles([{ name: 'deep.yml', text: yaml }]);
    expect(items.some((i) => i.spec === 'actions/checkout@v4')).toBe(true);
  });

  it('enforces unique ref budget', () => {
    const lines = Array.from(
      { length: MAX_UNIQUE_REFS + 5 },
      (_, i) => `  - uses: org/act-${i}@v1`,
    ).join('\n');
    const items = parseFiles([{ name: 'many.yml', text: `steps:\n${lines}\n` }]);
    expect(() => assertUniqueRefBudget(items)).toThrow(LimitError);
  });
});

describe('uses regex ReDoS budget', () => {
  it('matches pathological lines within a tight time budget', () => {
    const cases = [
      ' '.repeat(5000) + 'uses: a/b@v1',
      '\t'.repeat(2000) + '- uses: "a/b@v1" # ' + '#'.repeat(2000),
      'uses: ' + 'a'.repeat(3000) + '@v1',
      '- uses: a/b@' + 'x'.repeat(3000),
      'uses: a/b@v1' + ' '.repeat(5000),
      'uses: \'a/b@v1\' # ' + 'y'.repeat(8000),
    ];
    for (const line of cases) {
      const t0 = performance.now();
      USES.exec(line.slice(0, 4096)); // parser also caps at 4096
      const ms = performance.now() - t0;
      // CI runners can jitter a few ms over a local 20ms budget.
      expect(ms).toBeLessThan(50);
    }
  });

  it('fuzzes random lines under a per-input budget', () => {
    const alphabet =
      'uses:abc@#-\t\'"/<>script\u202E\u200B0123456789 '.split('');
    for (let i = 0; i < 400; i++) {
      let line = '';
      const len = 50 + (i % 400);
      for (let j = 0; j < len; j++) {
        line += alphabet[(i * 17 + j * 31) % alphabet.length];
      }
      if (i % 7 === 0) line = '  - uses: actions/checkout@v4 # ' + line;
      const t0 = performance.now();
      parseFiles([{ name: 'f.yml', text: line + '\n' }]);
      expect(performance.now() - t0).toBeLessThan(30);
    }
  });
});

describe('paste size constant', () => {
  it('documents the 512 KiB ceiling', () => {
    expect(MAX_WORKFLOW_FILE_BYTES).toBe(512 * 1024);
  });
});
