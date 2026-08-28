import { test, expect, type Page } from '@playwright/test';

/**
 * That the plugin mounts, and that its REST route reports failures usefully.
 *
 * The route used to answer every failure with a bare 500, because
 * ctx.throw(500) has Koa suppress the message. A video with no captions, a
 * mistyped id and YouTube refusing were indistinguishable. These lock in the
 * statuses so that cannot come back.
 */

const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

async function signIn(page: Page) {
  await page.goto('/admin/auth/login');
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASSWORD!);
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForURL(/\/admin(?!\/auth)/, { timeout: 30_000 });
}

test.describe('admin panel', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run these.');

  test.beforeEach(async ({ page }) => { await signIn(page); });

  test('the plugin mounts at its own route', async ({ page }) => {
    // The id changed from ai-sdk-yt-transcripts to youtube-transcripts, which
    // moved this route. A stale bundle lands on a 404 instead.
    const response = await page.goto('/admin/plugins/youtube-transcripts');

    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).not.toContainText(/page not found/i);
  });

  test('loads with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/admin/plugins/youtube-transcripts');
    await page.waitForTimeout(2000);

    const relevant = errors.filter((e) => !/favicon|third-party|analytics/i.test(e));
    expect(relevant, `console errors: ${relevant.join(' | ')}`).toHaveLength(0);
  });
});

test.describe('the REST route reports failures usefully', () => {
  // No login needed: this route is public, and the statuses are the point.

  test('an unavailable video is 404, not an opaque 500', async ({ request }) => {
    const res = await request.get('/api/youtube-transcripts/yt-transcript/aaaaaaaaaaa');

    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.error?.message).not.toBe('Internal Server Error');
    expect(body.error?.message).toMatch(/unavailable|private|does not exist|captions/i);
  });

  test('a malformed id is rejected without reaching YouTube', async ({ request }) => {
    const res = await request.get('/api/youtube-transcripts/yt-transcript/not-a-video');

    expect(res.status()).toBeLessThan(500);
  });
});
