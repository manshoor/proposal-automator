// Auth setup project — runs once before any test file that depends on it.
// Logs in via the backend API and saves storageState (cookies) so that the
// authenticated test files can skip the login flow entirely.
//
// This avoids hammering the auth rate limiter (10 attempts per 15 min).

import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { TEST_USER } from './test-user.js';

const AUTH_FILE = path.resolve('e2e/.auth/user.json');
const E2E_API_BASE = process.env.E2E_API_BASE || 'http://localhost:3002';
const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3003';

setup('authenticate', async ({ page, request }) => {
  // Login via API.
  const res = await request.post(`${E2E_API_BASE}/api/v1/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  expect(res.ok(), `Login failed (${res.status()})`).toBe(true);

  // Forward Set-Cookie headers into the browser context.
  const setCookieHeaders = res.headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);

  for (const cookieStr of setCookieHeaders) {
    const [pair] = cookieStr.split(';');
    const [name, value] = pair.split('=');
    if (!name || !value) continue;
    await page.context().addCookies([{
      name: name.trim(),
      value: value.trim(),
      url: E2E_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    }]);
  }

  // Persist for downstream tests.
  await page.context().storageState({ path: AUTH_FILE });
});
