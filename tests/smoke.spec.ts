import { test, expect } from '@playwright/test';

/**
 * Smoke tests: every static page and the locale files must be reachable.
 */

const STATIC_PAGES = ['/', '/home.html', '/auth.html', '/chat.html', '/tos.html', '/privacy.html'];

test.describe('static pages respond', () => {
  for (const path of STATIC_PAGES) {
    test(`GET ${path} returns 200`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
    });
  }
});

test('locale files are served as valid JSON', async ({ request }) => {
  for (const lang of ['ru', 'en']) {
    const res = await request.get(`/locales/${lang}.json`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.schools).toBeTruthy();
  }
});

test('index page exposes navigation to the AI chat', async ({ page }) => {
  await page.goto('/?lang=ru');
  await expect(page.locator('nav a[href="chat.html"]')).toBeVisible();
});
