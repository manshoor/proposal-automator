// Authenticated dashboard pages render without redirecting to /login.
//
// storageState is loaded automatically by the chromium-authed project
// (see playwright.config.js). The setup project authenticates once via API.

import { test, expect } from '@playwright/test';

test.describe('Authenticated pages render without error', () => {
  test('home / dashboard renders for a logged-in user', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('/insights renders the Conversion Funnel card', async ({ page }) => {
    await page.goto('/insights');
    await expect(page).not.toHaveURL(/\/login$/);
    // Funnel card heading from Phase 6 — present even with empty data.
    await expect(page.getByRole('heading', { name: /conversion funnel/i })).toBeVisible();
  });

  test('/profile-coach renders the analyze trigger', async ({ page }) => {
    await page.goto('/profile-coach');
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: /analyze/i }).first()).toBeVisible();
  });

  test('/proposals renders the proposals table or empty state', async ({ page }) => {
    await page.goto('/proposals');
    await expect(page).not.toHaveURL(/\/login$/);
    const tableOrEmpty = page.locator('table').or(page.getByText(/no proposals yet/i));
    await expect(tableOrEmpty.first()).toBeVisible();
  });
});
