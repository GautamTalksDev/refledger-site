import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = [
  '/',
  '/moved',
  '/how',
  '/verify',
  '/paste',
  '/privacy',
  '/security',
  '/incidents',
  '/a/actions/checkout',
  '/check?example=1',
];

async function axeOk(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

for (const route of ROUTES) {
  test(`route ${route} desktop light axe`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await axeOk(page);
  });

  test(`route ${route} mobile dark reduced-motion axe`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await axeOk(page);
  });
}

test('404 page', async ({ page }) => {
  const res = await page.goto('/this-route-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await axeOk(page);
});

test('ledger chip uses build data; stale notice respects clock', async ({
  page,
}) => {
  await page.goto('/');
  const chip = page.locator('[data-ledger-as-of]');
  await expect(chip).toBeVisible();
  const iso = await chip.getAttribute('data-ledger-as-of');
  const label = await chip.getAttribute('data-ledger-label');
  expect(iso).toBeTruthy();
  expect(label).toMatch(/UTC$/);
  await expect(chip).toContainText(label!);

  const freshMs = Date.parse(iso!) + 60 * 60 * 1000;
  const staleMs = Date.parse(iso!) + 7 * 60 * 60 * 1000;

  await page.addInitScript((fixed) => {
    const RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) super(fixed);
        else super(...args);
      }
      static now() {
        return fixed;
      }
    }
    // @ts-expect-error test clock
    window.Date = FakeDate;
  }, freshMs);
  await page.goto('/');
  await expect(page.locator('#stale-notice')).toBeHidden();

  await page.addInitScript((fixed) => {
    const RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) super(fixed);
        else super(...args);
      }
      static now() {
        return fixed;
      }
    }
    // @ts-expect-error test clock
    window.Date = FakeDate;
  }, staleMs);
  await page.goto('/');
  await expect(page.locator('#stale-notice')).toBeVisible();
  await expect(page.locator('#stale-notice')).toContainText(
    `Data is from ${label}. Our last update was delayed.`,
  );
});

test('live check: actions/checkout', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/check?repo=actions/checkout');
  await expect(page.locator('#check-root')).toContainText(/action|pin|workflow|uses:/i, {
    timeout: 60_000,
  });
});

test('live check: facebook/react', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/check?repo=facebook/react');
  await expect(page.locator('#check-root')).toContainText(
    /action|pin|workflow|uses:|No workflows|slow down|too large/i,
    { timeout: 60_000 },
  );
});

test('live check: octocat/Hello-World', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/check?repo=octocat/Hello-World');
  await expect(page.locator('#check-root')).toContainText(
    /No workflows|action|pin|repository/i,
    { timeout: 45_000 },
  );
});

test('how it works: hash chain breaks on edit', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/how');
  await page.waitForFunction(() => {
    const h = document.querySelector('[data-hash]');
    return h && (h.textContent || '').trim().length >= 8;
  });
  const before = await page.locator('[data-hash]').first().innerText();
  await page.getByRole('button', { name: /Edit the page yourself/i }).click();
  const editable = page.locator('[contenteditable="true"]').first();
  await expect(editable).toBeVisible({ timeout: 10_000 });
  await editable.click();
  await editable.press('End');
  await editable.type('x');
  await expect
    .poll(async () => page.locator('.stamp.broken').count(), { timeout: 10_000 })
    .toBeGreaterThan(0);
  const after = await page.locator('[data-hash]').first().innerText();
  expect(after).not.toEqual(before);
});

test('how it works: toy move and refused erase', async ({ page }) => {
  await page.goto('/how');
  await page.locator('[data-act="toymove"]').click();
  await expect(page.locator('#toy-msg')).toContainText(/Same label|Different code/i);
  await page.locator('[data-act="toyerase"]').click();
  await expect(page.locator('#toy-msg')).toContainText(/Refused|never be edited|correction/i);
});
