import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyzeWorkflow,
  collectUses,
  parseUsesString,
  type ActionApiLite,
} from '../src/lib/pin-workflow';
import { buildAction } from '../src/lib/api-v1';

describe('pin-workflow', () => {
  it('parses uses forms', () => {
    expect(parseUsesString('./foo').kind).toBe('local');
    expect(parseUsesString('docker://alpine').kind).toBe('docker');
    expect(parseUsesString('actions/checkout@v4').owner).toBe('actions');
  });

  it('collects uses from basic fixture, skipping local and docker', () => {
    const yaml = readFileSync(
      join('tests/fixtures/workflows/basic.yml'),
      'utf8',
    );
    const uses = collectUses(yaml);
    expect(uses.some((u) => u.raw.includes('checkout'))).toBe(true);
    expect(uses.some((u) => u.kind === 'local')).toBe(false);
    expect(uses.some((u) => u.kind === 'docker')).toBe(false);
    expect(uses.some((u) => u.raw.includes('not-watched'))).toBe(true);
  });

  it('analyzes with live API data including reviewdog', () => {
    const yaml = readFileSync(
      join('tests/fixtures/workflows/basic.yml'),
      'utf8',
    );
    const map = new Map<string, ActionApiLite>();
    for (const name of [
      'actions/checkout',
      'actions/setup-node',
      'reviewdog/action-actionlint',
    ]) {
      const [o, r] = name.split('/');
      const a = buildAction(o, r);
      if (a) {
        map.set(name, {
          repo: a.repo,
          tags: a.tags.map((t) => ({
            tag: t.tag,
            pin_commit: t.pin_commit,
            current: t.current
              ? {
                  commit_sha: t.current.commit_sha,
                  first_observed: t.current.first_observed,
                  last_observed: t.current.last_observed,
                }
              : null,
            history: t.history.map((h) => ({
              seq: h.seq,
              recorded_at: h.recorded_at,
              event: h.event,
            })),
          })),
        });
      }
    }
    const result = analyzeWorkflow(yaml, map);
    expect(result.summary.watched).toBeGreaterThanOrEqual(3);
    expect(result.summary.unwatched).toBeGreaterThanOrEqual(1);
    expect(result.rewrittenYaml).toMatch(/actions\/checkout@[0-9a-f]{40} # v4/);
    const rd = result.rows.find((r) =>
      r.uses.includes('reviewdog/action-actionlint'),
    );
    expect(rd?.watched).toBe(true);
  });

  it('flags version comment mismatch on already-pinned line', () => {
    const yaml = readFileSync(
      join('tests/fixtures/workflows/matrix-multidoc.yml'),
      'utf8',
    );
    const checkout = buildAction('actions', 'checkout')!;
    const map = new Map<string, ActionApiLite>([
      [
        'actions/checkout',
        {
          repo: 'actions/checkout',
          tags: checkout.tags.map((t) => ({
            tag: t.tag,
            pin_commit: t.pin_commit,
            current: t.current
              ? { commit_sha: t.current.commit_sha, first_observed: t.current.first_observed }
              : null,
            history: t.history.map((h) => ({
              seq: h.seq,
              recorded_at: h.recorded_at,
              event: h.event,
            })),
          })),
        },
      ],
      [
        'actions/setup-node',
        {
          repo: 'actions/setup-node',
          tags: buildAction('actions', 'setup-node')!.tags.map((t) => ({
            tag: t.tag,
            pin_commit: t.pin_commit,
            current: t.current
              ? { commit_sha: t.current.commit_sha }
              : null,
            history: [],
          })),
        },
      ],
      [
        'actions/cache',
        {
          repo: 'actions/cache',
          tags: buildAction('actions', 'cache')!.tags.map((t) => ({
            tag: t.tag,
            pin_commit: t.pin_commit,
            current: t.current ? { commit_sha: t.current.commit_sha } : null,
            history: [],
          })),
        },
      ],
    ]);
    const result = analyzeWorkflow(yaml, map);
    expect(result.rows.some((r) => r.already_pinned)).toBe(true);
    expect(collectUses(yaml).length).toBeGreaterThanOrEqual(3);
  });
});
