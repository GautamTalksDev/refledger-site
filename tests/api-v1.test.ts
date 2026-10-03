import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAction,
  buildAt,
  buildIndex,
  buildMoved,
  buildTag,
  listAtDates,
} from '../src/lib/api-v1';
import { getSiteData } from '../src/data';

function assertSchema(name: string, data: unknown) {
  const schema = JSON.parse(
    readFileSync(
      join(process.cwd(), 'public/api/v1/schemas', `${name}.schema.json`),
      'utf8',
    ),
  );
  expect(data).toBeTypeOf('object');
  for (const key of schema.required ?? []) {
    expect(data as object).toHaveProperty(key);
  }
  expect((data as { api_version: string }).api_version).toBe('v1');
  // No verdict fields anywhere in the tree
  const blob = JSON.stringify(data);
  expect(blob).not.toMatch(/"verdict"/i);
  expect(blob).not.toMatch(/"malicious"/i);
  expect(blob).not.toMatch(/"safe"/i);
}

describe('api/v1 builders', () => {
  it('index matches schema', () => {
    const idx = buildIndex();
    assertSchema('index', idx);
    expect(idx.population.action_count).toBe(38);
    expect(idx.population.repository_count).toBe(35);
    expect(idx.ledger_data_license).toBe('Ledger data: CC0, public domain');
  });

  it('moved matches schema and uses fact wording', () => {
    const moved = buildMoved();
    assertSchema('moved', moved);
    const seq52 = moved.events.find((e) => e.seq === 52);
    if (seq52) {
      expect(seq52.what_changed).toBe('Tag type changed, same commit');
    }
  });

  it('action and tag payloads', () => {
    const action = buildAction('reviewdog', 'action-actionlint');
    expect(action).toBeTruthy();
    assertSchema('action', action!);
    const tag = buildTag('reviewdog', 'action-actionlint', 'v1');
    expect(tag).toBeTruthy();
    assertSchema('tag', tag!);
  });

  it('at snapshots for every seal day', () => {
    const dates = listAtDates();
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) {
      const snap = buildAt(d);
      assertSchema('at', snap);
      expect(snap.bindings.length).toBeGreaterThan(0);
    }
  });

  it('canary action is labelled', () => {
    const c = buildAction('GautamTalksDev', 'canary');
    expect(c?.canary).toBe(true);
  });
});
