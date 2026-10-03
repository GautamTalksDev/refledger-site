import type { GapBand } from '../data/gaps';
import type { CorrelationCaption, TraceEvent } from '../data/index';
import type { RepoView, Seal } from '../data/types';

export type WallRange = 'genesis' | '7d' | '30d';

export type WallModel = {
  range: WallRange;
  buildTime: string;
  genesisAt: string;
  repos: RepoView[];
  canary: RepoView | null;
  events: TraceEvent[];
  seals: Seal[];
  gaps: GapBand[];
  hiddenUnchanged: number;
  correlations: CorrelationCaption[];
};

function rangeStart(range: WallRange, genesisAt: string, buildTime: string): string {
  if (range === 'genesis') return genesisAt;
  const ms = range === '7d' ? 7 : 30;
  const t = new Date(buildTime).getTime() - ms * 24 * 3600 * 1000;
  return new Date(t).toISOString();
}

function xFor(
  iso: string,
  startMs: number,
  endMs: number,
  padL: number,
  width: number,
): number {
  const t = new Date(iso).getTime();
  const clamped = Math.min(Math.max(t, startMs), endMs);
  const frac = endMs === startMs ? 1 : (clamped - startMs) / (endMs - startMs);
  return padL + frac * width;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const months = [
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
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export function buildWallModel(opts: {
  range: WallRange;
  buildTime: string;
  genesisAt: string;
  wallRepos: string[];
  allRepos: RepoView[];
  canary: RepoView | null;
  events: TraceEvent[];
  seals: Seal[];
  gaps: GapBand[];
  correlations: CorrelationCaption[];
}): WallModel {
  const start = rangeStart(opts.range, opts.genesisAt, opts.buildTime);
  const repos = opts.wallRepos
    .map((name) => opts.allRepos.find((r) => r.repo === name))
    .filter((r): r is RepoView => Boolean(r));
  const events = opts.events.filter((e) => e.recorded_at >= start);
  const hiddenUnchanged = opts.allRepos.filter(
    (r) =>
      !r.canary &&
      !opts.wallRepos.includes(r.repo) &&
      !opts.events.some((e) => e.repo === r.repo && !e.isCanary),
  ).length;

  return {
    range: opts.range,
    buildTime: opts.buildTime,
    genesisAt: opts.genesisAt,
    repos,
    canary: opts.canary,
    events,
    seals: opts.seals.filter((s) => {
      const headAt =
        s.head?.head.recorded_at ??
        `${s.digest.observation_digest.date}T00:00:00.000Z`;
      return headAt >= start;
    }),
    gaps: opts.gaps.filter((g) => {
      if (g.end < start) return false;
      const dur = new Date(g.end).getTime() - new Date(g.start).getTime();
      // Instantaneous markers clutter the wall; keep lasting bands and failures.
      if (g.source === 'inferred') return dur >= 60_000 || g.kind === 'silence';
      return dur >= 60_000 || g.kind === 'PollerDown' || g.kind === 'failed';
    }),
    hiddenUnchanged,
    correlations: opts.correlations.filter((c) => c.at >= start),
  };
}

type Row = {
  key: string;
  label: string;
  repo: string;
  isCanaryTag?: boolean;
  mono?: boolean;
};

export function renderWallSvg(model: WallModel): string {
  const padL = 300;
  const padR = 20;
  const plotW = 880;
  const width = padL + plotW + padR;
  const startMs = new Date(
    rangeStart(model.range, model.genesisAt, model.buildTime),
  ).getTime();
  const endMs = new Date(model.buildTime).getTime();
  const nowX = padL + plotW;

  const rows: Row[] = model.repos.map((r) => ({
    key: r.repo,
    label: r.repo,
    repo: r.repo,
  }));

  if (model.canary) {
    for (const t of model.canary.tags) {
      const tag = t.ref.startsWith('refs/tags/')
        ? t.ref.slice('refs/tags/'.length)
        : t.ref;
      rows.push({
        key: `${model.canary.repo}#${tag}`,
        label: tag,
        repo: model.canary.repo,
        isCanaryTag: true,
        mono: true,
      });
    }
  }

  const ecoCount = model.repos.length;
  const canaryCount = model.canary?.tags.length ?? 0;
  const rowH = 22;
  const padT = 44;
  const ecoBottom = padT + ecoCount * rowH;
  const canaryHeader = 48;
  const plotBottom =
    ecoBottom +
    (canaryCount ? canaryHeader + canaryCount * rowH + 28 : 12);
  const height = plotBottom + 40;

  const parts: string[] = [];
  parts.push(
    `<svg class="u-b694be74" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(wallAriaLabel(model))}">`,
  );
  parts.push(`<defs>
    <pattern id="gapHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="var(--surface, #F7F9F8)"/>
      <line x1="0" y1="0" x2="0" y2="6" stroke="#C9D1CD" stroke-width="2"/>
    </pattern>
    <pattern id="noChecksDots" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="transparent"/>
      <circle cx="2" cy="2" r="1.1" fill="#9AA6A2" fill-opacity="0.55"/>
    </pattern>
    <style>
      .wl { stroke: var(--ink, #262B30); stroke-width: 1.4; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .wj { stroke: var(--accent, #2347C8); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .wlab { font-family: B612, sans-serif; font-size: 11.5px; fill: var(--ink, #262B30); }
      .wlab-muted { fill: var(--text-secondary, #5E6A69); }
      .wmono { font-family: 'B612 Mono', ui-monospace, monospace; font-size: 11px; fill: var(--ink, #262B30); }
      .waxis { font-family: B612, sans-serif; font-size: 11.5px; fill: var(--text-secondary, #5E6A69); }
      .wall-draw { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: wallDraw 1.4s ease forwards; }
      @media (prefers-reduced-motion: reduce) {
        .wall-draw { animation: none; stroke-dashoffset: 0; }
      }
      @keyframes wallDraw { to { stroke-dashoffset: 0; } }
      .jog-hit:focus { outline: 2px solid var(--ink, #262B30); outline-offset: 2px; }
      .wj { filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent, #2347C8) 45%, transparent)); }
      .now-pulse { animation: nowPulse 2.8s ease-in-out infinite; }
      @keyframes nowPulse { 50% { opacity: 0.55; } }
      @media (prefers-reduced-motion: reduce) {
        .now-pulse { animation: none; }
      }
    </style>
  </defs>`);

  // Axis labels and day lines
  parts.push(
    `<g class="waxis"><text x="${padL}" y="26">${esc(dayLabel(model.genesisAt))} genesis</text>`,
  );
  const dayMs = 24 * 3600 * 1000;
  const dayMarks: number[] = [];
  for (let t = Math.ceil(startMs / dayMs) * dayMs; t <= endMs; t += dayMs) {
    dayMarks.push(t);
    const x = xFor(new Date(t).toISOString(), startMs, endMs, padL, plotW);
    parts.push(
      `<text x="${x.toFixed(1)}" y="26" text-anchor="middle">${esc(dayLabel(new Date(t).toISOString()))}</text>`,
    );
    parts.push(
      `<line x1="${x.toFixed(1)}" y1="38" x2="${x.toFixed(1)}" y2="${ecoBottom + (canaryCount ? canaryHeader + canaryCount * rowH : 0)}" stroke="var(--rule, #E1E6E3)"/>`,
    );
  }
  parts.push(
    `<text x="${nowX}" y="26" text-anchor="end" fill="var(--ink, #262B30)" font-weight="700" class="now-pulse">Now</text></g>`,
  );
  parts.push(
    `<line x1="${padL}" y1="38" x2="${nowX}" y2="38" stroke="var(--grid, #D3DAD6)"/>`,
  );

  // Seal diamonds on axis, linked to digest entry
  for (const s of model.seals) {
    const at =
      s.head?.head.recorded_at ??
      `${s.digest.observation_digest.date}T00:00:00.000Z`;
    const x = xFor(at, startMs, endMs, padL, plotW);
    parts.push(
      `<a href="/e/${s.digest.seq}" aria-label="Sealed day ${esc(s.digest.observation_digest.date)}, digest seq ${s.digest.seq}">
        <rect x="${(x - 4).toFixed(1)}" y="34" width="8" height="8" transform="rotate(45 ${x.toFixed(1)} 38)" fill="var(--ink, #262B30)">
          <title>Sealed ${esc(s.digest.observation_digest.date)}</title>
        </rect>
      </a>`,
    );
  }

  // Gap bands (per-repo height when scoped; full when all)
  const lineTop = padT - 6;
  const lineBottom = ecoBottom + (canaryCount ? canaryHeader + canaryCount * rowH : 0);

  for (const g of model.gaps) {
    const x1 = xFor(g.start, startMs, endMs, padL, plotW);
    const x2 = xFor(g.end, startMs, endMs, padL, plotW);
    const w = Math.max(2, x2 - x1);
    const fill =
      g.source === 'inferred' ? 'url(#noChecksDots)' : 'url(#gapHatch)';
    const stroke =
      g.source === 'inferred'
        ? ` stroke="#9AA6A2" stroke-width="1" stroke-dasharray="3 3" fill-opacity="0.35"`
        : '';
    const affectsAll =
      g.repos.length === 0 ||
      model.repos.every((r) => g.repos.includes(r.repo));
    if (affectsAll) {
      parts.push(
        `<rect x="${x1.toFixed(1)}" y="${lineTop}" width="${w.toFixed(1)}" height="${lineBottom - lineTop}" fill="${fill}"${stroke}/>`,
      );
      parts.push(
        `<text x="${(x1 + w / 2).toFixed(1)}" y="${lineTop + 14}" text-anchor="middle" class="waxis" font-size="10">${esc(g.label)}</text>`,
      );
    } else if (g.source === 'recorded') {
      // Hatch only affected rows for recorded gaps
      for (const row of rows) {
        if (!g.repos.includes(row.repo)) continue;
        const y = row.isCanaryTag
          ? ecoBottom +
            canaryHeader +
            rows.filter((r) => r.isCanaryTag).indexOf(row) * rowH
          : padT + rows.filter((r) => !r.isCanaryTag).indexOf(row) * rowH;
        parts.push(
          `<rect x="${x1.toFixed(1)}" y="${(y - 8).toFixed(1)}" width="${w.toFixed(1)}" height="16" fill="${fill}"/>`,
        );
      }
    }
  }

  // Helper: gap intervals that break a given repo's line
  function gapsForRepo(repo: string): { start: number; end: number }[] {
    return model.gaps
      .filter(
        (g) =>
          g.repos.length === 0 ||
          g.repos.includes(repo) ||
          model.repos.every((r) => g.repos.includes(r.repo)),
      )
      .map((g) => ({
        start: xFor(g.start, startMs, endMs, padL, plotW),
        end: xFor(g.end, startMs, endMs, padL, plotW),
      }))
      .sort((a, b) => a.start - b.start);
  }

  function drawBrokenLine(
    y: number,
    repo: string,
    className: string,
    fromX: number,
    toX: number,
  ): void {
    const gaps = gapsForRepo(repo);
    let cursor = fromX;
    for (const g of gaps) {
      if (g.end <= fromX || g.start >= toX) continue;
      const segEnd = Math.min(g.start, toX);
      if (segEnd > cursor) {
        parts.push(
          `<line class="${className} wall-draw" x1="${cursor.toFixed(1)}" y1="${y}" x2="${segEnd.toFixed(1)}" y2="${y}"/>`,
        );
      }
      cursor = Math.max(cursor, g.end);
    }
    if (toX > cursor) {
      parts.push(
        `<line class="${className} wall-draw" x1="${cursor.toFixed(1)}" y1="${y}" x2="${toX.toFixed(1)}" y2="${y}"/>`,
      );
    }
  }

  // Ecosystem rows
  for (let i = 0; i < model.repos.length; i++) {
    const repo = model.repos[i];
    const y = padT + i * rowH;
    parts.push(
      `<text class="wlab" x="${padL - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end">${esc(repo.repo)}</text>`,
    );
    const rowEvents = model.events
      .filter((e) => e.repo === repo.repo && !e.isCanary)
      .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1));

    drawEventfulLine(y, repo.repo, rowEvents, 'wl');
  }

  if (model.hiddenUnchanged > 0) {
    parts.push(
      `<a href="/moved" class="wlab wlab-muted u-e698a016">
        <text x="${padL}" y="${(ecoBottom + 18).toFixed(1)}">${model.hiddenUnchanged} more repositories, every one unchanged since genesis</text>
      </a>`,
    );
  }

  // Canary section
  if (model.canary) {
    const sepY = ecoBottom + 28;
    parts.push(
      `<line x1="${padL}" y1="${sepY}" x2="${nowX}" y2="${sepY}" stroke="var(--grid, #D3DAD6)" stroke-dasharray="2 4"/>`,
    );
    parts.push(
      `<text class="wlab" font-weight="700" x="${padL - 12}" y="${(sepY + 24).toFixed(1)}" text-anchor="end">Canary, our test repo</text>`,
    );
    parts.push(
      `<text class="wlab wlab-muted" x="${padL}" y="${(sepY + 24).toFixed(1)}">Tags here are moved on purpose, to prove the instrument works.</text>`,
    );

    const canaryTags = model.canary.tags;
    for (let i = 0; i < canaryTags.length; i++) {
      const t = canaryTags[i];
      const tag = t.ref.startsWith('refs/tags/')
        ? t.ref.slice(10)
        : t.ref;
      const y = sepY + 40 + i * rowH;
      parts.push(
        `<text class="wmono" x="${padL - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end">${esc(tag)}</text>`,
      );
      const rowEvents = model.events
        .filter((e) => e.repo === model.canary!.repo && e.tag === tag)
        .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1));
      drawEventfulLine(y, model.canary.repo, rowEvents, 'wl');
    }
  }

  // Correlation highlight + caption
  for (const c of model.correlations) {
    const x = xFor(c.at, startMs, endMs, padL, plotW);
    const canaryYs = model.canary
      ? model.canary.tags
          .map((t, i) => {
            const tag = t.ref.startsWith('refs/tags/') ? t.ref.slice(10) : t.ref;
            if (!c.tags.includes(tag)) return null;
            const sepY = ecoBottom + 28;
            return sepY + 40 + i * rowH;
          })
          .filter((v): v is number => v != null)
      : [];
    if (canaryYs.length) {
      const top = Math.min(...canaryYs) - 6;
      const bot = Math.max(...canaryYs) + 6;
      parts.push(
        `<rect x="${(x + 4).toFixed(1)}" y="${top}" width="10" height="${bot - top}" rx="5" fill="var(--accent, #2347C8)" fill-opacity="0.14"/>`,
      );
    }
    parts.push(
      `<path d="M${(x - 10).toFixed(1)} ${plotBottom + 8} H${(x + 5).toFixed(1)}" stroke="var(--accent, #2347C8)" stroke-width="1" fill="none"/>`,
    );
    parts.push(
      `<path d="M${(x + 5).toFixed(1)} ${plotBottom + 8} V${plotBottom}" stroke="var(--accent, #2347C8)" stroke-width="1" fill="none"/>`,
    );
    parts.push(
      `<a href="/e/${c.seq}"><text x="${(x - 16).toFixed(1)}" y="${plotBottom + 12}" text-anchor="end" class="wlab">${esc(c.caption)}</text></a>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');

  function drawEventfulLine(
    y: number,
    repo: string,
    rowEvents: TraceEvent[],
    baseClass: string,
  ): void {
    let cursor = padL;
    let ended = false;

    for (const ev of rowEvents) {
      const x = xFor(ev.recorded_at, startMs, endMs, padL, plotW);
      const tip = tooltipFor(ev);

      if (ended && ev.event !== 'recreation') continue;

      if (ev.event === 'deletion') {
        drawBrokenLine(y, repo, baseClass, cursor, x);
        parts.push(
          `<a class="jog-hit" href="/e/${ev.seq}" aria-label="${esc(tip)}" tabindex="0">
            <circle cx="${x.toFixed(1)}" cy="${y}" r="3.2" fill="var(--surface, #F7F9F8)" stroke="var(--ink, #262B30)" stroke-width="1.4">
              <title>${esc(tip)}</title>
            </circle>
          </a>`,
        );
        ended = true;
        cursor = x;
        continue;
      }

      if (ev.event === 'recreation') {
        ended = false;
        parts.push(
          `<a class="jog-hit" href="/e/${ev.seq}" aria-label="${esc(tip)}" tabindex="0">
            <circle cx="${x.toFixed(1)}" cy="${y}" r="3.2" fill="var(--accent, #2347C8)">
              <title>${esc(tip)}</title>
            </circle>
          </a>`,
        );
        cursor = x;
        continue;
      }

      // move: line to jog, then accent jog path
      drawBrokenLine(y, repo, baseClass, cursor, x);
      const jog = 8;
      parts.push(
        `<path class="wj wall-draw" d="M ${x.toFixed(1)} ${y} V ${(y + jog).toFixed(1)} H ${(x + 10).toFixed(1)}"/>`,
      );
      parts.push(
        `<a class="jog-hit" href="/e/${ev.seq}" aria-label="${esc(tip)}" tabindex="0">
          <circle cx="${x.toFixed(1)}" cy="${y}" r="3.2" fill="var(--surface, #F7F9F8)" stroke="var(--ink, #262B30)" stroke-width="1.2">
            <title>${esc(tip)}</title>
          </circle>
          <rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="18" height="${jog + 10}" fill="transparent"/>
        </a>`,
      );
      cursor = x + 10;
    }

    if (!ended) {
      drawBrokenLine(y, repo, baseClass, cursor, nowX);
    }
  }
}

function tooltipFor(ev: TraceEvent): string {
  // Lazy import avoided: keep tooltip assembly inline using fields already on TraceEvent
  const when = ev.recorded_at.replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  const phrase = ev.whatChanged ?? ev.event;
  const fromTo = ev.fromToText ??
    (() => {
      const from = ev.fromCommit ? ev.fromCommit.slice(0, 7) : '?';
      const to =
        ev.event === 'deletion' ? 'gone' : ev.toCommit ? ev.toCommit.slice(0, 7) : '?';
      return `${from} → ${to}`;
    })();
  const sev = ev.severity ? `; ${ev.severity}` : '';
  return `${ev.tag}: ${phrase}; ${fromTo}; ${when}${sev}`;
}

function wallAriaLabel(model: WallModel): string {
  const moves = model.events.filter((e) => e.event === 'move').length;
  return `Trace wall for range ${model.range}: ${model.repos.length} repositories, ${moves} tag moves recorded, ${model.gaps.length} gap bands.`;
}

export function wallTableRows(model: WallModel): {
  repo: string;
  tag: string;
  event: string;
  at: string;
  seq: number;
}[] {
  return model.events.map((e) => ({
    repo: e.repo,
    tag: e.tag,
    event: e.event,
    at: e.recorded_at,
    seq: e.seq,
  }));
}
