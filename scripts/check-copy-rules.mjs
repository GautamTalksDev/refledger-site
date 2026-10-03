#!/usr/bin/env node
/**
 * Fail CI if built HTML / RSS contains em dashes, en dashes, or ASCII "--"
 * in page copy (text, titles, meta, alt, aria-label). Exceptions:
 *   - content inside <code> (real CLI flags)
 *   - <style> / <script> blocks
 *   - CSS custom properties (var(--…))
 *
 * Markup is parsed with parse5. Tags are not stripped with regular expressions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';

const dist = path.resolve('dist');

const BAD = [
  { name: 'em dash', re: /\u2014/ },
  { name: 'en dash', re: /\u2013/ },
  { name: 'double hyphen', re: /--/ },
];

const SKIP_TEXT = new Set(['script', 'style', 'code']);
const COPY_ATTRS = new Set([
  'alt',
  'title',
  'aria-label',
  'content',
  'aria-description',
]);

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.html') || name.endsWith('.xml')) out.push(p);
  }
  return out;
}

function tagOf(node) {
  return String(node.tagName || '').toLowerCase();
}

export function extractCopy(html) {
  const doc = parse(String(html));
  const texts = [];
  const attrs = [];

  function visit(node, skipText) {
    if (!node || typeof node !== 'object') return;
    if (node.nodeName === '#text') {
      if (!skipText && node.value) texts.push(node.value);
      return;
    }
    if (node.nodeName === '#comment') return;
    const tag = tagOf(node);
    const nextSkip = skipText || SKIP_TEXT.has(tag);
    for (const attr of node.attrs || []) {
      const name = String(attr.name || '').toLowerCase();
      if (COPY_ATTRS.has(name) && attr.value) attrs.push(attr.value);
    }
    for (const child of node.childNodes || []) visit(child, nextSkip);
  }

  visit(doc, false);
  const body = texts.join(' ').replace(/var\(--[^)]*\)/g, ' ');
  const attrText = attrs.join('\n').replace(/var\(--[^)]*\)/g, ' ');
  return `${body}\n${attrText}`;
}

function main() {
if (!fs.existsSync(dist)) {
  console.error('dist/ missing; run build first');
  process.exit(1);
}
let failed = false;
for (const file of walk(dist)) {
  // Skip raw published ledger JSONL under verify/log (not page copy).
  if (file.includes(`${path.sep}verify${path.sep}log${path.sep}`)) continue;
  // Upstream METHOD.md may contain dashes; we host it as a transcript.
  if (file.includes(`${path.sep}population${path.sep}METHOD`)) continue;
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
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();
