import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/lib/canonical';
import { entryHash, keyId, sha512Hex } from '../src/lib/hash';
import { verifyHeadSignature } from '../src/lib/verify';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vectorsDir = path.join(root, 'tests/vectors');
const headsDir = path.join(vectorsDir, 'heads');

/** Parse JSON preserving integers beyond MAX_SAFE_INTEGER as bigint. */
function parseJsonPreserveInts(text: string): unknown {
  return JSON.parse(text, (_key, value, context) => {
    // Node 22+ JSON.parse reviver source via context
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

function loadJson(file: string): any {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return parseJsonPreserveInts(text);
  } catch {
    return JSON.parse(text);
  }
}

describe('entry conformance vectors', () => {
  const files = fs
    .readdirSync(vectorsDir)
    .filter((f) => f.startsWith('entry_') && f.endsWith('.json'))
    .sort();

  it('finds vectors', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(file, async () => {
      const v = loadJson(path.join(vectorsDir, file));
      const canonical = canonicalJson(v.input);
      expect(canonical).toBe(v.expected_canonical);
      const hash = await entryHash(v.input);
      expect(hash).toBe(v.expected_hash);
    });
  }
});

describe('head conformance vectors', () => {
  const files = fs
    .readdirSync(headsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  it('finds head vectors', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(file, async () => {
      const v = loadJson(path.join(headsDir, file));
      // For u64-max, force bigint seq from expected_canonical if needed.
      if (
        typeof v.head.seq === 'number' &&
        !Number.isSafeInteger(v.head.seq) &&
        typeof v.expected_canonical === 'string'
      ) {
        const m = /"seq":(\d+)/.exec(v.expected_canonical);
        if (m) v.head.seq = BigInt(m[1]);
      }
      const canonical = canonicalJson(v.head);
      expect(canonical).toBe(v.expected_canonical);
      const ok = await verifyHeadSignature(
        v.head,
        v.expected_signature_hex,
        v.expected_public_key_hex,
      );
      expect(ok).toBe(true);
      if (v.expected_rekor_prehash_sha512_hex) {
        const pre = await sha512Hex(canonical);
        expect(pre).toBe(v.expected_rekor_prehash_sha512_hex);
      }
      if (v.expected_key_id) {
        expect(await keyId(v.expected_public_key_hex)).toBe(v.expected_key_id);
      }
    });
  }
});
