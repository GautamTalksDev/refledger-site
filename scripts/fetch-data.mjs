#!/usr/bin/env node
/**
 * Refresh shallow clones under .cache/ for the Refledger site build.
 * Usage: node scripts/fetch-data.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache');
const REPO = 'https://github.com/GautamTalksDev/refledger.git';

function refresh(branch, destName) {
  const dest = join(CACHE, destName);
  mkdirSync(CACHE, { recursive: true });

  if (existsSync(join(dest, '.git'))) {
    console.log(`Fetching ${branch} into ${dest}...`);
    execFileSync('git', ['-C', dest, 'fetch', '--depth', '1', 'origin', branch], {
      stdio: 'inherit',
    });
    execFileSync('git', ['-C', dest, 'checkout', '-f', 'FETCH_HEAD'], {
      stdio: 'inherit',
    });
    execFileSync('git', ['-C', dest, 'clean', '-fdx'], { stdio: 'inherit' });
    return;
  }

  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }

  console.log(`Cloning ${branch} into ${dest}...`);
  execFileSync(
    'git',
    [
      'clone',
      '--depth',
      '1',
      '--branch',
      branch,
      '--single-branch',
      REPO,
      dest,
    ],
    { stdio: 'inherit' },
  );
}

refresh('data', 'refledger-data');
refresh('main', 'refledger-main');
console.log('Cache refreshed.');
