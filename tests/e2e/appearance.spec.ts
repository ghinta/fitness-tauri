import { expect, test } from '@playwright/test';

test('persists appearance and keeps dashboard controls within the viewport', async ({
  page,
}) => {
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Training A' })).toBeVisible();
  await page.getByRole('button', { name: /Darstellung: Automatisch/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /Darstellung: Hell/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const navigation = await page.getByRole('navigation').boundingBox();
  expect(navigation).not.toBeNull();
  expect(navigation!.x).toBeGreaterThanOrEqual(0);
  expect(navigation!.x + navigation!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
