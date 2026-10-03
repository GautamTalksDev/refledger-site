/**
 * Words glued to links survive Astro's compressHTML ("stored.Paste",
 * "insteador"). A letter or period sitting against <a>, or a letter
 * sitting against </a>, is a miss.
 */

export function findGluedLinks(html) {
  const cleaned = String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const re = /(?:[A-Za-z0-9.]<a\b|<\/a>[A-Za-z0-9])/g;
  const hits = [];
  for (const m of cleaned.matchAll(re)) {
    const at = m.index ?? 0;
    hits.push(cleaned.slice(Math.max(0, at - 24), at + m[0].length + 24));
  }
  return hits;
}
