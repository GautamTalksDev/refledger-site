/**
 * Validate owner/repo (and optional ref) before building in-site or GitHub URLs.
 */

const OWNER_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function isValidRepoKey(key: string): boolean {
  return OWNER_REPO.test(key) && !key.includes('..') && key.length <= 200;
}

/** Build a same-origin action history href, or null if the key is hostile. */
export function actionHistoryHref(key: string, ref?: string): string | null {
  if (!isValidRepoKey(key)) return null;
  const [owner, repo] = key.split('/');
  let href = `/a/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  if (ref != null && ref !== '') {
    if (ref.length > 256) return null;
    href += `/${encodeURIComponent(ref)}`;
  }
  return href;
}

/** Build a github.com URL for a validated owner/repo. */
export function githubRepoUrl(key: string): string | null {
  if (!isValidRepoKey(key)) return null;
  const [owner, repo] = key.split('/');
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export const EXT_REL = 'noopener noreferrer';
