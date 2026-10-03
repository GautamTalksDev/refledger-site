import { test, expect } from '@playwright/test';

/** Same CSP as public/_headers (Cloudflare Pages). */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "require-trusted-types-for 'script'",
  "trusted-types refledger",
].join('; ');

async function withCsp(
  page: import('@playwright/test').Page,
  run: () => Promise<void>,
) {
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = {
      ...response.headers(),
      'content-security-policy': CSP,
    };
    await route.fulfill({ response, headers });
  });
  await run();
}

test('check flow works under strict CSP and Trusted Types', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await withCsp(page, async () => {
    await page.goto('/check?example=1');
    await expect(page.locator('#check-root')).toBeVisible();
    await expect(page.locator('#check-root')).toContainText(/uses:|Pin|action|workflow/i, {
      timeout: 15_000,
    });
    expect(errors.filter((e) => /Content Security Policy|TrustedHTML|Trusted Type/i.test(e))).toEqual(
      [],
    );
  });
});

test('in-browser verifier works under CSP', async ({ page }) => {
  test.setTimeout(180_000);
  await withCsp(page, async () => {
    await page.goto('/verify');
    await page.getByRole('button', { name: 'Verify the whole ledger' }).click();
    await expect(page.locator('#vresult')).toContainText('chain: OK', {
      timeout: 120_000,
    });
    await expect(page.locator('#vresult')).toContainText(/head: signed, valid/);
  });
});

test('privacy and security pages render', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacy');
  await expect(page.getByText('[PRIVACY CONTACT]')).toBeVisible();
  await page.goto('/security');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Security');
  await page.goto('/.well-known/security.txt');
  await expect(page.locator('body')).toContainText('Contact:');
});
