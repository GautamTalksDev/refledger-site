import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const base = 'http://127.0.0.1:4321';
mkdirSync(outDir, { recursive: true });

const routes = [
  ['home', '/'],
  ['results', '/check?example=1'],
  ['entry', '/e/77'],
  ['incidents', '/incidents'],
  ['verify', '/verify'],
];
const widths = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
];
const schemes = ['light', 'dark'];

const browser = await chromium.launch();
for (const scheme of schemes) {
  for (const [wname, width, height] of widths) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: scheme,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    for (const [name, route] of routes) {
      await page.goto(base + route, { waitUntil: 'networkidle' });
      if (name === 'results') {
        await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 20000 });
      }
      const file = join(outDir, `${name}-${wname}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await context.close();
  }
}
await browser.close();
