/**
 * How-it-works interactive: toy, time wall, live SHA-256 margin.
 */
import { setHTML } from '../lib/trusted-html';

export type HowPagePayload = {
  genesisMs: number;
  nowMs: number;
  wallRows: string[];
  events: { h: number; text: string }[];
  gapStartH: number | null;
  gapEndH: number | null;
  firstRowMoveH: number | null;
  canaryDotHs: number[];
  actionCount: number;
  repositoryCount: number;
};

/** @deprecated alias */
export type HowPayload = HowPagePayload;

const MONTHS = [
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

function pad(n: number) {
  return (n < 10 ? '0' : '') + n;
}

function fmt(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => ('0' + b.toString(16)).slice(-2))
    .join('');
}

function toast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

export function bootHowPage(payload: HowPagePayload) {
  const {
    genesisMs,
    nowMs,
    wallRows: wallRowsIn,
    events: eventsIn,
    gapStartH,
    gapEndH,
    firstRowMoveH,
    canaryDotHs: canaryIn,
    actionCount,
    repositoryCount,
  } = payload;
  const wallRows = Array.isArray(wallRowsIn) ? wallRowsIn : [];
  const events = Array.isArray(eventsIn) ? eventsIn : [];
  const canaryDotHs = Array.isArray(canaryIn) ? canaryIn : [];
  const totalHours = Math.max((nowMs - genesisMs) / 3_600_000, 1);

  const pop = document.getElementById('how-population');
  if (pop) {
    pop.textContent = `${actionCount} actions from ${repositoryCount} repositories. Not all of GitHub, on purpose: a short list watched perfectly beats a long one watched badly.`;
  }

  // Update lede count in section 2 if present
  const watchLede = document.querySelector(
    '[data-sec="2"] p[data-text]',
  ) as HTMLElement | null;
  if (watchLede && watchLede.textContent?.includes('actions from')) {
    watchLede.textContent = `${actionCount} actions from ${repositoryCount} repositories, chosen for heavy use and past incidents, plus everything they depend on. Press play to watch time pass.`;
  }

  const toy = { moved: false, erased: false };
  function drawToy() {
    const svg = document.getElementById('toy-svg');
    if (!svg) return;
    const m = toy.moved;
    svg.setAttribute(
      'aria-label',
      m
        ? 'The tag v1.0.0 now points at code nobody reviewed.'
        : 'The tag v1.0.0 points at the code you reviewed.',
    );
    setHTML(
      svg,
      '<g font-family="B612, sans-serif" font-size="11.5" fill="currentColor" opacity=".65"><text x="0" y="16">Your workflow</text><text x="360" y="16">The action\'s repository</text></g>' +
        '<rect x="0" y="36" width="180" height="50" rx="25" fill="var(--ink)"></rect><text x="90" y="67" text-anchor="middle" font-family="B612 Mono, monospace" font-size="15" fill="var(--paper)">@v1.0.0</text>' +
        '<rect x="360" y="36" width="280" height="50" rx="13" fill="var(--card)" stroke="' +
        (m ? 'var(--rule)' : 'var(--ink)') +
        '" stroke-width="1.5"></rect><text x="378" y="59" font-family="B612 Mono, monospace" font-size="14" fill="currentColor" opacity="' +
        (m ? 0.45 : 1) +
        '">a1b2c3d</text><text x="378" y="76" font-family="B612, sans-serif" font-size="11" fill="currentColor" opacity=".6">Reviewed by you on Monday</text>' +
        '<rect x="360" y="136" width="280" height="50" rx="13" fill="var(--card)" stroke="' +
        (m ? 'var(--blue)' : 'var(--rule)') +
        '" stroke-width="1.5" stroke-dasharray="' +
        (m ? '0' : '5 5') +
        '"></rect><text x="378" y="159" font-family="B612 Mono, monospace" font-size="14" fill="' +
        (m ? 'var(--blue)' : 'currentColor') +
        '" opacity="' +
        (m ? 1 : 0.45) +
        '">0e58ed8</text><text x="378" y="176" font-family="B612, sans-serif" font-size="11" fill="currentColor" opacity=".6">Pushed tonight. Reviewed by nobody.</text>' +
        (m
          ? '<path d="M180 61 H270" stroke="currentColor" stroke-width="2.4" fill="none"></path><path class="draw" d="M270 61 V161 H360" stroke="var(--blue)" stroke-width="2.6" fill="none"></path><circle cx="270" cy="111" r="5.5" fill="var(--blue)"></circle>'
          : '<path class="draw" d="M180 61 H360" stroke="currentColor" stroke-width="2.4" fill="none"></path>'),
    );
    const run = document.getElementById('toy-run');
    if (run)
      setHTML(
        run,
        'Run some-org/action@v1.0.0<br>Resolving tag v1.0.0<br>Resolved to <b class="toy-sha' +
          (m ? ' on' : '') +
          '">' +
          (m ? '0e58ed8' : 'a1b2c3d') +
          '</b><br><span class="toy-run-note' +
          (m ? ' on' : '') +
          '">' +
          (m ? 'Running code nobody reviewed.' : 'Running the code you reviewed.') +
          '</span>',
      );
    const msg = document.getElementById('toy-msg');
    if (msg)
      msg.textContent = !m
        ? 'Your workflow says @v1.0.0. Right now, that means the code you reviewed.'
        : toy.erased
          ? 'Refused. Entries can never be edited or removed. A mistake gets a new correction entry, chained after it, in public.'
          : 'Same label. Different code. Your next run executes it, and now there is a signed record of when it changed.';
    const btns = document.getElementById('toy-btns');
    if (btns)
      setHTML(
        btns,
        !m
          ? '<button type="button" class="btn b-blue" data-act="toymove">Move the tag</button>'
          : (toy.erased
              ? ''
              : '<button type="button" class="btn b-ink" data-act="toyerase">Now try to erase the record</button>') +
            '<button type="button" class="btn b-line" data-act="toyreset">Play again</button>',
      );
    const led = document.getElementById('toy-ledger');
    if (led)
      setHTML(
        led,
        !m
          ? '<span class="ins muted u-433de30b">Nothing has moved. Nothing to write down.</span>'
          : '<div class="' +
            (toy.erased ? 'shake' : 'rise') +
            ' u-3ae056cd"><span class="mono u-8afd7da5">seq 1</span><span><b>v1.0.0</b> moved from <span class="mono u-5e0faad2">a1b2c3d</span> to <span class="mono u-5e0faad2">0e58ed8</span></span><span class="ins u-247ff370">Signed</span></div>',
      );
  }

  function wallSVG(t: number, rowsList: string[], w: number, h: number) {
    const X0 = 270;
    const X1 = w - 20;
    const W = X1 - X0;
    const hx = (hrs: number) => X0 + (hrs / totalHours) * W;
    const hours = (t / 100) * totalHours;
    const cx = X0 + (t / 100) * W;
    const gs = gapStartH != null ? hx(gapStartH) : null;
    const ge = gapEndH != null ? hx(gapEndH) : null;
    const rj = firstRowMoveH != null ? hx(firstRowMoveH) : null;

    const seg = (y: number, end: number) => {
      if (gs == null || ge == null) return `M${X0} ${y} H${end}`;
      if (end <= gs) return `M${X0} ${y} H${end}`;
      if (end <= ge) return `M${X0} ${y} H${gs}`;
      return `M${X0} ${y} H${gs} M${ge} ${y} H${end}`;
    };

    let s = `<svg class="u-9732559f" viewBox="0 0 ${w} ${h}" role="img" aria-label="Watched actions drawn as lines through time, up to ${fmt(genesisMs + hours * 3600000)} UTC">`;
    s += `<g font-family="B612, sans-serif" font-size="11" fill="currentColor" opacity=".6"><text x="${X0}" y="16">${fmt(genesisMs).split(',')[0]}</text><text x="${hx(totalHours)}" y="16" text-anchor="end">now</text></g>`;
    s += `<line x1="${X0}" y1="26" x2="${X1}" y2="26" stroke="currentColor" stroke-opacity=".25"></line>`;
    if (gs != null && ge != null && cx > gs) {
      s += `<rect x="${gs}" y="32" width="${Math.min(cx, ge) - gs}" height="${h - 44}" fill="currentColor" fill-opacity=".12"></rect>`;
    }
    rowsList.forEach((name, i) => {
      const y = 52 + i * 30;
      const end =
        i === 0 && rj != null ? Math.min(cx, rj) : cx;
      const safeName = String(name).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
      s += `<text x="${X0 - 14}" y="${y + 4}" text-anchor="end" font-family="B612, sans-serif" font-size="11.5" fill="currentColor" opacity="${i === 0 ? 1 : 0.75}">${safeName}</text>`;
      s += `<path d="${seg(y, end)}" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"></path>`;
      if (i === 0 && rj != null && cx > rj) {
        s += `<path d="M${rj} ${y} V${y + 8} H${cx}" stroke="var(--blue)" stroke-width="2.6" fill="none" stroke-linecap="round"></path><circle cx="${rj}" cy="${y + 4}" r="4.5" fill="var(--blue)"></circle>`;
      }
    });
    const cy = 52 + rowsList.length * 30 + 10;
    s += `<text x="${X0 - 14}" y="${cy + 4}" text-anchor="end" font-family="B612, sans-serif" font-size="11.5" fill="currentColor" opacity=".6">Canary, our test repo</text>`;
    s += `<line x1="${X0}" y1="${cy}" x2="${cx}" y2="${cy}" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="2 4"></line>`;
    for (const hh of canaryDotHs) {
      if (hh <= hours) {
        s += `<circle cx="${hx(hh)}" cy="${cy}" r="3" fill="var(--blue)"></circle>`;
      }
    }
    s += `<line x1="${cx}" y1="28" x2="${cx}" y2="${h - 8}" stroke="var(--blue)" stroke-width="1.5"></line></svg>`;
    return s;
  }

  const scrub = {
    t: 100,
    playing: null as ReturnType<typeof setInterval> | null,
  };
  function drawWall() {
    const el = document.getElementById('wall');
    if (!el) return;
    setHTML(
      el,
      wallSVG(scrub.t, wallRows, 1000, 52 + wallRows.length * 30 + 24),
    );
    const hours = (scrub.t / 100) * totalHours;
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = fmt(genesisMs + hours * 3600000);
    let latest = events[0]?.text ?? '';
    for (const e of events) {
      if (e.h <= hours) latest = e.text;
    }
    const latestEl = document.getElementById('latest');
    if (latestEl) latestEl.textContent = latest;
    const r = document.getElementById('scrub') as HTMLInputElement | null;
    if (r && Number(r.value) !== scrub.t) r.value = String(scrub.t);
    const b = document.getElementById('playbtn');
    if (b) {
      b.textContent = scrub.playing
        ? 'Pause'
        : scrub.t >= 100
          ? 'Replay'
          : 'Play';
      b.setAttribute('aria-pressed', scrub.playing ? 'true' : 'false');
    }
  }

  let baseline: string[] | null = null;
  function rehash() {
    const secs = Array.from(document.querySelectorAll('[data-sec]'));
    if (!secs.length) return;
    const texts = secs.map((s) =>
      Array.from(s.querySelectorAll('[data-text]'))
        .map((n) => n.textContent)
        .join('\n'),
    );
    if (!(window.crypto && crypto.subtle)) {
      const v = document.getElementById('verdict');
      if (v)
        v.textContent =
          "Your browser can't compute SHA-256 here, so the margin is not live.";
      return;
    }
    let prev = '0'.repeat(64);
    const chain: { prev: string; hash: string }[] = [];
    const step = (i: number) => {
      if (i >= texts.length) {
        done(chain);
        return;
      }
      void crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(prev + '\n' + texts[i]))
        .then((buf) => {
          const h = hex(buf);
          chain.push({ prev, hash: h });
          prev = h;
          step(i + 1);
        });
    };
    const done = (c: { prev: string; hash: string }[]) => {
      if (!baseline) baseline = c.map((x) => x.hash);
      let firstBad = -1;
      c.forEach((x, i) => {
        if (firstBad === -1 && x.hash !== baseline![i]) firstBad = i;
      });
      secs.forEach((s, i) => {
        const st = s.querySelector('[data-stamp]');
        if (!st) return;
        const prevEl = st.querySelector('[data-prev]');
        const hashEl = st.querySelector('[data-hash]');
        if (prevEl) prevEl.textContent = 'prev ' + c[i].prev.slice(0, 8);
        if (hashEl) hashEl.textContent = 'hash ' + c[i].hash.slice(0, 8);
        st.classList.toggle('broken', firstBad !== -1 && i >= firstBad);
      });
      const v = document.getElementById('verdict');
      if (v) {
        v.classList.toggle('verdict-ok', firstBad === -1);
        v.classList.toggle('verdict-bad', firstBad !== -1);
        v.textContent =
          firstBad === -1
            ? `Page integrity verified. ${c.length} of ${c.length} sections chained, hashed live in your browser.`
            : `Chain broken at section ${firstBad + 1}. Every section after it no longer matches what came before.`;
      }
      const tb = document.getElementById('tamperbtn');
      if (tb)
        tb.textContent =
          firstBad === -1 ? 'Change one word' : 'Undo the change';
    };
    step(0);
  }

  drawToy();
  drawWall();
  rehash();

  document.getElementById('scrub')?.addEventListener('input', (e) => {
    if (scrub.playing) {
      clearInterval(scrub.playing);
      scrub.playing = null;
    }
    scrub.t = Number((e.target as HTMLInputElement).value);
    drawWall();
  });

  document.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest?.('[data-sec]') && t.isContentEditable) rehash();
  });

  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]');
    if (!b) return;
    const a = b.getAttribute('data-act');
    if (a === 'toymove') {
      toy.moved = true;
      toy.erased = false;
      drawToy();
    }
    if (a === 'toyerase') {
      toy.erased = true;
      drawToy();
    }
    if (a === 'toyreset') {
      toy.moved = false;
      toy.erased = false;
      drawToy();
    }
    if (a === 'play') {
      if (scrub.playing) {
        clearInterval(scrub.playing);
        scrub.playing = null;
        drawWall();
        return;
      }
      if (scrub.t >= 100) scrub.t = 0;
      scrub.playing = setInterval(() => {
        scrub.t = Math.min(100, scrub.t + 0.55);
        if (scrub.t >= 100) {
          if (scrub.playing) clearInterval(scrub.playing);
          scrub.playing = null;
        }
        drawWall();
      }, 50);
      drawWall();
    }
    if (a === 'tamper') {
      const t = document.querySelector(
        '[data-sec="3"] h2[data-text]',
      ) as HTMLElement | null;
      if (!t) return;
      if (t.dataset.orig) {
        t.textContent = t.dataset.orig;
        delete t.dataset.orig;
      } else {
        t.dataset.orig = t.textContent || '';
        t.textContent = 'Every move is signed and chained, mostly.';
      }
      rehash();
    }
    if (a === 'editpage') {
      const on = b.getAttribute('aria-pressed') !== 'true';
      document.querySelectorAll('[data-sec] [data-text]').forEach((n) => {
        n.setAttribute('contenteditable', on ? 'true' : 'false');
      });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? 'Stop editing' : 'Edit the page yourself';
      if (on) toast('Click any text above and change it.');
    }
  });
}
