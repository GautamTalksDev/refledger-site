import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function expectNoSeriousAxe(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test('home', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'workflow running the code you think',
  );
  await expectNoSeriousAxe(page);
});

test('action page', async ({ page }) => {
  await page.goto('/a/actions/checkout');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'actions/checkout',
  );
  await expectNoSeriousAxe(page);
});

test('tag page', async ({ page }) => {
  await page.goto('/a/GautamTalksDev/canary/v1.0.0');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('v1.0.0');
  await expectNoSeriousAxe(page);
});

test('moved', async ({ page }) => {
  await page.goto('/moved');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'What moved',
  );
  await expectNoSeriousAxe(page);
});

test('verify page and in-browser verifier', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/verify');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    "Don't trust us",
  );
  await expect(page.getByText('Ledger data: CC0, public domain')).toBeVisible();
  await expectNoSeriousAxe(page);

  await page.getByRole('button', { name: 'Verify the whole ledger' }).click();
  await expect(page.locator('#vresult')).toContainText('chain: OK', {
    timeout: 120_000,
  });
  const text = await page.locator('#vresult').innerText();
  expect(text).toMatch(/head: signed, valid/);
});
