import { expect, test } from '@playwright/test';

test('navigates through the application shell', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();

  await page.getByRole('link', { name: 'Verlauf' }).click();
  await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();

  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Einstellungen' }),
  ).toBeVisible();
});
