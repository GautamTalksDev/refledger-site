#!/usr/bin/env node
/**
 * Fail CI if built HTML / RSS contains em dashes, en dashes, or ASCII "--"
 * in page copy (text, titles, meta, alt, aria-label). Exceptions:
 *   - content inside <code>…</code> (real CLI flags)
 *   - <style> / <script> blocks
 *   - CSS custom properties (var(--…))
 */
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
if (!fs.existsSync(dist)) {
  console.error('dist/ missing; run build first');
  process.exit(1);
}

const BAD = [
  { name: 'em dash', re: /\u2014/ },
  { name: 'en dash', re: /\u2013/ },
  { name: 'double hyphen', re: /--/ },
];

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.html') || name.endsWith('.xml')) out.push(p);
  }
  return out;
}

function extractCopy(html) {
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, ' ');
  s = s.replace(/var\(--[^)]*\)/g, ' ');
  // Keep attribute copy we care about, then strip tags.
  const attrs = [];
  for (const m of html.matchAll(
    /\b(?:alt|title|aria-label|content|aria-description)\s*=\s*"([^"]*)"/gi,
  )) {
    attrs.push(m[1]);
  }
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&[a-z]+;/gi, ' ');
  return `${s}\n${attrs.join('\n')}`;
}

let failed = false;
for (const file of walk(dist)) {
  // Skip raw published ledger JSONL under verify/log (not page copy).
  if (file.includes(`${path.sep}verify${path.sep}log${path.sep}`)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const text = extractCopy(raw);
  for (const { name, re } of BAD) {
    if (re.test(text)) {
      console.error(`${path.relative(dist, file)}: forbidden ${name}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('Copy rules violated.');
  process.exit(1);
}
console.log('Copy rules OK');
