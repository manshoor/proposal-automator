// @ts-nocheck — TODO: tighten types in a follow-up iter
// @ts-check
import { defineConfig, devices } from '@playwright/test';

const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3003';
const E2E_API_BASE = process.env.E2E_API_BASE || 'http://localhost:3002';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  globalSetup: './e2e/global-setup.js',

  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Setup project — signs in once via API and saves storageState. The auth
    // rate limiter (10 attempts / 15 min) means we can't drive the form in
    // every test; save once and reuse.
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    // Auth-flow tests — drive the login form themselves; no storageState.
    {
      name: 'chromium-auth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /auth\.spec\.js/,
    },
    // All other tests — load the saved storageState so they're already signed in.
    {
      name: 'chromium-authed',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.spec\.js|auth\.setup\.js/,
    },
  ],

  // Don't auto-spawn the dev server — assume the docker-compose stack is
  // already running. The user can start it via `make dev` or
  // `docker compose up`. Reasoning: the backend + db + redis are all
  // required and managed by compose; reproducing that here would duplicate
  // the existing infra.
});

// Re-exported so tests can read the same values.
export const E2E = { BASE_URL: E2E_BASE_URL, API_BASE: E2E_API_BASE };