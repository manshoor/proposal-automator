// Deterministic credentials for the e2e test user. Used by globalSetup
// to ensure the user exists, and by individual tests to log in.
//
// The password is intentionally non-secret — this is a local-only test fixture
// and should never be deployed.

export const TEST_USER = {
  email: 'e2e-playwright@local.dev',
  password: 'PlaywrightTest1234!',
  fullName: 'E2E Playwright',
};
