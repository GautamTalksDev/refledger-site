import { expect, test } from '@playwright/test';

test('one container: header, page, and footer share an edge', async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const edges = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), w: Math.round(r.width) };
      };
      return {
        header: box('header .wrap'),
        main: box('main .wrap'),
        footer: box('footer .wrap'),
        pad: parseFloat(getComputedStyle(document.querySelector('footer .wrap')!).paddingLeft),
      };
    });
    expect(edges.header).toEqual(edges.main);
    expect(edges.main).toEqual(edges.footer);
    expect(edges.pad).toBeGreaterThanOrEqual(24);
  }
});

test('newest entry control is named and disabled', async ({ page }) => {
  await page.goto('/');
  const href = await page.getByRole('link', { name: 'Latest entry' }).getAttribute('href');
  expect(href).toMatch(/^\/e\/\d+$/);
  await page.goto(href!);
  const newest = page.getByRole('button', { name: 'Newest entry' });
  await expect(newest).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Entry', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Entry', exact: true })).toHaveCount(0);
});

test('entry JSON panel aligns with the facts column and does not scroll sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/e/66');
  const tops = await page.evaluate(() => {
    const facts = document.querySelector('.entry-facts')!.getBoundingClientRect();
    const json = document.querySelector('.entry-json')!.getBoundingClientRect();
    const pre = document.querySelector('.entry-json pre') as HTMLElement;
    return {
      factsTop: Math.round(facts.top),
      jsonTop: Math.round(json.top),
      jsonBottom: Math.round(json.bottom),
      factsBottom: Math.round(facts.bottom),
      overflow: pre.scrollWidth - pre.clientWidth,
    };
  });
  expect(Math.abs(tops.factsTop - tops.jsonTop)).toBeLessThanOrEqual(1);
  expect(tops.jsonBottom).toBeGreaterThanOrEqual(tops.factsBottom - 1);
  expect(tops.overflow).toBeLessThanOrEqual(1);
});

test('example results collapse local actions and lead with a moved tag', async ({ page }) => {
  await page.goto('/check?example=1');
  const summary = page.locator('summary');
  await expect(summary).toContainText(/local action(?:s)? skipped \(not affected by moved tags\)/);
  await expect(summary).toBeVisible();
  const specs = await page.locator('ol.results > li .mono').allTextContents();
  const moved = specs.findIndex((s) => s.includes('reviewdog/action-actionlint@v1'));
  const pin = specs.findIndex((s) => s.includes('11bd7190'));
  expect(moved).toBeGreaterThanOrEqual(0);
  expect(pin).toBeGreaterThan(moved);
  await expect(page.locator('ol.results')).not.toContainText('docker://');
  await expect(page.locator('ol.results')).not.toContainText('./.github/actions/build');
});
