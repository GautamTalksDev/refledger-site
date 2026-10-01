import type {
  RepoView,
  Seal,
  TraceEvent,
} from '../data/types';

export type WallRange = 'genesis' | '7d' | '30d';

export type WallModel = {
  range: WallRange;
  buildTime: string;
  genesisAt: string;
  repos: RepoView[];
  canary: RepoView | null;
  events: TraceEvent[];
  seals: Seal[];
  gaps: { start: string; end: string; label: string }[];
  hiddenUnchanged: number;
  correlations: { at: string; repos: string[]; caption: string; seqs: number[] }[];
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

export function buildWallModel(opts: {
  range: WallRange;
  buildTime: string;
  genesisAt: string;
  wallRepos: string[];
  allRepos: RepoView[];
  canary: RepoView | null;
  events: TraceEvent[];
  seals: Seal[];
  gaps?: WallModel['gaps'];
  correlations?: WallModel['correlations'];
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
    gaps: opts.gaps ?? [],
    hiddenUnchanged,
    correlations: (opts.correlations ?? []).filter((c) => c.at >= start),
  };
}

export function renderWallSvg(model: WallModel): string {
  const labelW = 168;
  const padL = labelW + 16;
  const padR = 24;
  const padT = 36;
  const rowH = 28;
  const axisH = 28;
  const plotW = 720;
  const startMs = new Date(
    rangeStart(model.range, model.genesisAt, model.buildTime),
  ).getTime();
  const endMs = new Date(model.buildTime).getTime();

  const rows: { key: string; label: string; repo: string; isCanaryTag?: boolean }[] =
    model.repos.map((r) => ({
      key: r.repo,
      label: r.repo,
      repo: r.repo,
    }));

  let canaryOffset = 0;
  if (model.canary) {
    canaryOffset = 20;
    for (const t of model.canary.tags) {
      const tag = t.ref.startsWith('refs/tags/')
        ? t.ref.slice('refs/tags/'.length)
        : t.ref;
      rows.push({
        key: `${model.canary.repo}#${tag}`,
        label: tag,
        repo: model.canary.repo,
        isCanaryTag: true,
      });
    }
  }

  const plotH = rows.length * rowH + (model.canary ? canaryOffset : 0);
  const height = padT + plotH + axisH + 8;
  const width = padL + plotW + padR;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(wallAriaLabel(model))}">`,
  );
  parts.push(
    `<rect width="100%" height="100%" fill="var(--surface, #F7F9F8)"/>`,
  );

  // Gap bands
  for (const g of model.gaps) {
    const x1 = xFor(g.start, startMs, endMs, padL, plotW);
    const x2 = xFor(g.end, startMs, endMs, padL, plotW);
    parts.push(
      `<rect class="wall-gap" x="${x1.toFixed(1)}" y="${padT}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="${plotH}" fill="url(#gapHatch)" opacity="0.45"/>`,
    );
  }

  parts.push(`<defs>
    <pattern id="gapHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--trace, #97A2A0)" stroke-width="1"/>
    </pattern>
    <style>
      .wall-line { fill: none; stroke: var(--ink, #262B30); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
      .wall-jog { stroke: var(--accent, #2347C8); }
      .wall-label { font-family: B612, sans-serif; font-size: 11px; fill: var(--text-secondary, #5E6A69); }
      .wall-axis { font-family: B612, sans-serif; font-size: 11px; fill: var(--text-secondary, #5E6A69); }
      .wall-draw { stroke-dasharray: 1400; stroke-dashoffset: 1400; animation: wallDraw 1.4s ease forwards; }
      @media (prefers-reduced-motion: reduce) {
        .wall-draw { animation: none; stroke-dashoffset: 0; }
      }
      @keyframes wallDraw { to { stroke-dashoffset: 0; } }
    </style>
  </defs>`);

  // Day grid + seals on axis
  const dayMs = 24 * 3600 * 1000;
  for (let t = Math.ceil(startMs / dayMs) * dayMs; t <= endMs; t += dayMs) {
    const x = xFor(new Date(t).toISOString(), startMs, endMs, padL, plotW);
    parts.push(
      `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + plotH}" stroke="var(--rule, #E1E6E3)" stroke-width="1"/>`,
    );
  }

  let yBase = padT + rowH / 2;
  if (model.canary) {
    // Canary section label inserted before canary rows
  }

  let rowIndex = 0;
  let canaryLabelDrawn = false;
  for (const row of rows) {
    if (row.isCanaryTag && !canaryLabelDrawn) {
      parts.push(
        `<text class="wall-label" x="8" y="${(yBase - 10).toFixed(1)}" font-weight="700">Canary</text>`,
      );
      canaryLabelDrawn = true;
      yBase += 8;
    }
    const y = yBase;
    parts.push(
      `<text class="wall-label" x="8" y="${(y + 4).toFixed(1)}">${esc(row.label)}</text>`,
    );

    const rowEvents = model.events
      .filter((e) => {
        if (row.isCanaryTag) {
          return e.repo === row.repo && e.tag === row.label;
        }
        return e.repo === row.repo && !e.isCanary;
      })
      .sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1));

    // Build path: straight, with vertical jogs at moves; hollow circle at deletion; resume at recreation
    let xCursor = padL;
    const path: string[] = [`M ${xCursor.toFixed(1)} ${y.toFixed(1)}`];
    let ended = false;

    for (const ev of rowEvents) {
      const x = xFor(ev.recorded_at, startMs, endMs, padL, plotW);
      if (ended && ev.event !== 'recreation') continue;
      if (ev.event === 'deletion') {
        path.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
        parts.push(
          `<a href="/e/${ev.seq}" aria-label="seq ${ev.seq}: ${esc(ev.repo)} ${esc(ev.tag)} deleted"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="none" stroke="var(--ink, #262B30)" stroke-width="1.5"/></a>`,
        );
        ended = true;
        xCursor = x;
        continue;
      }
      if (ev.event === 'recreation') {
        ended = false;
        path.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
        parts.push(
          `<a href="/e/${ev.seq}" aria-label="seq ${ev.seq}: ${esc(ev.repo)} ${esc(ev.tag)} recreated"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--accent, #2347C8)"/></a>`,
        );
        xCursor = x;
        continue;
      }
      // move: horizontal to jog, vertical jog, continue
      const jog = 7;
      path.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
      path.push(`L ${x.toFixed(1)} ${(y - jog).toFixed(1)}`);
      path.push(`L ${(x + 0.01).toFixed(1)} ${(y - jog).toFixed(1)}`);
      path.push(`L ${(x + 0.01).toFixed(1)} ${y.toFixed(1)}`);
      parts.push(
        `<a href="/e/${ev.seq}" aria-label="seq ${ev.seq}: ${esc(ev.repo)} ${esc(ev.tag)} moved"><rect x="${(x - 3).toFixed(1)}" y="${(y - jog - 3).toFixed(1)}" width="8" height="${jog + 6}" fill="transparent"></rect></a>`,
      );
      xCursor = x;
    }

    if (!ended) {
      path.push(
        `L ${xFor(model.buildTime, startMs, endMs, padL, plotW).toFixed(1)} ${y.toFixed(1)}`,
      );
    }

    const hasJog = rowEvents.some((e) => e.event === 'move');
    parts.push(
      `<path class="wall-line wall-draw${hasJog ? ' wall-jog' : ''}" d="${path.join(' ')}" />`,
    );

    yBase += rowH;
    rowIndex++;
  }

  // Correlation captions
  for (const c of model.correlations) {
    const x = xFor(c.at, startMs, endMs, padL, plotW);
    parts.push(
      `<rect x="${(x - 6).toFixed(1)}" y="${padT}" width="12" height="${plotH}" fill="var(--accent, #2347C8)" opacity="0.08"/>`,
    );
    parts.push(
      `<text class="wall-axis" x="${x.toFixed(1)}" y="${(padT - 8).toFixed(1)}" text-anchor="middle">${esc(c.caption)}</text>`,
    );
  }

  // Axis
  const axisY = padT + plotH + 18;
  parts.push(
    `<line x1="${padL}" y1="${axisY}" x2="${padL + plotW}" y2="${axisY}" stroke="var(--trace, #97A2A0)" stroke-width="1"/>`,
  );
  parts.push(
    `<text class="wall-axis" x="${padL}" y="${axisY + 14}">genesis</text>`,
  );
  parts.push(
    `<text class="wall-axis" x="${padL + plotW}" y="${axisY + 14}" text-anchor="end">Now</text>`,
  );

  for (const s of model.seals) {
    const at =
      s.head?.head.recorded_at ?? `${s.digest.observation_digest.date}T00:00:00.000Z`;
    const x = xFor(at, startMs, endMs, padL, plotW);
    parts.push(
      `<polygon points="${x.toFixed(1)},${(axisY - 5).toFixed(1)} ${(x + 4).toFixed(1)},${axisY.toFixed(1)} ${x.toFixed(1)},${(axisY + 5).toFixed(1)} ${(x - 4).toFixed(1)},${axisY.toFixed(1)}" fill="var(--ink, #262B30)"><title>Sealed ${esc(s.digest.observation_digest.date)}</title></polygon>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}

function wallAriaLabel(model: WallModel): string {
  const moves = model.events.filter((e) => e.event === 'move').length;
  return `Trace wall for range ${model.range}: ${model.repos.length} repositories, ${moves} tag moves recorded.`;
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
