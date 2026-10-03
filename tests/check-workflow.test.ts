import { describe, expect, it } from 'vitest';
import {
  assess,
  fixedFiles,
  formatTagList,
  localSkipLabel,
  orderResults,
  parseFiles,
  preferExactTag,
  type LedgerLookup,
  type ParsedUses,
} from '../src/lib/check-workflow';

const CHECKOUT_V7 =
  '3d3c42e5aac5ba805825da76410c181273ba90b1';
const CHECKOUT_OLD =
  '11bd71901bbe5b1630ceea73d27597364c9af683';
const MOVED_FROM =
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function ledger(partial: Partial<LedgerLookup> = {}): LedgerLookup {
  const currentByTag = new Map<string, Map<string, string>>([
    [
      'actions/checkout',
      new Map([
        ['v7', CHECKOUT_V7],
        ['v7.0.1', CHECKOUT_V7],
        ['v4.2.2', CHECKOUT_OLD],
      ]),
    ],
    [
      'reviewdog/action-actionlint',
      new Map([['v1', '13465d02abcd1234abcd1234abcd1234abcd1234'.slice(0, 40)]]),
    ],
  ]);
  const tagsByCommitNow = new Map<string, Map<string, string[]>>([
    [
      'actions/checkout',
      new Map([
        [CHECKOUT_V7, ['v7', 'v7.0.1']],
        [CHECKOUT_OLD, ['v4.2.2']],
      ]),
    ],
  ]);
  const tagsByCommitEver = new Map<string, Map<string, string[]>>([
    [
      'actions/checkout',
      new Map([
        [CHECKOUT_V7, ['v7', 'v7.0.1']],
        [CHECKOUT_OLD, ['v4.2.2']],
        // v7 once pointed at MOVED_FROM, then moved on to CHECKOUT_V7
        [MOVED_FROM, ['v7']],
      ]),
    ],
  ]);

  return {
    watched: new Set(['actions/checkout', 'reviewdog/action-actionlint']),
    moves: new Map([
      [
        'reviewdog/action-actionlint',
        new Map([
          [
            'v1',
            {
              at: Date.UTC(2026, 9, 2, 5, 28),
              from: '1129829f',
              to: '13465d02abcd1234abcd1234abcd1234abcd1234'.slice(0, 40),
              what: 'Floating tag moved forward to a new release',
              sev: 'Low',
              entry: 57,
            },
          ],
        ]),
      ],
    ]),
    currentByTag,
    tagsByCommitNow,
    tagsByCommitEver,
    watchedSinceMs: Date.UTC(2026, 8, 29, 18, 53),
    nowMs: Date.UTC(2026, 9, 2, 16, 20),
    ...partial,
  };
}

function shaItem(
  over: Partial<ParsedUses> & Pick<ParsedUses, 'ref' | 'comment'>,
): ParsedUses {
  return {
    file: 'ci.yml',
    line: 1,
    raw: `      - uses: actions/checkout@${over.ref} # ${over.comment}`,
    indent: '      - ',
    spec: `actions/checkout@${over.ref}`,
    target: 'actions/checkout',
    key: 'actions/checkout',
    kind: 'sha',
    ...over,
  };
}

describe('parseFiles', () => {
  it('parses quoted, commented, matrix-ish, local, and docker uses', () => {
    const yaml = `
name: tricky
on: push
jobs:
  build:
    strategy:
      matrix:
        # comment with uses: fake@v1 should not match
        os: [ubuntu-latest]
    runs-on: \${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: "actions/setup-node@v20"
      - uses: 'actions/cache@v4' # keep warm
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.1.0
      - uses: actions/checkout@11bd719
      - uses: some-org/tool@main
      - uses: ./.github/actions/build
      - uses: docker://alpine:3.19
      - name: not a uses
        run: echo uses: noop@v1
`;
    const items = parseFiles([{ name: 'ci.yml', text: yaml }]);
    const kinds = items.map((i) => [i.spec, i.kind, i.comment || ''] as const);
    expect(kinds).toEqual([
      ['actions/checkout@v4', 'tag', ''],
      ['actions/setup-node@v20', 'tag', ''],
      ['actions/cache@v4', 'tag', 'keep warm'],
      [
        'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
        'sha',
        'v4.1.0',
      ],
      ['actions/checkout@11bd719', 'short', ''],
      ['some-org/tool@main', 'branch', ''],
      ['./.github/actions/build', 'local', ''],
      ['docker://alpine:3.19', 'local', ''],
    ]);
  });

  it('treats refs without digits as branches', () => {
    const items = parseFiles([
      {
        name: 'x.yml',
        text: 'steps:\n  - uses: org/act@nightly\n  - uses: org/act@HEAD\n',
      },
    ]);
    expect(items.every((i) => i.kind === 'branch')).toBe(true);
  });
});

describe('preferExactTag / formatTagList', () => {
  it('prefers the most specific version tag', () => {
    expect(preferExactTag(['v7', 'v7.0.1', 'v7.0'])).toBe('v7.0.1');
    expect(formatTagList(['v7', 'v7.0.1'])).toBe('v7.0.1 and v7');
  });
});

describe('assess pin comments', () => {
  it('accepts a floating tag comment when that tag still points at the commit', () => {
    const r = assess(
      shaItem({ ref: CHECKOUT_V7, comment: 'v7' }),
      null,
      ledger(),
    );
    expect(r.attn).toBe(false);
    expect(r.status).toBe('Pinned to a commit. Nothing to do.');
    expect(r.detail).toContain("This action's own code cannot change");
    expect(r.detail).toContain('v7.0.1');
    expect(r.detail).toContain('exact version');
    expect(r.fix).toBeNull();
    expect(r.status).not.toMatch(/wrong/i);
    expect(r.detail).not.toMatch(/\bnever\b/i);
    expect(r.detail).not.toMatch(/always runs the same code/i);
  });

  it('accepts an exact tag comment on its current commit', () => {
    const r = assess(
      shaItem({ ref: CHECKOUT_V7, comment: 'v7.0.1' }),
      null,
      ledger(),
    );
    expect(r.attn).toBe(false);
    expect(r.status).toBe('Pinned to a commit. Nothing to do.');
    expect(r.fix).toBeNull();
    expect(r.detail).not.toContain('exact version');
  });

  it('reports a floating tag that moved on as information, not an error', () => {
    const r = assess(
      shaItem({ ref: MOVED_FROM, comment: 'v7' }),
      null,
      ledger(),
    );
    expect(r.attn).toBe(false);
    expect(r.fix).toBeNull();
    expect(r.status).toMatch(/has moved on since/);
    expect(r.status).not.toMatch(/wrong/i);
    expect(r.detail).toContain("This action's own code cannot move");
    expect(r.detail).not.toMatch(/\bnever\b/i);
  });

  it('flags a genuinely wrong comment without saying never', () => {
    const r = assess(
      shaItem({ ref: CHECKOUT_OLD, comment: 'v4.1.0' }),
      null,
      ledger(),
    );
    expect(r.attn).toBe(true);
    expect(r.status).toBe('Pinned, but the comment is wrong');
    expect(r.detail).toContain('since we started watching on 29 September');
    expect(r.detail).toContain('v4.2.2');
    expect(r.detail).toContain("This action's own code cannot move");
    expect(r.detail).not.toMatch(/\bnever\b/i);
    expect(r.detail).not.toMatch(/always runs the same code/i);
    expect(r.fix).toContain('# v4.2.2');
  });

  it('for unwatched actions only checks current resolution', () => {
    const item: ParsedUses = {
      file: 'ci.yml',
      line: 1,
      raw: `      - uses: acme/tool@${CHECKOUT_V7} # v1`,
      indent: '      - ',
      spec: `acme/tool@${CHECKOUT_V7}`,
      target: 'acme/tool',
      key: 'acme/tool',
      ref: CHECKOUT_V7,
      comment: 'v1',
      kind: 'sha',
    };
    const ok = assess(item, null, ledger(), { commentSha: CHECKOUT_V7 });
    expect(ok.attn).toBe(false);
    expect(ok.status).toBe('Pinned to a commit. Nothing to do.');

    const bad = assess(item, null, ledger(), {
      commentSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(bad.attn).toBe(true);
    expect(bad.status).toBe('Pinned, but the comment is wrong');
    expect(bad.detail).toContain('does not point at this commit today');
    expect(bad.detail).not.toMatch(/started watching|never|history/i);

    const unknown = assess(item, null, ledger(), { commentSha: null });
    expect(unknown.attn).toBe(false);
    expect(unknown.status).toBe('Pinned to a commit. Nothing to do.');
  });
});

describe('assess', () => {
  it('reports moved watched tags', () => {
    const item: ParsedUses = {
      file: 'c.yml',
      line: 3,
      raw: '      - uses: reviewdog/action-actionlint@v1',
      indent: '      - ',
      spec: 'reviewdog/action-actionlint@v1',
      target: 'reviewdog/action-actionlint',
      key: 'reviewdog/action-actionlint',
      ref: 'v1',
      comment: '',
      kind: 'tag',
    };
    const sha = '13465d02abcd1234abcd1234abcd1234abcd1234'.slice(0, 40);
    const r = assess(item, sha, ledger());
    expect(r.status).toMatch(/moved .+ ago/);
    expect(r.fix).toBe(
      `reviewdog/action-actionlint@${sha} # v1`,
    );
    expect(r.link?.href).toBe('/a/reviewdog/action-actionlint/v1');
  });

  it('handles unwatched tags and branches', () => {
    const tag = assess(
      {
        file: 'a.yml',
        line: 1,
        spec: 'acme/thing@v2',
        target: 'acme/thing',
        key: 'acme/thing',
        ref: 'v2',
        kind: 'tag',
      },
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ledger(),
    );
    expect(tag.status).toBe("Uses a tag we don't watch yet");
    expect(tag.fix).toContain('acme/thing@aaaaaaaa');

    const branch = assess(
      {
        file: 'a.yml',
        line: 2,
        spec: 'acme/thing@main',
        target: 'acme/thing',
        key: 'acme/thing',
        ref: 'main',
        kind: 'branch',
      },
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ledger(),
    );
    expect(branch.status).toBe('Follows a branch');
    expect(branch.fix).toContain('at the time of pinning');
  });

  it('rewrites fixed files with indent preserved', () => {
    const files = [
      {
        name: 'ci.yml',
        text: 'steps:\n  - uses: actions/checkout@v4\n  - run: true\n',
      },
    ];
    const items = parseFiles(files);
    const results = items.map((it) =>
      assess(it, 'cccccccccccccccccccccccccccccccccccccccc', ledger()),
    );
    const fixed = fixedFiles(files, results);
    expect(fixed[0].changed).toBe(1);
    expect(fixed[0].text).toContain(
      'uses: actions/checkout@cccccccccccccccccccccccccccccccccccccccc # v4',
    );
    expect(fixed[0].text).toContain('  - run: true');
  });
});

describe('orderResults', () => {
  it('puts moved tags, then movable tags, then pins, and collapses local and docker', () => {
    const files = [
      {
        name: 'ci.yml',
        text: [
          'steps:',
          '  - uses: ./.github/actions/build',
          '  - uses: docker://alpine:3.19',
          '  - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
          '  - uses: actions/checkout@v4',
          '  - uses: reviewdog/action-actionlint@v1',
          '  - uses: ./.github/actions/test',
        ].join('\n'),
      },
    ];
    const items = parseFiles(files);
    const results = items.map((it) => assess(it, null, ledger()));
    const ordered = orderResults(results);
    expect(ordered.local.map((r) => r.item.spec)).toEqual([
      './.github/actions/build',
      'docker://alpine:3.19',
      './.github/actions/test',
    ]);
    expect(ordered.rows.map((r) => r.item.spec)).toEqual([
      'reviewdog/action-actionlint@v1',
      'actions/checkout@v4',
      'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
    ]);
    expect(localSkipLabel(20)).toBe(
      '20 local actions skipped (not affected by moved tags)',
    );
    expect(localSkipLabel(1)).toBe(
      '1 local action skipped (not affected by moved tags)',
    );
  });
});

describe('loadRepo', () => {
  it('treats contents 404 + repo 200 as empty workflows (octocat/Hello-World)', async () => {
    const { loadRepo, GithubApiError } = await import(
      '../src/lib/check-workflow'
    );
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.includes('/contents/.github/workflows')) {
        return new Response('Not Found', { status: 404 });
      }
      if (url.endsWith('/repos/octocat/Hello-World')) {
        return Response.json({ full_name: 'octocat/Hello-World' });
      }
      throw new Error(`unexpected ${url}`);
    };
    const files = await loadRepo(
      'octocat/Hello-World',
      fetchImpl as unknown as typeof fetch,
    );
    expect(files).toEqual([]);
    expect(calls).toEqual([
      'https://api.github.com/repos/octocat/Hello-World/contents/.github/workflows',
      'https://api.github.com/repos/octocat/Hello-World',
    ]);
    const missingFetch = (async (url: string) => {
      if (url.includes('/contents/')) return new Response('', { status: 404 });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    await expect(loadRepo('nope/missing', missingFetch)).rejects.toBeInstanceOf(
      GithubApiError,
    );
  });
});
