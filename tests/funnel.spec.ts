import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end tests for the TherapyVoid funnel (index.html).
 *
 * Flow: selector page -> pick screening (quick = 5 / full = 15 questions)
 *       -> answer every question (Option click auto-advances) -> result page.
 */

const QUICK_COUNT = 5;
const FULL_COUNT = 15;

/** Go through the whole screening and stop on the result screen. */
async function completeScreening(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.locator('.question-card.active .option').first().click();
    // The option click auto-advances after ~300 ms; wait for it before the next click.
    if (i < count - 1) {
      await expect(page.locator('#progressText')).toHaveText(`Вопрос ${i + 2} из ${count}`);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?lang=ru');
  await expect(page.locator('#selectorPage')).toBeVisible();
});

test('selector page offers both screening options', async ({ page }) => {
  await expect(page.locator('.selector-card')).toHaveCount(2);
  await expect(page.locator('#selectorPage')).toContainText('Быстрый скрининг');
  await expect(page.locator('#selectorPage')).toContainText('Полный скрининг');
});

test('quick screening starts with question 1 of 5', async ({ page }) => {
  await page.locator('.selector-card').first().click();

  await expect(page.locator('#testPage')).toBeVisible();
  await expect(page.locator('#selectorPage')).toBeHidden();
  await expect(page.locator('#progressText')).toHaveText(`Вопрос 1 из ${QUICK_COUNT}`);
  await expect(page.locator('.question-card.active')).toHaveCount(1);
});

test('full screening starts with question 1 of 15', async ({ page }) => {
  await page.locator('.selector-card').nth(1).click();

  await expect(page.locator('#progressText')).toHaveText(`Вопрос 1 из ${FULL_COUNT}`);
});

test('"next" is disabled until an option is picked; "back" is disabled on question 1', async ({ page }) => {
  await page.locator('.selector-card').first().click();

  await expect(page.locator('#nextBtn')).toBeDisabled();
  await expect(page.locator('#prevBtn')).toBeDisabled();

  await page.locator('.question-card.active .option').first().click();

  // Picking an option marks it and auto-advances to the second question.
  await expect(page.locator('#progressText')).toHaveText(`Вопрос 2 из ${QUICK_COUNT}`);
  await expect(page.locator('#prevBtn')).toBeEnabled();
});

test('going back keeps the answer that was already selected', async ({ page }) => {
  await page.locator('.selector-card').first().click();

  // Pick the second option on the first question.
  await page.locator('.question-card.active .option').nth(1).click();
  await expect(page.locator('#progressText')).toHaveText(`Вопрос 2 из ${QUICK_COUNT}`);

  await page.locator('#prevBtn').click();
  await expect(page.locator('#progressText')).toHaveText(`Вопрос 1 из ${QUICK_COUNT}`);
  await expect(page.locator('#q0o1')).toHaveClass(/selected/);
});

test('completing the quick screening shows a result with a winning school', async ({ page }) => {
  await page.locator('.selector-card').first().click();
  await completeScreening(page, QUICK_COUNT);

  const result = page.locator('#resultContainer');
  await expect(result).toBeVisible();
  await expect(result.locator('.hero-title')).toBeVisible();
  await expect(result.locator('.school-card')).toHaveCount(7);
  await expect(result.locator('.school-card.highlight')).toHaveCount(1);
  await expect(result.locator('.cta-section')).toBeVisible();
});

test('the last question button turns into a "see result" action', async ({ page }) => {
  await page.locator('.selector-card').first().click();

  // Answer all but the last question.
  for (let i = 0; i < QUICK_COUNT - 1; i++) {
    await page.locator('.question-card.active .option').first().click();
    await expect(page.locator('#progressText')).toHaveText(`Вопрос ${i + 2} из ${QUICK_COUNT}`);
  }

  await expect(page.locator('#progressText')).toHaveText(`Вопрос ${QUICK_COUNT} из ${QUICK_COUNT}`);
  await expect(page.locator('#nextBtn')).toHaveText('Узнать результат →');
});

test('restart returns to the selector', async ({ page }) => {
  await page.locator('.selector-card').first().click();
  await completeScreening(page, QUICK_COUNT);
  await expect(page.locator('#resultContainer')).toBeVisible();

  await page.locator('.restart-btn').click();

  await expect(page.locator('#selectorPage')).toBeVisible();
  await expect(page.locator('#testPage')).toBeHidden();
});

test('"choose another format" returns to the selector from the test', async ({ page }) => {
  await page.locator('.selector-card').first().click();
  await expect(page.locator('#testPage')).toBeVisible();

  await page.getByText('← Выбрать другой формат').click();

  await expect(page.locator('#selectorPage')).toBeVisible();
  await expect(page.locator('#testPage')).toBeHidden();
});
