import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical';
import { entryHash } from './hash';

const VECTORS_DIR = join(process.cwd(), 'tests', 'vectors');

/** Parse JSON preserving integers beyond MAX_SAFE_INTEGER as bigint (Node 22+). */
function parseJsonPreserveInts(text: string): unknown {
  return JSON.parse(text, (_key, value, context) => {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      const src =
        context && typeof context === 'object' && 'source' in context
          ? String((context as { source: string }).source)
          : null;
      if (src && /^-?\d+$/.test(src)) return BigInt(src);
    }
    return value;
  });
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => join(dir, n))
    .sort();
}

describe('canonicalJson conformance', () => {
  const files = listJsonFiles(VECTORS_DIR);
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    const name = file.split('/').pop()!;
    it(name, async () => {
      const vector = parseJsonPreserveInts(readFileSync(file, 'utf8')) as {
        input: object;
        expected_canonical: string;
        expected_hash: string;
      };
      const canonical = canonicalJson(vector.input);
      expect(canonical).toBe(vector.expected_canonical);
      const hash = await entryHash(vector.input);
      expect(hash).toBe(vector.expected_hash);
    });
  }
});
