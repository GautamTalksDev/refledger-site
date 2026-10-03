import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical';
import { parseJsonPreserveInts } from './json-parse';
import { verifyEd25519 } from './verify';

const HEADS_DIR = join(process.cwd(), 'tests', 'vectors', 'heads');

describe('head signature conformance', () => {
  const files = readdirSync(HEADS_DIR)
    .filter((n) => n.endsWith('.json'))
    .map((n) => join(HEADS_DIR, n))
    .sort();

  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    const name = file.split('/').pop()!;
    it(name, async () => {
      const vector = parseJsonPreserveInts(readFileSync(file, 'utf8')) as {
        head: {
          entry_hash: string;
          log_id: string;
          recorded_at: string;
          seq: number | bigint;
        };
        expected_canonical: string;
        expected_signature_hex: string;
        expected_public_key_hex: string;
      };

      // Fallback if the runtime did not expose JSON reviver source context.
      if (
        typeof vector.head.seq === 'number' &&
        !Number.isSafeInteger(vector.head.seq)
      ) {
        const m = /"seq":(\d+)/.exec(vector.expected_canonical);
        if (m) vector.head.seq = BigInt(m[1]);
      }

      const canonical = canonicalJson(vector.head);
      expect(canonical).toBe(vector.expected_canonical);

      // Head vectors use a dedicated test key, not the production pin.
      const ok = await verifyEd25519(
        vector.expected_public_key_hex,
        canonical,
        vector.expected_signature_hex,
      );
      expect(ok).toBe(true);
    });
  }
});
