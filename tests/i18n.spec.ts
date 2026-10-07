import { test, expect } from '@playwright/test';

/**
 * i18n tests: the funnel supports RU (default) and EN, switchable at runtime
 * and via the `?lang=` query parameter.
 */

test('?lang=ru loads the Russian UI', async ({ page }) => {
  await page.goto('/?lang=ru');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('#selectorPage')).toContainText('Быстрый скрининг');
});

test('?lang=en loads the English UI', async ({ page }) => {
  await page.goto('/?lang=en');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#selectorPage')).not.toContainText('Быстрый скрининг');
});

test('the language switcher changes the UI without a reload', async ({ page }) => {
  await page.goto('/?lang=ru');
  const heading = page.locator('#selectorPage h2').first();
  const ruHeading = await heading.textContent();

  await page.locator('#langSwitcher').selectOption('en');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(heading).not.toHaveText(ruHeading ?? '');
});

test('the chosen language is remembered in localStorage', async ({ page }) => {
  await page.goto('/?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const stored = await page.evaluate(() => localStorage.getItem('tf_lang'));
  expect(stored).toBe('en');
});

test('switching language mid-test keeps the progress and answers', async ({ page }) => {
  await page.goto('/?lang=ru');
  await page.locator('.selector-card').first().click();
  await page.locator('.question-card.active .option').first().click();

  // Now on question 2 of 5 in Russian.
  await page.locator('#langSwitcher').selectOption('en');

  // Still on question 2, but in English.
  await expect(page.locator('#progressText')).toHaveText('Question 2 of 5');
});
