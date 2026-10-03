/**
 * Node 22+ JSON.parse passes a third reviver argument `{ source }` with the
 * raw token text. TypeScript's DOM/lib typings only declare the two-argument
 * form, so we call through a local overload that matches Node's runtime.
 */

export type JsonReviverContext = {
  source: string;
};

type JsonParseWithSource = (
  text: string,
  reviver: (
    this: unknown,
    key: string,
    value: unknown,
    context: JsonReviverContext,
  ) => unknown,
) => unknown;

/** Parse JSON, promoting unsafe integers to bigint via the source token. */
export function parseJsonPreserveInts(text: string): unknown {
  const parse = JSON.parse as JsonParseWithSource;
  return parse(text, (_key, value, context) => {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      const src = context.source;
      if (/^-?\d+$/.test(src)) return BigInt(src);
    }
    return value;
  });
}
