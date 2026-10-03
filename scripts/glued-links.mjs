/**
 * Astro compressHTML ("jsx") strips whitespace-only text between inline
 * tags, so "Example" next to "A result" becomes "ExampleA result", and
 * "stored." next to a link becomes "stored.Paste". Flag a word or period
 * that meets another word with only inline tags between them.
 *
 * Sibling nav anchors are skipped: each link is its own control.
 *
 * HTML is parsed with parse5. Tag shapes are not matched with regular
 * expressions.
 */
import { parseFragment } from 'parse5';

const INLINE = new Set([
  'a',
  'span',
  'code',
  'strong',
  'em',
  'b',
  'i',
  'small',
  'mark',
  'label',
  'time',
  'abbr',
  'sub',
  'sup',
  'kbd',
  'var',
  'samp',
  'cite',
  'q',
  'dfn',
]);

/** Phrase tags that may wrap the text inside a sibling anchor. */
const PHRASE = new Set(['span', 'b', 'i', 'strong', 'em', 'code', 'small', 'mark']);

const SKIP = new Set(['script', 'style']);

const LEFT = /[A-Za-z0-9.]/;
const RIGHT = /[A-Za-z0-9]/;

function tagOf(node) {
  return String(node.tagName || '').toLowerCase();
}

function isInlineEl(node) {
  return Boolean(node && node.tagName && INLINE.has(tagOf(node)));
}

function collectTextNodes(node, skip, out) {
  if (!node || typeof node !== 'object') return;
  if (node.nodeName === '#text') {
    if (!skip) out.push(node);
    return;
  }
  if (node.nodeName === '#comment') return;
  const next = skip || SKIP.has(tagOf(node));
  for (const child of node.childNodes || []) collectTextNodes(child, next, out);
}

function ancestors(node) {
  const out = [];
  let n = node.parentNode;
  while (n) {
    out.push(n);
    n = n.parentNode;
  }
  return out;
}

function childOf(ancestor, node) {
  let n = node;
  while (n.parentNode && n.parentNode !== ancestor) n = n.parentNode;
  return n;
}

function gapNodeOk(node) {
  if (node.nodeName === '#text') return !String(node.value || '').trim();
  if (node.nodeName === '#comment') return true;
  if (!isInlineEl(node)) return false;
  const texts = [];
  collectTextNodes(node, false, texts);
  return texts.every((t) => !String(t.value || '').trim());
}

/** True when the only markup between two text nodes is inline tags. */
function inlineOnlyBetween(t1, t2) {
  const up = ancestors(t1);
  const seen = new Set(up);
  const down = [];
  let n = t2.parentNode;
  let lca = null;
  while (n) {
    if (seen.has(n)) {
      lca = n;
      break;
    }
    down.push(n);
    n = n.parentNode;
  }
  if (!lca) return false;
  for (const p of up) {
    if (p === lca) break;
    if (!isInlineEl(p)) return false;
  }
  for (const p of down) {
    if (!isInlineEl(p)) return false;
  }
  const kids = lca.childNodes || [];
  const i1 = kids.indexOf(childOf(lca, t1));
  const i2 = kids.indexOf(childOf(lca, t2));
  if (i1 < 0 || i2 < 0 || i1 >= i2) return false;
  for (let i = i1 + 1; i < i2; i++) {
    if (!gapNodeOk(kids[i])) return false;
  }
  return true;
}

function anchorOf(textNode) {
  let n = textNode.parentNode;
  while (n && PHRASE.has(tagOf(n))) n = n.parentNode;
  if (n && tagOf(n) === 'a') return n;
  return null;
}

/** `</span></a><a><span>` between two links is not glued prose. */
function siblingAnchors(t1, t2) {
  const a1 = anchorOf(t1);
  const a2 = anchorOf(t2);
  if (!a1 || !a2 || a1 === a2 || a1.parentNode !== a2.parentNode) return false;
  const kids = a1.parentNode.childNodes || [];
  const i1 = kids.indexOf(a1);
  const i2 = kids.indexOf(a2);
  if (i1 < 0 || i2 <= i1) return false;
  for (let i = i1 + 1; i < i2; i++) {
    const k = kids[i];
    if (k.nodeName === '#comment') continue;
    if (k.nodeName === '#text' && !String(k.value || '').trim()) continue;
    return false;
  }
  return true;
}

export function findGluedLinks(html) {
  const frag = parseFragment(String(html));
  const texts = [];
  collectTextNodes(frag, false, texts);
  const hits = [];
  for (let i = 0; i < texts.length - 1; i++) {
    const t1 = texts[i];
    const t2 = texts[i + 1];
    const v1 = String(t1.value || '');
    const v2 = String(t2.value || '');
    if (!v1 || !v2) continue;
    if (!LEFT.test(v1[v1.length - 1])) continue;
    if (!RIGHT.test(v2[0])) continue;
    if (!inlineOnlyBetween(t1, t2)) continue;
    if (siblingAnchors(t1, t2)) continue;
    hits.push(`${v1.slice(-24)}${v2.slice(0, 24)}`);
  }
  return hits;
}
