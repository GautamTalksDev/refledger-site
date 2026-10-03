import { test, expect } from '@playwright/test';

test('paste mode rejects hostile markup without executing it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', () => {
    throw new Error('unexpected dialog (script executed)');
  });

  await page.goto('/paste');
  const hostile = `
name: hostile
on: push
jobs:
  x:
    runs-on: ubuntu-latest
    steps:
      - run: echo '<script>alert(1)</script>'
      - run: echo '<img src=x onerror=alert(1)>'
      - run: echo 'javascript:alert(1)'
      - uses: actions/checkout@v4.2.2
`;
  await page.locator('textarea').fill(hostile);
  await page.getByRole('button', { name: /Check this file/i }).click();
  await expect(page.locator('#check-root')).toContainText(/action|pin|checkout/i, {
    timeout: 30_000,
  });
  await expect(page.locator('#check-root')).not.toContainText('<script>');
  expect(errors.filter((e) => /Content Security Policy/i.test(e))).toEqual([]);
});

test('paste mode rejects a huge paste with an honest message', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/paste');
  const huge = 'a'.repeat(600 * 1024);
  await page.locator('textarea').fill(`steps:\n  - uses: actions/checkout@v4\n# ${huge}`);
  await page.getByRole('button', { name: /Check this file/i }).click();
  await expect(page.locator('#check-root')).toContainText(/too large|512 KiB/i, {
    timeout: 15_000,
  });
});

test('repo input with Unicode tricks does not hang the page', async ({
  page,
}) => {
  const repo = 'actions/\u202Echeckout';
  await page.goto(`/check?repo=${encodeURIComponent(repo)}`);
  await expect(page.locator('#check-root')).toContainText(/doesn.t look like|repository/i, {
    timeout: 10_000,
  });
});
