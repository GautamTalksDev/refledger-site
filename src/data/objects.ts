import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ObjectRecord = {
  sha: string;
  kind: string;
  commit_sha?: string;
  tree_sha?: string;
  action_yml_sha?: string;
};

const PLACEHOLDER = /^0{39}[0-2]$/;

export function isPlaceholderSha(sha: string | undefined | null): boolean {
  if (!sha) return true;
  return PLACEHOLDER.test(sha);
}

/**
 * Load objects.jsonl from the data branch cache into a sha → record map.
 * Last write wins for a given sha.
 */
export function loadObjectCache(dataDir: string): Map<string, ObjectRecord> {
  const path = join(dataDir, 'objects.jsonl');
  const map = new Map<string, ObjectRecord>();
  if (!existsSync(path)) return map;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as ObjectRecord;
    if (!row.sha) {
      throw new Error(`objects.jsonl: row missing sha`);
    }
    map.set(row.sha, row);
  }
  return map;
}

/**
 * Resolve the commit a tag tip pins to.
 * Lightweight: target_sha is the commit.
 * Annotated: use peeled commit_sha when real; else peel via objects.jsonl.
 */
export function resolvePinCommit(
  tip: {
    ref_type: string;
    target_sha: string;
    commit_sha?: string;
  },
  objects: Map<string, ObjectRecord>,
): string | null {
  if (tip.ref_type === 'lightweight') {
    if (!isPlaceholderSha(tip.target_sha)) return tip.target_sha;
    if (!isPlaceholderSha(tip.commit_sha)) return tip.commit_sha!;
    return null;
  }

  // Annotated (or other): prefer a real peeled commit_sha.
  if (!isPlaceholderSha(tip.commit_sha)) return tip.commit_sha!;

  const obj = objects.get(tip.target_sha);
  if (obj?.commit_sha && !isPlaceholderSha(obj.commit_sha)) {
    return obj.commit_sha;
  }
  // Some peels are stored with sha == tag object but commit_sha set to the peel.
  if (obj?.sha && obj.kind === 'commit' && !isPlaceholderSha(obj.sha) && obj.commit_sha) {
    // If sha equals target (tag object) but commit_sha differs, use commit_sha.
    if (obj.commit_sha !== obj.sha && !isPlaceholderSha(obj.commit_sha)) {
      return obj.commit_sha;
    }
  }
  return null;
}
