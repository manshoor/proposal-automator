import { test, expect } from '@playwright/test';
import { TEST_USER } from './test-user.js';

test.describe('Auth flow', () => {
  test('unauthenticated visit to a protected page redirects to /login', async ({ page }) => {
    await page.goto('/proposals');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });

  test('login with valid credentials redirects to /', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // After login, redirect to / (home). The app shell should render.
    await expect(page).toHaveURL('/', { timeout: 10000 });
  });

  test('login with wrong password shows an error', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill('wrong-password-xyz');
    await page.getByRole('button', { name: /sign in/i }).click();

    // The login form shows an inline error and stays on /login.
    await expect(page.getByText(/login failed|invalid|incorrect|wrong|unauthor/i).first())
      .toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login$/);
  });
});
