import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const widths = [390, 768, 1440] as const;
const routes = ['/', '/moved', '/how', '/verify', '/paste', '/incidents'];

const outDir = process.env.SCREEN_DIR || 'design/screens/after';

test.describe('visual screenshots', () => {
  for (const w of widths) {
    for (const colorScheme of ['light', 'dark'] as const) {
      for (const route of routes) {
        test(`${route} ${w} ${colorScheme}`, async ({ page }) => {
          mkdirSync(outDir, { recursive: true });
          await page.emulateMedia({ colorScheme });
          await page.setViewportSize({ width: w, height: 900 });
          await page.goto(route, { waitUntil: 'networkidle' });
          const slug = `${route === '/' ? 'home' : route.replace(/\//g, '_').slice(1)}-${w}-${colorScheme}`;
          await page.screenshot({
            path: join(outDir, `${slug}.png`),
            fullPage: true,
          });
          expect(true).toBe(true);
        });
      }
    }
  }
});
