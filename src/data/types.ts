/**
 * Typed models for the Refledger public site data layer.
 *
 * Deletion entries may carry `classification` by LOG-FORMAT v1 convention
 * (see correction seq 40). NEVER display classification for deletions.
 *
 * Canary repo `GautamTalksDev/canary` is always labelled Canary and is never
 * counted in ecosystem totals.
 */

export const CANARY_REPO = 'GautamTalksDev/canary';

export type Classification =
  | 'content_change'
  | 'commit_metadata_only'
  | 'release_level_only';

export type Severity = 'high' | 'medium' | 'low' | 'info';

export type RefType = 'lightweight' | 'annotated';

export type RefForm =
  | 'floating_major'
  | 'floating_minor'
  | 'exact'
  | 'named_channel'
  | 'other';

export type Ancestry = 'ahead' | 'behind' | 'diverged' | 'identical';

export type Binding = {
  target_sha: string;
  commit_sha: string;
  tree_sha: string;
  first_observed: string;
  last_observed?: string;
  observation_count: number;
  stable_days: number;
  action_yml_sha?: string;
};

export type Diff = {
  files_added: number;
  files_removed: number;
  files_modified: number;
  files_renamed: number;
  paths: string[];
  diff_possibly_truncated: boolean;
};

export type CorrelationPayload = {
  batch_id: string;
  member_seqs: number[];
  refs_moved_together: string[];
  all_to_same_target: boolean;
  note?: string;
};

export type ObservationFileDigest = {
  path: string;
  sha256: string;
};

export type ObservationDigestPayload = {
  date: string;
  repos_polled: number;
  ok: number;
  not_modified: number;
  failed: number;
  skipped: number;
  files: ObservationFileDigest[];
  note?: string;
};

export type PopulationChangeKind = 'added' | 'removed';

export type PopulationReason =
  | { type: 'seed' }
  | { type: 'transitive'; via: string }
  | { type: 'manual' }
  | { type: 'restored' };

export type PopulationChangePayload = {
  change: PopulationChangeKind;
  reason: PopulationReason;
  path?: string;
  note?: string;
};

export type EntryBase = {
  format_version: 1;
  seq: number;
  prev_hash: string;
  entry_hash: string;
  recorded_at: string;
};

export type MoveEntry = EntryBase & {
  event: 'move';
  repo: string;
  ref: string;
  from: Binding;
  to: Binding;
  classification: Classification;
  severity: Severity;
  observation_window_seconds: number;
  source_observations: string[];
  ref_type_before?: RefType;
  ref_type_after?: RefType;
  ref_form?: RefForm;
  ancestry?: Ancestry;
  diff?: Diff;
  detection_latency_note?: string;
};

/**
 * Deletion may include `classification` on the wire (format convention).
 * Callers must not surface it in UI (correction seq 40).
 */
export type DeletionEntry = EntryBase & {
  event: 'deletion';
  repo: string;
  ref: string;
  from: Binding;
  to: Binding;
  /** Present by format convention; never display. */
  classification?: Classification;
  severity: Severity;
  observation_window_seconds: number;
  source_observations: string[];
  ref_type_before?: RefType;
  ref_type_after?: RefType;
  ref_form?: RefForm;
};

export type RecreationEntry = EntryBase & {
  event: 'recreation';
  repo: string;
  ref: string;
  from: Binding;
  to: Binding;
  classification: Classification;
  severity: Severity;
  observation_window_seconds: number;
  gap_seconds: number;
  source_observations: string[];
  ref_type_before?: RefType;
  ref_type_after?: RefType;
  ref_form?: RefForm;
};

export type CorrelationEntry = EntryBase & {
  event: 'correlation';
  repo?: string;
  correlation: CorrelationPayload;
};

export type CorrectionEntry = EntryBase & {
  event: 'correction';
  corrects_seq: number;
  reason: string;
  /** Optional structured fix from a freeze-exception Correction append. */
  corrected_classification?: Classification;
  corrected_severity?: Severity;
  sets?: {
    classification?: Classification;
    severity?: Severity;
  };
};

export type ObservationDigestEntry = EntryBase & {
  event: 'observation_digest';
  observation_digest: ObservationDigestPayload;
};

export type PopulationChangeEntry = EntryBase & {
  event: 'population_change';
  repo: string;
  population_change: PopulationChangePayload;
  source_observations?: string[];
};

export type RepoUnavailableEntry = EntryBase & {
  event: 'repo_unavailable';
  repo: string;
  http_status: number;
};

export type RepoRedirectedEntry = EntryBase & {
  event: 'repo_redirected';
  repo: string;
  http_status: number;
  redirect_location: string;
};

export type LedgerEntry =
  | MoveEntry
  | DeletionEntry
  | RecreationEntry
  | CorrelationEntry
  | CorrectionEntry
  | ObservationDigestEntry
  | PopulationChangeEntry
  | RepoUnavailableEntry
  | RepoRedirectedEntry;

export type HeadObject = {
  seq: number;
  entry_hash: string;
  recorded_at: string;
  log_id: string;
};

export type RekorMeta = {
  kind?: string;
  api_version?: string;
  artifact_hash?: string;
  attempts?: number;
  log_id?: string;
  log_index?: number;
  integrated_time?: number;
  uuid?: string;
  error?: string;
};

export type SignedHead = {
  head: HeadObject;
  signature: string;
  public_key: string;
  key_id: string;
  rekor?: RekorMeta;
};

export type ObservedRef = {
  name: string;
  ref_type: RefType;
  target_sha: string;
  commit_sha?: string;
  tree_sha?: string;
  peeled_type?: 'commit' | 'tree' | 'blob';
  action_yml_sha?: string;
};

export type SkipReason =
  | 'budget_exhausted'
  | 'secondary_limit_backoff'
  | 'shutdown_mid_sweep'
  | { scheduler_lag: { scheduled: string; actual: string } }
  | { poller_down: { from: string; to: string } };

export type ErrorClass =
  | 'network'
  | 'api_client'
  | 'api_server'
  | 'upstream'
  | 'protocol'
  | 'secondary_rate_limit';

export type ObservationOutcome =
  | { type: 'ok'; http_status: number; etag?: string; refs: ObservedRef[] }
  | { type: 'not_modified'; http_status: number; etag: string }
  | {
      type: 'failed';
      http_status: number;
      error_class: ErrorClass | string;
      backoff_applied: number;
    }
  | { type: 'skipped'; reason: SkipReason };

export type Observation = {
  observation_id: string;
  repo: string;
  observed_at: string;
  poller_version: string;
  method: string;
  outcome: ObservationOutcome;
  archived?: boolean;
  scheduled_at?: string;
  actual_start?: string;
  path?: string;
};

export type SeedSource =
  | { type: 'official_org'; org: string }
  | { type: 'marketplace' }
  | { type: 'acm_rep_paper' }
  | { type: 'incident_report'; name: string };

export type WatchedReason =
  | { type: 'seed'; source: SeedSource }
  | {
      type: 'transitive';
      via_repo: string;
      via_path?: string;
      via_commit: string;
    }
  | { type: 'manual' }
  | { type: 'restored' };

export type WatchedEntry = {
  repo: string;
  path?: string;
  added_at: string;
  reason: WatchedReason;
  active: boolean;
  note?: string;
};

/** Current tip of a tag from the newest Ok observation (peeled when present). */
export type TagTip = {
  name: string;
  ref_type: RefType;
  target_sha: string;
  commit_sha?: string;
  tree_sha?: string;
  action_yml_sha?: string;
  /** Commit SHA suitable for a workflow pin line, or null if unresolved. */
  pin_commit: string | null;
  peeled: boolean;
  observed_at: string;
  observation_id: string;
};

export type TagBindingEvent =
  | { kind: 'move'; seq: number; recorded_at: string; from: Binding; to: Binding }
  | { kind: 'deletion'; seq: number; recorded_at: string; from: Binding }
  | {
      kind: 'recreation';
      seq: number;
      recorded_at: string;
      from: Binding;
      to: Binding;
      gap_seconds: number;
    };

export type TagTimeline = {
  ref: string;
  events: TagBindingEvent[];
  tip: TagTip | null;
};

export type RepoView = {
  repo: string;
  path?: string;
  canary: boolean;
  watched_since: string | null;
  active: boolean;
  tags: TagTimeline[];
  entries: LedgerEntry[];
  /** Count of observations (any outcome) for this repo. */
  checks_so_far: number;
  /** Newest observation timestamp. */
  last_check_at: string | null;
  /** Newest binding event, else newest observation ("last change" in the honest sense). */
  last_change_at: string | null;
};

export type RecordedGap = {
  kind:
    | 'poller_down'
    | 'scheduler_lag'
    | 'secondary_limit_backoff'
    | 'budget_exhausted'
    | 'shutdown_mid_sweep'
    | 'other_skip';
  repo: string;
  observed_at: string;
  observation_id: string;
  detail?: Record<string, string>;
};

export type Seal = {
  digest: ObservationDigestEntry;
  head: SignedHead | null;
  rekor_log_index: number | null;
};

export type RawLedgerData = {
  entries: LedgerEntry[];
  heads: SignedHead[];
  observations: Observation[];
  watched: WatchedEntry[];
  incidents_md: string;
  /** docs/incident-summaries.md from the refledger repo. */
  incident_summaries_md: string;
  public_key_md: string;
  method_md: string;
  /** Object cache from data branch objects.jsonl (sha → record). */
  objects: Map<string, import('./objects').ObjectRecord>;
};

/** True when repo is the canary (never count in ecosystem totals). */
export function isCanary(repo: string): boolean {
  return repo === CANARY_REPO;
}

/**
 * Classification is required on the wire for deletions by format convention,
 * but must never be shown (correction seq 40).
 *
 * Prefer {@link effectiveDisplayClassification} when Correction / same-commit
 * overrides matter.
 */
export function displayClassification(
  entry: LedgerEntry,
): Classification | null {
  if (entry.event === 'deletion') return null;
  if (entry.event === 'move' || entry.event === 'recreation') {
    return entry.classification;
  }
  return null;
}

/**
 * Display classification after Correction overlay and same-commit fact rule.
 */
export function effectiveDisplayClassification(
  entry: LedgerEntry,
  correction?: CorrectionEntry | null,
): Classification | null {
  if (entry.event === 'deletion') return null;
  if (entry.event !== 'move' && entry.event !== 'recreation') return null;

  const from = entry.from?.commit_sha;
  const to = entry.to?.commit_sha;
  if (from && to && from.toLowerCase() === to.toLowerCase()) {
    return 'release_level_only';
  }

  const corrected =
    correction?.corrected_classification ??
    correction?.sets?.classification ??
    null;
  if (corrected) return corrected;

  return entry.classification;
}
