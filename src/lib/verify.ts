/**
 * In-browser (and Node) ledger verifier. Third independent implementation
 * of LOG-FORMAT.md chain and head checks, beside the Rust signer and verify crates.
 */

import { canonicalJson } from './canonical';
import { entryHash, hexToBytes, keyId } from './hash';

/** Genesis predecessor: sha256: + sixty-four ASCII zeros. */
export const GENESIS_PREV =
  'sha256:0000000000000000000000000000000000000000000000000000000000000000';

/** Pinned production Ed25519 public key (hex). */
export const PINNED_PUBKEY =
  'b3e7e795c35dee53731e039b76da930fc54e87e2edc632449a8a2e55252e276a';

/** SPKI DER prefix for a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

export type HeadObject = {
  seq: number | bigint;
  entry_hash: string;
  recorded_at: string;
  log_id: string;
};

export type RekorMeta = {
  kind?: string;
  api_version?: string;
  artifact_hash?: string;
  attempts?: number;
  log_id?: string;
  log_index?: number;
  integrated_time?: number;
  uuid?: string;
  error?: string;
};

export type SignedHeadLine = {
  head: HeadObject;
  signature: string;
  public_key: string;
  key_id: string;
  rekor?: RekorMeta;
};

export type LedgerEntry = {
  seq: number;
  entry_hash: string;
  prev_hash: string;
  format_version: number;
  recorded_at: string;
  event: string;
  observation_digest?: {
    skipped?: number;
    failed?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type HeadStatus = {
  valid: boolean;
  key_prefix: string;
  seq: number;
  entry_hash: string;
};

export type VerifyFailure = {
  check: string;
  seq?: number;
};

export type VerifyVerdict = {
  ok: boolean;
  entries: number;
  seq_first: number | null;
  seq_last: number | null;
  span_start: string | null;
  span_end: string | null;
  head: HeadStatus | null;
  coverage_skipped: number;
  coverage_failed: number;
  failure: VerifyFailure | null;
  /** CLI-matching lines (at most five on success). */
  lines: string[];
};

export type VerifyProgress = {
  phase: 'chain' | 'heads';
  done: number;
  total: number;
};

export type VerifyLedgerArgs = {
  entries: LedgerEntry[];
  heads: SignedHeadLine[];
  /** Override pinned key (conformance / tests). Defaults to PINNED_PUBKEY. */
  pinnedPubkey?: string;
  onProgress?: (progress: VerifyProgress) => void;
};

function dateOnly(ts: string): string {
  return ts.length >= 10 ? ts.slice(0, 10) : ts;
}

function fail(check: string, seq?: number): VerifyVerdict {
  const failure: VerifyFailure = seq === undefined ? { check } : { check, seq };
  const line =
    seq === undefined ? `FAIL: ${check}` : `FAIL seq ${seq}: ${check}`;
  return {
    ok: false,
    entries: 0,
    seq_first: null,
    seq_last: null,
    span_start: null,
    span_end: null,
    head: null,
    coverage_skipped: 0,
    coverage_failed: 0,
    failure,
    lines: [line],
  };
}

function successLines(v: Omit<VerifyVerdict, 'lines' | 'ok' | 'failure'> & {
  head: HeadStatus | null;
}): string[] {
  const lines: string[] = ['chain: OK'];
  if (v.seq_first !== null && v.seq_last !== null) {
    lines.push(`entries: ${v.entries} (seq ${v.seq_first} .. ${v.seq_last})`);
  } else {
    lines.push(`entries: ${v.entries}`);
  }
  if (v.span_start && v.span_end) {
    lines.push(`span: ${dateOnly(v.span_start)} .. ${dateOnly(v.span_end)}`);
  } else {
    lines.push('span: (none)');
  }
  if (v.head?.valid) {
    lines.push(`head: signed, valid, key ${v.head.key_prefix}...`);
  } else if (v.head) {
    lines.push('head: present, invalid');
  } else {
    lines.push('head: (not checked)');
  }
  lines.push(
    `coverage gaps recorded: ${v.coverage_skipped} skipped, ${v.coverage_failed} failed polls (from signed digests)`,
  );
  return lines;
}

/**
 * Verify an Ed25519 signature over `message` with a 32-byte public key (hex).
 * Prefers WebCrypto; falls back to Node crypto for environments without subtle Ed25519.
 */
export async function verifyEd25519(
  publicKeyHex: string,
  message: Uint8Array | string,
  signatureHex: string,
): Promise<boolean> {
  const pk = hexToBytes(publicKeyHex);
  const sig = hexToBytes(signatureHex);
  const msg =
    typeof message === 'string' ? new TextEncoder().encode(message) : message;

  if (pk.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${pk.length}`);
  }
  if (sig.length !== 64) {
    throw new Error(`Ed25519 signature must be 64 bytes, got ${sig.length}`);
  }

  if (globalThis.crypto?.subtle) {
    try {
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        pk,
        { name: 'Ed25519' },
        false,
        ['verify'],
      );
      return await globalThis.crypto.subtle.verify('Ed25519', key, sig, msg);
    } catch {
      // Fall through to Node crypto when WebCrypto rejects Ed25519.
    }
  }

  const spki = new Uint8Array(ED25519_SPKI_PREFIX.length + pk.length);
  spki.set(ED25519_SPKI_PREFIX, 0);
  spki.set(pk, ED25519_SPKI_PREFIX.length);
  const { createPublicKey, verify: nodeVerify } = await import('node:crypto');
  const keyObject = createPublicKey({
    key: Buffer.from(spki),
    format: 'der',
    type: 'spki',
  });
  return nodeVerify(null, Buffer.from(msg), keyObject, Buffer.from(sig));
}

/**
 * Verify chain linkage, entry hashes, format_version, and signed heads.
 * On success, `lines` matches the five-line CLI verdict.
 */
export async function verifyLedger(args: VerifyLedgerArgs): Promise<VerifyVerdict> {
  const { entries, heads, onProgress } = args;
  const pinned = args.pinnedPubkey ?? PINNED_PUBKEY;

  if (entries.length === 0) {
    return {
      ok: true,
      entries: 0,
      seq_first: null,
      seq_last: null,
      span_start: null,
      span_end: null,
      head: null,
      coverage_skipped: 0,
      coverage_failed: 0,
      failure: null,
      lines: ['chain: empty', 'heads: none yet'],
    };
  }

  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  const total = sorted.length + heads.length;
  let done = 0;

  let coverage_skipped = 0;
  let coverage_failed = 0;
  let span_start: string | null = null;
  let span_end: string | null = null;

  if (sorted[0].seq !== 0) {
    return fail('chain must start at seq 0', sorted[0].seq);
  }

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const seq = entry.seq;

    if (entry.format_version !== 1) {
      return fail('format_version must be 1', seq);
    }
    if (seq !== i) {
      return fail(`seq discontinuity: expected ${i}, got ${seq}`, i);
    }

    if (typeof entry.recorded_at === 'string') {
      if (span_start === null || entry.recorded_at < span_start) {
        span_start = entry.recorded_at;
      }
      if (span_end === null || entry.recorded_at > span_end) {
        span_end = entry.recorded_at;
      }
    }

    if (entry.event === 'observation_digest' && entry.observation_digest) {
      coverage_skipped += Number(entry.observation_digest.skipped ?? 0);
      coverage_failed += Number(entry.observation_digest.failed ?? 0);
    }

    if (typeof entry.entry_hash !== 'string' || !entry.entry_hash) {
      return fail('missing entry_hash', seq);
    }
    if (typeof entry.prev_hash !== 'string' || !entry.prev_hash) {
      return fail('missing prev_hash', seq);
    }

    if (seq === 0) {
      if (entry.prev_hash !== GENESIS_PREV) {
        return fail('genesis prev_hash must be sixty-four zeros', 0);
      }
    } else {
      const prev = sorted[i - 1];
      if (entry.prev_hash !== prev.entry_hash) {
        return fail('prev_hash mismatch', seq);
      }
    }

    const { entry_hash: _omit, ...withoutHash } = entry;
    const computed = await entryHash(withoutHash);
    if (computed !== entry.entry_hash) {
      return fail('entry_hash mismatch', seq);
    }

    done += 1;
    onProgress?.({ phase: 'chain', done, total });
  }

  const bySeq = new Map<number, LedgerEntry>();
  for (const e of sorted) {
    bySeq.set(e.seq, e);
  }

  let headStatus: HeadStatus | null = null;

  for (let hi = 0; hi < heads.length; hi++) {
    const line = heads[hi];
    const { head, signature, public_key, key_id: lineKeyId } = line;

    if (public_key !== pinned) {
      return fail('head public_key does not match pinned key');
    }

    const expectedKeyId = await keyId(public_key);
    const headSeq = Number(head.seq);
    if (lineKeyId !== expectedKeyId) {
      return fail('key_id mismatch', headSeq);
    }

    const tip = bySeq.get(headSeq);
    if (!tip) {
      return fail('head seq not found in entries', headSeq);
    }
    if (head.entry_hash !== tip.entry_hash) {
      return fail('head entry_hash mismatch', headSeq);
    }

    const message = canonicalJson({
      entry_hash: head.entry_hash,
      log_id: head.log_id,
      recorded_at: head.recorded_at,
      seq: head.seq,
    });
    const sigOk = await verifyEd25519(public_key, message, signature);
    if (!sigOk) {
      return fail('head signature invalid', headSeq);
    }

    headStatus = {
      valid: true,
      key_prefix: public_key.slice(0, 4),
      seq: headSeq,
      entry_hash: head.entry_hash,
    };

    done += 1;
    onProgress?.({ phase: 'heads', done, total });
  }

  const body = {
    entries: sorted.length,
    seq_first: sorted[0].seq,
    seq_last: sorted[sorted.length - 1].seq,
    span_start,
    span_end,
    head: headStatus,
    coverage_skipped,
    coverage_failed,
  };

  return {
    ok: true,
    ...body,
    failure: null,
    lines: successLines(body),
  };
}

/** Verify a head signature (conformance vectors may use a non-production key). */
export async function verifyHeadSignature(
  head: HeadObject,
  signatureHex: string,
  publicKeyHex: string,
): Promise<boolean> {
  const message = canonicalJson({
    entry_hash: head.entry_hash,
    log_id: head.log_id,
    recorded_at: head.recorded_at,
    seq: head.seq,
  });
  return verifyEd25519(publicKeyHex, message, signatureHex);
}

export function ed25519Available(): boolean {
  return typeof globalThis.crypto?.subtle?.importKey === 'function';
}
