import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/lib/canonical';
import { entryHash, keyId, sha512Hex } from '../src/lib/hash';
import { parseJsonPreserveInts } from '../src/lib/json-parse';
import { verifyHeadSignature } from '../src/lib/verify';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vectorsDir = path.join(root, 'tests/vectors');
const headsDir = path.join(vectorsDir, 'heads');

type EntryVector = {
  input: object;
  expected_canonical: string;
  expected_hash: string;
};

type HeadVector = {
  head: {
    entry_hash: string;
    log_id: string;
    recorded_at: string;
    seq: number | bigint;
  };
  expected_canonical: string;
  expected_signature_hex: string;
  expected_public_key_hex: string;
  expected_rekor_prehash_sha512_hex?: string;
  expected_key_id?: string;
};

function loadJson<T>(file: string): T {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return parseJsonPreserveInts(text) as T;
  } catch {
    return JSON.parse(text) as T;
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
      const v = loadJson<EntryVector>(path.join(vectorsDir, file));
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
      const v = loadJson<HeadVector>(path.join(headsDir, file));
      // For u64-max, force bigint seq from expected_canonical if needed.
      if (
        typeof v.head.seq === 'number' &&
        !Number.isSafeInteger(v.head.seq)
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
