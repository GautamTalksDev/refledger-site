/**
 * Client and SSR helpers for data freshness notices.
 * The chip uses the newest observation time from the build (last check).
 * The visitor clock only decides whether to show the delay notice.
 */

export const STALE_AFTER_MS = 30 * 60 * 1000;

/** True when the last check timestamp is older than 30 minutes vs nowMs. */
export function isDataStale(dataIso: string, nowMs: number): boolean {
  const t = Date.parse(dataIso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t > STALE_AFTER_MS;
}

/** Quiet notice copy. dataLabel is the already-formatted "Last checked" time. */
export function staleNoticeText(dataLabel: string): string {
  return `Data is from ${dataLabel}. Our last update was delayed.`;
}

/** Newest observation.observed_at, or null when there are no observations. */
export function newestObservedAt(
  observations: ReadonlyArray<{ observed_at: string }>,
): string | null {
  let newest: string | null = null;
  for (const o of observations) {
    if (!newest || o.observed_at > newest) newest = o.observed_at;
  }
  return newest;
}
