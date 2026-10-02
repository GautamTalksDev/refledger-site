/** Moved feed canary filter (no inline script; CSP script-src 'self'). */

export function bootMovedFilter(ecoCount: number): void {
  const on = new URLSearchParams(location.search).get('canary') === '1';
  const rows = document.querySelectorAll('#moved-feed a.feedrow');
  let shown = 0;
  rows.forEach((r) => {
    const canary = r.getAttribute('data-canary') === '1';
    const show = on || !canary;
    (r as HTMLElement).hidden = !show;
    if (show) shown++;
  });
  const note = document.querySelector('[data-canary-note]');
  if (note) (note as HTMLElement).hidden = on;
  const count = document.getElementById('moved-count');
  if (count) {
    count.textContent = on
      ? shown + ' moves, ' + (shown - ecoCount) + ' of them our own tests'
      : ecoCount +
        (ecoCount === 1 ? ' ecosystem move' : ' ecosystem moves') +
        ' this week';
  }
  document.querySelectorAll('[data-moved-tab]').forEach((a) => {
    const isEco = a.getAttribute('data-moved-tab') === 'eco';
    const active = isEco ? !on : on;
    a.classList.toggle('b-ink', active);
    a.classList.toggle('b-line', !active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
