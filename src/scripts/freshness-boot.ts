import { isDataStale, staleNoticeText } from '../lib/freshness';

/** Show the quiet delay notice when embedded ledger data is older than 6 hours. */
export function bootFreshnessNotice(nowMs: number = Date.now()): void {
  const chip = document.querySelector<HTMLElement>('[data-ledger-as-of]');
  const notice = document.getElementById('stale-notice');
  if (!chip || !notice) return;
  const iso = chip.getAttribute('data-ledger-as-of') || '';
  const label = chip.getAttribute('data-ledger-label') || '';
  if (!iso || !label) return;
  if (!isDataStale(iso, nowMs)) {
    notice.hidden = true;
    notice.textContent = '';
    return;
  }
  notice.textContent = staleNoticeText(label);
  notice.hidden = false;
}
