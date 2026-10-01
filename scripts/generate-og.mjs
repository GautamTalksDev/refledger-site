#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function renderOg(title, subtitle) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#EDF0EE"/>
  <rect x="64" y="64" width="1072" height="502" rx="22" fill="#F7F9F8" stroke="#D3DAD6"/>
  <text x="96" y="160" font-family="DejaVu Sans, sans-serif" font-size="28" fill="#5E6A69">Refledger</text>
  <text x="96" y="230" font-family="DejaVu Sans, sans-serif" font-size="48" fill="#262B30">${esc(title)}</text>
  <text x="96" y="290" font-family="DejaVu Sans, sans-serif" font-size="28" fill="#4A5553">${esc(subtitle)}</text>
  <line x1="96" y1="400" x2="1100" y2="400" stroke="#262B30" stroke-width="3"/>
  <path d="M400 400 L400 360 L520 360 L520 400" fill="none" stroke="#2347C8" stroke-width="3"/>
  <line x1="520" y1="400" x2="1100" y2="400" stroke="#262B30" stroke-width="3"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const outDefault = path.join(root, 'public/og/default.png');
fs.mkdirSync(path.dirname(outDefault), { recursive: true });
fs.writeFileSync(
  outDefault,
  await renderOg('A tag is a pointer.', 'We write down where it points.'),
);

const watchedPath = path.join(root, '.cache/refledger-main/population/watched.jsonl');
const repos = [
  ...new Set(
    fs
      .readFileSync(watchedPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).repo),
  ),
];

for (const repo of repos) {
  const [owner, name] = repo.split('/');
  const dir = path.join(root, 'public/og/a', owner);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${name}.png`),
    await renderOg(repo, 'Tag binding record'),
  );
}
console.log(`Wrote OG images for ${repos.length} repos + default`);
