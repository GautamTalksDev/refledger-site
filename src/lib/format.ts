/**
 * Shared date/copy helpers for pages. No em/en dashes.
 */

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad(n: number): string {
  return (n < 10 ? '0' : '') + n;
}

/** "2 Oct, 16:20" (UTC, no year unless needed). */
export function fmtUtc(msOrIso: number | string): string {
  const d = new Date(msOrIso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "2 Oct, 16:20 UTC" for status strip. Always formats the ISO from build data. */
export function fmtLedgerAsOf(iso: string): string {
  return `${fmtUtc(iso)} UTC`;
}

export function agoFrom(ms: number, nowMs: number): string {
  const h = Math.round((nowMs - ms) / 3_600_000);
  if (h < 1) return 'less than an hour';
  if (h < 48) return h + (h === 1 ? ' hour' : ' hours');
  return Math.round(h / 24) + ' days';
}

export function severityClass(sev?: string | null): string {
  if (!sev) return '';
  const s = sev.toLowerCase();
  if (s === 'high') return 'sev-high';
  if (s === 'info') return 'sev-info';
  return '';
}

export function titleCaseSeverity(sev?: string | null): string {
  if (!sev) return '';
  return sev.charAt(0).toUpperCase() + sev.slice(1).toLowerCase();
}
