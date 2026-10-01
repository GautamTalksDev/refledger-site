#!/usr/bin/env node
/**
 * Publish log JSONL + heads into public/verify/ for the in-browser verifier.
 * Also writes manifest.json listing those files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logSrc = path.join(root, '.cache/refledger-data/log');
const outDir = path.join(root, 'public/verify/log');

if (!fs.existsSync(logSrc)) {
  console.error('Missing .cache/refledger-data/log. Run npm run fetch-data first.');
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function walk(dir, base = dir) {
  const files = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) files.push(...walk(p, base));
    else if (name.endsWith('.jsonl')) files.push(path.relative(base, p));
  }
  return files.sort();
}

const all = walk(logSrc);
const dayFiles = all.filter((f) => f !== 'heads.jsonl' && /^\d{4}\/\d{2}\/\d{2}\.jsonl$/.test(f));

for (const rel of all) {
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(logSrc, rel), dest);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  logFiles: dayFiles.map((f) => `/verify/log/${f}`),
  headsFile: '/verify/log/heads.jsonl',
  pinnedPubkey:
    'b3e7e795c35dee53731e039b76da930fc54e87e2edc632449a8a2e55252e276a',
};

fs.writeFileSync(
  path.join(root, 'public/verify/manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(`Published ${dayFiles.length} day files + heads to public/verify/`);
