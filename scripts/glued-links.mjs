/**
 * Astro compressHTML ("jsx") strips whitespace-only text between inline
 * tags, so "Example" next to "A result" becomes "ExampleA result", and
 * "stored." next to a link becomes "stored.Paste". Flag a word or period
 * that meets another word with only inline tags between them.
 *
 * Sibling nav anchors (`</a><a>`) are skipped: each link is its own
 * control, and a space text node between flex children would become an
 * anonymous flex item.
 */

const INLINE =
  'a|span|code|strong|em|b|i|small|mark|label|time|abbr|sub|sup|kbd|var|samp|cite|q|dfn';

const GLUED = new RegExp(
  `[A-Za-z0-9.]((?:</?(?:${INLINE})\\b[^>]*>)+)[A-Za-z0-9]`,
  'gi',
);

/**
 * Sibling anchors. Allow closing phrasing tags from the previous link
 * and opening phrasing tags at the start of the next
 * (`</span></a><a…><span…>`).
 */
const PHRASE = 'span|b|i|strong|em|code|small|mark';
const SIBLING_ANCHORS = new RegExp(
  `^(?:</(?:${PHRASE})>)*` +
    `</a>\\s*<a\\b[^>]*>` +
    `(?:<(?:${PHRASE})\\b[^>]*>)*$`,
  'i',
);

export function findGluedLinks(html) {
  const cleaned = String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const hits = [];
  for (const m of cleaned.matchAll(GLUED)) {
    const tags = m[1] ?? '';
    if (SIBLING_ANCHORS.test(tags)) continue;
    const at = m.index ?? 0;
    hits.push(cleaned.slice(Math.max(0, at - 24), at + m[0].length + 24));
  }
  return hits;
}
