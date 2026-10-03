import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { normalizeRepo, parseRepoInput } from '../src/lib/check-workflow';

describe('parseRepoInput', () => {
  it('accepts every common way to paste a GitHub repository', () => {
    const want = 'kunal-kushwaha/DSA-Bootcamp-Java';
    const forms = [
      'kunal-kushwaha/DSA-Bootcamp-Java',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java',
      'http://github.com/kunal-kushwaha/DSA-Bootcamp-Java',
      'https://www.github.com/kunal-kushwaha/DSA-Bootcamp-Java',
      'github.com/kunal-kushwaha/DSA-Bootcamp-Java',
      'HTTPS://GitHub.COM/kunal-kushwaha/DSA-Bootcamp-Java',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java/',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java.git',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java/tree/main',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java/blob/main/README.md',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java/pull/12',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java/issues',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java/actions',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java/releases',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java?tab=readme-ov-file',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java#readme',
      'git@github.com:kunal-kushwaha/DSA-Bootcamp-Java.git',
      '  https://github.com/kunal-kushwaha/DSA-Bootcamp-Java/tree/main  ',
      'https://github.com/kunal-kushwaha/DSA-Bootcamp-Java.git/tree/main',
    ];
    for (const form of forms) {
      expect(parseRepoInput(form), form).toEqual({ kind: 'repo', repo: want });
      expect(normalizeRepo(form), form).toBe(want);
    }
  });

  it('classifies an account-only paste', () => {
    expect(parseRepoInput('https://github.com/campus-experts')).toEqual({
      kind: 'account',
      account: 'campus-experts',
    });
    expect(parseRepoInput('github.com/campus-experts/')).toEqual({
      kind: 'account',
      account: 'campus-experts',
    });
    expect(normalizeRepo('https://github.com/campus-experts')).toBeNull();
  });

  it('rejects other hosts and gists with specific kinds', () => {
    expect(parseRepoInput('https://gitlab.com/owner/name').kind).toBe('host');
    expect(parseRepoInput('https://bitbucket.org/owner/name').kind).toBe('host');
    expect(parseRepoInput('git@gitlab.com:owner/name.git').kind).toBe('host');
    expect(parseRepoInput('https://gist.github.com/user/abcdef').kind).toBe(
      'gist',
    );
    expect(parseRepoInput('https://gist.github.com/abcdef').kind).toBe('gist');
  });

  it('still rejects hostile or empty input', () => {
    expect(parseRepoInput('').kind).toBe('invalid');
    expect(parseRepoInput('<script>alert(1)</script>/x').kind).toBe('invalid');
    expect(parseRepoInput('owner/repo"onclick="alert(1)').kind).toBe('invalid');
    expect(parseRepoInput('owner/repo\u202Egit').kind).toBe('invalid');
    expect(parseRepoInput('../repo').kind).toBe('invalid');
    expect(parseRepoInput('owner/../repo').kind).toBe('invalid');
    // Extra path with .. is dropped; the repository key itself is fine.
    expect(parseRepoInput('owner/repo/../../../etc/passwd')).toEqual({
      kind: 'repo',
      repo: 'owner/repo',
    });
  });

  it('property: any valid owner/name inside these URL shapes comes back exact', () => {
    const segment = fc
      .stringMatching(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,30}$/)
      .filter((s) => !s.includes('..'));
    const shapes = (
      owner: string,
      name: string,
    ): string[] => [
      `${owner}/${name}`,
      `https://github.com/${owner}/${name}`,
      `http://github.com/${owner}/${name}`,
      `https://www.github.com/${owner}/${name}`,
      `github.com/${owner}/${name}`,
      `https://github.com/${owner}/${name}/`,
      `https://github.com/${owner}/${name}.git`,
      `https://github.com/${owner}/${name}/tree/main`,
      `https://github.com/${owner}/${name}/blob/main/file.yml`,
      `https://github.com/${owner}/${name}/pull/3`,
      `https://github.com/${owner}/${name}/issues`,
      `https://github.com/${owner}/${name}/actions`,
      `https://github.com/${owner}/${name}/releases`,
      `https://github.com/${owner}/${name}?tab=readme`,
      `https://github.com/${owner}/${name}#section`,
      `git@github.com:${owner}/${name}.git`,
      `  https://github.com/${owner}/${name}/tree/main  `,
    ];
    fc.assert(
      fc.property(segment, segment, (owner, name) => {
        const want = `${owner}/${name}`;
        for (const form of shapes(owner, name)) {
          expect(normalizeRepo(form)).toBe(want);
        }
      }),
      { numRuns: 80 },
    );
  });
});
