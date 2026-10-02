# Visual audit (post token rebuild)

Captured at 390 / 768 / 1440, light and dark, under `design/screens/before/`
(baseline of the rebuilt system) and mirrored to `after/` after CI polish.

## Issues addressed by the token system

1. **Off-scale spacing** — replaced ad-hoc 18/28/40/72px gaps with the
   4…128 scale (`--s-1` … `--s-10`).
2. **Content width** — shell max width moved from 1240px to 1200px with
   consistent gutters.
3. **Type hierarchy** — Schibsted Grotesk for display/body; B612 reserved for
   instrument readouts; display tracking tightened.
4. **Section rhythm** — major sections use 128px desktop / 80px mobile gap.
5. **Hero hierarchy** — graphite night zone + status chip so the first
   viewport reads as one composition, not a dashboard.
6. **Wall contrast** — luminous still lines and accent jogs on graphite;
   inferred silence visually distinct from recorded hatch.

## Remaining watch items

- Command palette index is intentionally trimmed (actions + recent entries)
  to keep JS under budget; deep tag search still works via `/search`.
- Full Lighthouse 95+ is gated in CI on home; mobile LCP depends on font
  swap which is already `font-display: swap`.
