#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { findGluedLinks } from './glued-links.mjs';

const dist = path.resolve('dist');
if (!fs.existsSync(dist)) {
  console.error('dist/ missing; run build first');
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walk(dist)) {
  if (file.includes(`${path.sep}verify${path.sep}log${path.sep}`)) continue;
  const hits = findGluedLinks(fs.readFileSync(file, 'utf8'));
  for (const hit of hits) {
    console.error(`${path.relative(dist, file)}: ${hit}`);
    failed = true;
  }
}
if (failed) {
  console.error('Words are glued across inline elements.');
  process.exit(1);
}
console.log('Inline element spacing OK');
