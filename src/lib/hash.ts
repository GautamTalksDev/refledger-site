import { canonicalJson } from './canonical';

function toBytes(input: Uint8Array | string): Uint8Array {
  if (typeof input === 'string') {
    return new TextEncoder().encode(input);
  }
  return input;
}

/**
 * WebCrypto's BufferSource is typed against ArrayBuffer only. Copy into a
 * fresh ArrayBuffer-backed view so SharedArrayBuffer-backed inputs are safe.
 */
function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function nodeHash(
  algo: 'sha256' | 'sha512',
  bytes: Uint8Array,
): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash(algo).update(Buffer.from(bytes)).digest('hex');
}

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = toBytes(input);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      toBufferSource(bytes),
    );
    return bytesToHex(new Uint8Array(digest));
  }
  return nodeHash('sha256', bytes);
}

export async function sha512Hex(input: Uint8Array | string): Promise<string> {
  const bytes = toBytes(input);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-512',
      toBufferSource(bytes),
    );
    return bytesToHex(new Uint8Array(digest));
  }
  return nodeHash('sha512', bytes);
}

export async function entryHash(entryWithoutHash: object): Promise<string> {
  const canonical = canonicalJson(entryWithoutHash);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`odd hex length: ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function keyId(publicKeyHex: string): Promise<string> {
  const hex = await sha256Hex(hexToBytes(publicKeyHex));
  return `sha256:${hex}`;
}
