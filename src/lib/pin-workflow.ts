/**
 * Workflow pin analysis. Pure functions; browser and Node safe.
 * Line-scan parser (no yaml runtime) keeps /pin under the JS budget.
 * No verdicts. Binding age notes are factual only.
 */

export type UsesRef = {
  raw: string;
  owner?: string;
  repo?: string;
  path?: string;
  ref?: string;
  kind: 'action' | 'reusable_workflow' | 'local' | 'docker' | 'other';
  lineHint?: number;
};

export type PinResultRow = {
  uses: string;
  kind: UsesRef['kind'];
  watched: boolean;
  rewritten?: string;
  pin_commit?: string | null;
  version_comment?: string;
  binding_age_hours?: number | null;
  last_move_at?: string | null;
  already_pinned: boolean;
  version_comment_mismatch?: boolean;
  note?: string;
  request_watch_url?: string;
};

export type PinAnalysis = {
  rows: PinResultRow[];
  rewrittenYaml: string;
  summary: {
    total: number;
    watched: number;
    unwatched: number;
    rewritten: number;
    mismatches: number;
    young_bindings: number;
  };
};

const USES_RE =
  /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(\/[\w./-]*)?@(.+)$/;

export const DEFAULT_YOUNG_HOURS = 72;

export function parseUsesString(raw: string): UsesRef {
  const s = raw.trim();
  if (s.startsWith('./') || s.startsWith('../')) {
    return { raw: s, kind: 'local' };
  }
  if (s.startsWith('docker://')) {
    return { raw: s, kind: 'docker' };
  }
  const m = USES_RE.exec(s);
  if (!m) return { raw: s, kind: 'other' };
  const path = m[3] ? m[3].replace(/^\//, '') : undefined;
  const kind =
    path && (path.endsWith('.yml') || path.endsWith('.yaml'))
      ? 'reusable_workflow'
      : 'action';
  return {
    raw: s,
    owner: m[1],
    repo: m[2],
    path,
    ref: m[4],
    kind,
  };
}

/** Collect uses: lines across multi-doc YAML via line scan. */
export function collectUses(yamlText: string): UsesRef[] {
  const found: UsesRef[] = [];
  const seen = new Set<string>();
  for (const line of yamlText.split('\n')) {
    const m = /^\s*(?:-\s*)?uses:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    let val = m[1].trim().replace(/^['"]|['"]$/g, '');
    val = val.replace(/\s+#.*$/, '');
    const ref = parseUsesString(val);
    if (ref.kind === 'local' || ref.kind === 'docker') continue;
    if (seen.has(ref.raw)) continue;
    seen.add(ref.raw);
    found.push(ref);
  }
  return found;
}

export type ActionApiLite = {
  repo: string;
  tags: {
    tag: string;
    pin_commit: string | null;
    current: {
      commit_sha: string;
      first_observed?: string;
      last_observed?: string;
    } | null;
    history: { seq: number; recorded_at: string; event: string }[];
  }[];
};

function isFullSha(ref: string): boolean {
  return /^[0-9a-f]{40}$/i.test(ref);
}

function hoursSince(iso: string | undefined | null, now: Date): number | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 3600_000);
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function analyzeWorkflow(
  yamlText: string,
  apiByRepo: Map<string, ActionApiLite>,
  opts: {
    now?: Date;
    youngHours?: number;
    requestIssueUrl?: string;
  } = {},
): PinAnalysis {
  const now = opts.now ?? new Date();
  const youngHours = opts.youngHours ?? DEFAULT_YOUNG_HOURS;
  const requestIssueUrl =
    opts.requestIssueUrl ??
    'https://github.com/GautamTalksDev/refledger-site/issues/new?template=request-watch.yml';

  const uses = collectUses(yamlText);
  const rows: PinResultRow[] = [];
  let rewritten = yamlText;
  let rewrittenCount = 0;
  let mismatches = 0;
  let young = 0;
  let watchedN = 0;
  let unwatchedN = 0;

  for (const u of uses) {
    if (!u.owner || !u.repo || !u.ref) {
      rows.push({
        uses: u.raw,
        kind: u.kind,
        watched: false,
        already_pinned: false,
        note: 'Unrecognized uses form',
      });
      continue;
    }
    const repo = `${u.owner}/${u.repo}`;
    const ref = u.ref;
    const api = apiByRepo.get(repo);
    const alreadyPinned = isFullSha(ref);

    if (!api) {
      unwatchedN++;
      rows.push({
        uses: u.raw,
        kind: u.kind,
        watched: false,
        already_pinned: alreadyPinned,
        note: 'not watched yet',
        request_watch_url: requestIssueUrl,
      });
      continue;
    }

    watchedN++;

    if (alreadyPinned) {
      const tag = api.tags.find(
        (t) =>
          t.pin_commit?.toLowerCase() === ref.toLowerCase() ||
          t.current?.commit_sha?.toLowerCase() === ref.toLowerCase(),
      );
      const lineRe = new RegExp(
        `uses:\\s*${escapeReg(u.raw)}(?:\\s*#\\s*(\\S+))?`,
      );
      const lm = lineRe.exec(yamlText);
      const comment = lm?.[1];
      let mismatch = false;
      if (comment) {
        const commented = api.tags.find((t) => t.tag === comment);
        if (
          commented?.pin_commit &&
          commented.pin_commit.toLowerCase() !== ref.toLowerCase()
        ) {
          mismatch = true;
        }
      }
      if (mismatch) mismatches++;
      const lastMove = tag?.history.length
        ? tag.history[tag.history.length - 1].recorded_at
        : null;
      const age = hoursSince(
        tag?.current?.first_observed ?? tag?.current?.last_observed,
        now,
      );
      let note: string | undefined;
      if (age != null && age < youngHours) {
        young++;
        note = `This binding is ${age} hours old.`;
      }
      rows.push({
        uses: u.raw,
        kind: u.kind,
        watched: true,
        pin_commit: ref,
        version_comment: comment,
        binding_age_hours: age,
        last_move_at: lastMove,
        already_pinned: true,
        version_comment_mismatch: mismatch || undefined,
        note,
      });
      continue;
    }

    const tip = api.tags.find((t) => t.tag === ref);
    const pin = tip?.pin_commit ?? tip?.current?.commit_sha ?? null;
    const age = hoursSince(
      tip?.current?.first_observed ?? tip?.current?.last_observed,
      now,
    );
    const lastMove = tip?.history.length
      ? tip.history[tip.history.length - 1].recorded_at
      : null;
    let note: string | undefined;
    if (age != null && age < youngHours) {
      young++;
      note = `This binding is ${age} hours old.`;
    }

    let rewrittenUses: string | undefined;
    if (pin) {
      rewrittenUses = `${repo}@${pin} # ${ref}`;
      const next = rewritten.replace(
        new RegExp(`uses:\\s*['"]?${escapeReg(u.raw)}['"]?`),
        `uses: ${rewrittenUses}`,
      );
      if (next !== rewritten) {
        rewritten = next;
        rewrittenCount++;
      }
    }

    rows.push({
      uses: u.raw,
      kind: u.kind,
      watched: true,
      rewritten: rewrittenUses,
      pin_commit: pin,
      version_comment: ref,
      binding_age_hours: age,
      last_move_at: lastMove,
      already_pinned: false,
      note: pin ? note : 'Pin commit not resolved for this tag',
    });
  }

  return {
    rows,
    rewrittenYaml: rewritten,
    summary: {
      total: rows.length,
      watched: watchedN,
      unwatched: unwatchedN,
      rewritten: rewrittenCount,
      mismatches,
      young_bindings: young,
    },
  };
}

export function lineDiff(
  before: string,
  after: string,
): { type: 'equal' | 'add' | 'remove'; text: string }[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: { type: 'equal' | 'add' | 'remove'; text: string }[] = [];
  let i = 0;
  let j = 0;
  const max = Math.max(a.length, b.length);
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ type: 'equal', text: a[i] });
      i++;
      j++;
    } else if (
      j < b.length &&
      (i >= a.length || !a.slice(i + 1).includes(b[j]))
    ) {
      out.push({ type: 'add', text: b[j] });
      j++;
    } else if (i < a.length) {
      out.push({ type: 'remove', text: a[i] });
      i++;
    } else {
      out.push({ type: 'add', text: b[j] });
      j++;
    }
    if (out.length > max * 3) break;
  }
  return out;
}
