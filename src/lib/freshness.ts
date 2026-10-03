/**
 * Client and SSR helpers for ledger data freshness notices.
 * The chip text is always rendered from build-time data; the visitor
 * clock is used only to decide whether to show the delay notice.
 */

export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** True when the embedded data timestamp is older than six hours vs nowMs. */
export function isDataStale(dataIso: string, nowMs: number): boolean {
  const t = Date.parse(dataIso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t > STALE_AFTER_MS;
}

/** Quiet notice copy. dataLabel is the already-formatted "Ledger as of" time. */
export function staleNoticeText(dataLabel: string): string {
  return `Data is from ${dataLabel}. Our last update was delayed.`;
}
