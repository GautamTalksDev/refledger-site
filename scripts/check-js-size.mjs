#!/usr/bin/env node
/** Fail if any page's JS assets exceed 60 KB gzipped. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parse } from 'parse5';

const dist = path.resolve('dist');
const LIMIT = 60 * 1024;

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function tagOf(node) {
  return String(node.tagName || '').toLowerCase();
}

function scriptParts(html) {
  const doc = parse(html);
  const srcs = [];
  const inlines = [];
  function visit(node) {
    if (!node || node.nodeName === '#text' || node.nodeName === '#comment') return;
    if (tagOf(node) === 'script') {
      const src = (node.attrs || []).find((a) => a.name === 'src');
      if (src && src.value) srcs.push(src.value);
      else {
        const text = (node.childNodes || [])
          .filter((c) => c.nodeName === '#text')
          .map((c) => c.value || '')
          .join('');
        inlines.push(text);
      }
      return;
    }
    for (const child of node.childNodes || []) visit(child);
  }
  visit(doc);
  return { srcs, inlines };
}

const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
let failed = false;

for (const htmlPath of htmlFiles) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const { srcs, inlines } = scriptParts(html);
  let total = 0;
  for (const src of srcs) {
    if (src.startsWith('http')) continue;
    const file = path.join(dist, src.replace(/^\//, ''));
    if (!fs.existsSync(file)) continue;
    const gz = zlib.gzipSync(fs.readFileSync(file));
    total += gz.length;
  }
  for (const text of inlines) {
    total += zlib.gzipSync(Buffer.from(text)).length;
  }
  if (total > LIMIT) {
    console.error(
      `${path.relative(dist, htmlPath)}: JS gzipped ${total} bytes > ${LIMIT}`,
    );
    failed = true;
  } else {
    console.log(`${path.relative(dist, htmlPath)}: ${total} bytes gzipped JS`);
  }
}

if (failed) process.exit(1);
console.log('JS size OK');
