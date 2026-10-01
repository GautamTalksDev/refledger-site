import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical';

function toBytes(input: Uint8Array | string): Uint8Array {
  if (typeof input === 'string') {
    return new TextEncoder().encode(input);
  }
  return input;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const bytes = toBytes(input);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

export async function sha512Hex(input: Uint8Array | string): Promise<string> {
  const bytes = toBytes(input);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-512', bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  return createHash('sha512').update(Buffer.from(bytes)).digest('hex');
}

export async function entryHash(entryWithoutHash: object): Promise<string> {
  const canonical = canonicalJson(entryWithoutHash);
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`odd hex length: ${hex.length}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function keyId(publicKeyHex: string): Promise<string> {
  const hex = await sha256Hex(hexToBytes(publicKeyHex));
  return `sha256:${hex}`;
}
