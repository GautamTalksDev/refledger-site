/**
 * Trusted Types helper. Under CSP require-trusted-types-for 'script',
 * string assignments to innerHTML throw. All sinks go through setHTML.
 *
 * The policy only accepts HTML that callers have already escaped or built
 * from static templates. It does not sanitize arbitrary markup.
 */

type TrustedHTML = { readonly __brand: 'TrustedHTML' };

type TtPolicy = {
  createHTML: (input: string) => TrustedHTML;
};

type TtFactory = {
  createPolicy: (name: string, rules: { createHTML: (s: string) => string }) => TtPolicy;
};

declare global {
  interface Window {
    trustedTypes?: TtFactory;
  }
}

let policy: TtPolicy | null = null;
let tried = false;

function getPolicy(): TtPolicy | null {
  if (tried) return policy;
  tried = true;
  const tt = typeof window !== 'undefined' ? window.trustedTypes : undefined;
  if (!tt?.createPolicy) return null;
  try {
    policy = tt.createPolicy('refledger', {
      createHTML: (s: string) => s,
    });
  } catch {
    // Policy may already exist if the module loaded twice in HMR.
    policy = null;
  }
  return policy;
}

/** Assign HTML to an element under Trusted Types when available. */
export function setHTML(el: Element, html: string): void {
  const p = getPolicy();
  if (p) {
    (el as HTMLElement).innerHTML = p.createHTML(html) as unknown as string;
  } else {
    (el as HTMLElement).innerHTML = html;
  }
}

/** Clear an element's children without a string sink when possible. */
export function clearHTML(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
