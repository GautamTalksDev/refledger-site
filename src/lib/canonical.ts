/**
 * Canonical JSON per Refledger LOG-FORMAT.md section 1.
 * Third independent implementation (beside signer and verify crates).
 */

function escapeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) {
      out += '\\"';
    } else if (c === 0x5c) {
      out += '\\\\';
    } else if (c === 0x08) {
      out += '\\b';
    } else if (c === 0x0c) {
      out += '\\f';
    } else if (c === 0x0a) {
      out += '\\n';
    } else if (c === 0x0d) {
      out += '\\r';
    } else if (c === 0x09) {
      out += '\\t';
    } else if (c < 0x20) {
      out += '\\u' + c.toString(16).padStart(4, '0');
    } else {
      out += s[i];
    }
  }
  out += '"';
  return out;
}

function serialize(value: unknown): string {
  if (value === null) {
    throw new Error('canonical JSON: null is not permitted');
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`canonical JSON: non-integer number ${value}`);
    }
    if (Object.is(value, -0)) {
      throw new Error('canonical JSON: negative zero is not permitted');
    }
    // Numbers beyond Number.MAX_SAFE_INTEGER lose precision in JSON.parse;
    // callers should pass bigint for u64-max vectors.
    return String(value);
  }
  if (typeof value === 'string') {
    return escapeString(value);
  }
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ',';
      if (value[i] === undefined || value[i] === null) {
        throw new Error('canonical JSON: null/undefined array element');
      }
      out += serialize(value[i]);
    }
    out += ']';
    return out;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined && obj[k] !== null)
      .sort((a, b) => {
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
      });
    let out = '{';
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (i > 0) out += ',';
      out += escapeString(k) + ':' + serialize(obj[k]);
    }
    out += '}';
    return out;
  }
  throw new Error(`canonical JSON: unsupported type ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return serialize(value);
}
