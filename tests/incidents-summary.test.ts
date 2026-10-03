import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIncidentSummaries, renderPlainMarkdown } from '../src/lib/incidents';

const sample = `
## example

### When

1 Oct 2026

### Title

A short title

### What happened

Something happened in the poller.

### Effect

The record kept the original row.

### What changed

A later note names it.

### Technical details

Observation \`01EXAMPLE\` recorded \`http_status\` 422.

The value \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\` was not a git object.
`;

describe('incident summaries', () => {
  it('parses the human fields and renders code spans', () => {
    const rows = parseIncidentSummaries(sample);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('A short title');
    expect(rows[0].happened.endsWith('.')).toBe(true);
    expect(rows[0].effect.endsWith('.')).toBe(true);
    const html = renderPlainMarkdown(rows[0].technical);
    expect(html).toContain('<code class="mono">01EXAMPLE</code>');
    expect(html).toContain('<code class="mono">http_status</code>');
    expect(html.startsWith('<p>')).toBe(true);
    expect(html).not.toContain('<script');
  });

  it('reads the refledger summaries and keeps every claim in sentences', () => {
    const file = path.resolve('.cache/refledger-main/docs/incident-summaries.md');
    expect(existsSync(file), 'fetch-data should clone incident-summaries.md').toBe(true);
    const rows = parseIncidentSummaries(readFileSync(file, 'utf8'));
    expect(rows.length).toBe(8);
    for (const row of rows) {
      expect(row.title.length).toBeGreaterThan(8);
      expect(row.happened.endsWith('.')).toBe(true);
      expect(row.effect.endsWith('.')).toBe(true);
      expect(row.changed.endsWith('.')).toBe(true);
      expect(row.technical.length).toBeGreaterThan(20);
      const blob = `${row.title} ${row.happened} ${row.effect} ${row.changed}`;
      expect(blob).not.toMatch(/[\u2013\u2014]|--/);
    }
    expect(rows.map((r) => r.id)).toEqual([
      'false-422',
      'tree-sha-listing',
      'invented-placeholder-shas',
      'gap-no-derive-2026-09-29',
      'enrich-outage',
      'heads-line-rewrite-2026-10-01',
      'batch-listing-only-prior',
      'tree-invariant-2026-10-02',
    ]);
  });
});
