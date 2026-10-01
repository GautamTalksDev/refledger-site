#!/usr/bin/env node
/** Fail if any page's JS assets exceed 50 KB gzipped. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dist = path.resolve('dist');
const LIMIT = 50 * 1024;

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const htmlFiles = walk(dist).filter((f) => f.endsWith('.html'));
let failed = false;

for (const htmlPath of htmlFiles) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  let total = 0;
  for (const src of scripts) {
    if (src.startsWith('http')) continue;
    const file = path.join(dist, src.replace(/^\//, ''));
    if (!fs.existsSync(file)) continue;
    const gz = zlib.gzipSync(fs.readFileSync(file));
    total += gz.length;
  }
  // Inline module scripts approximate: count <script> without src
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of inline) {
    total += zlib.gzipSync(Buffer.from(m[1] || '')).length;
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
