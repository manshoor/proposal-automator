// Playwright globalSetup — ensures the deterministic test user exists.
//
// Hits POST /auth/register; ignores 400/409 (user already exists). Tests use
// this account via the credentials in test-user.js.

import { TEST_USER } from './test-user.js';

const E2E_API_BASE = process.env.E2E_API_BASE || 'http://localhost:3002';

export default async function globalSetup() {
  const url = `${E2E_API_BASE}/api/v1/auth/register`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: TEST_USER.password,
        fullName: TEST_USER.fullName,
      }),
    });
    if (res.ok) {
      console.log(`[e2e setup] Created test user ${TEST_USER.email}`);
    } else if (res.status === 400 || res.status === 409) {
      // Already exists — fine.
      console.log(`[e2e setup] Test user ${TEST_USER.email} already exists`);
    } else if (res.status === 429) {
      // Auth rate limit hit (likely from previous repeated test runs). The user
      // almost certainly exists from a prior setup; tests will fail informatively
      // if not. Don't block the run.
      console.log(`[e2e setup] Rate-limited; assuming test user exists from prior setup.`);
    } else {
      const text = await res.text().catch(() => '');
      throw new Error(`Test user setup failed: ${res.status} ${text}`);
    }
  } catch (err) {
    throw new Error(
      `[e2e setup] Could not reach backend at ${E2E_API_BASE}. ` +
      `Is the docker-compose stack running? Original error: ${err.message}`
    );
  }
}
