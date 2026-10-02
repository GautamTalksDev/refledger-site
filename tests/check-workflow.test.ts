import { describe, expect, it } from 'vitest';
import {
  assess,
  fixedFiles,
  parseFiles,
  type LedgerLookup,
  type ParsedUses,
} from '../src/lib/check-workflow';

function ledger(partial: Partial<LedgerLookup> = {}): LedgerLookup {
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
    known: new Map([
      [
        '11bd71901bbe5b1630ceea73d27597364c9af683',
        'v4.2.2',
      ],
    ]),
    watchedSinceMs: Date.UTC(2026, 8, 29, 18, 53),
    nowMs: Date.UTC(2026, 9, 2, 16, 20),
    ...partial,
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

describe('assess', () => {
  it('flags wrong pin comments', () => {
    const item: ParsedUses = {
      file: 'r.yml',
      line: 1,
      raw: '      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.1.0',
      indent: '      - ',
      spec: 'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
      target: 'actions/checkout',
      key: 'actions/checkout',
      ref: '11bd71901bbe5b1630ceea73d27597364c9af683',
      comment: 'v4.1.0',
      kind: 'sha',
    };
    const r = assess(item, null, ledger());
    expect(r.attn).toBe(true);
    expect(r.status).toBe('Pinned, but the comment is wrong');
    expect(r.fix).toContain('# v4.2.2');
  });

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
