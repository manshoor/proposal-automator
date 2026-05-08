# Dashboard E2E tests

Browser-driven smoke tests for the dashboard's critical paths. Built on Playwright + Chromium.

## Run locally

The full docker-compose stack (backend + db + redis + dashboard) must be running first:

```sh
docker compose up -d
```

Then on the host (Playwright runs natively for ARM64-friendly Chromium):

```sh
cd dashboard
npm install                        # one-time, brings in @playwright/test
npx playwright install chromium    # one-time, downloads the browser
E2E_BASE_URL=http://localhost:3003 E2E_API_BASE=http://localhost:3002 \
  npm run test:e2e                  # one-shot run
E2E_BASE_URL=http://localhost:3003 E2E_API_BASE=http://localhost:3002 \
  npm run test:e2e:ui               # interactive UI mode
```

## How it's structured

Three Playwright projects, defined in `playwright.config.js`:

1. **`setup`** — runs `auth.setup.js` once. Logs in via API and saves cookies to `e2e/.auth/user.json`.
2. **`chromium-auth`** — runs `auth.spec.js` (drives the login form itself; needs no saved state).
3. **`chromium-authed`** — runs every other spec; loads `e2e/.auth/user.json` so each test starts already signed in.

This avoids hammering the auth rate limiter (10 attempts / 15 min). One login per run, even with hundreds of tests.

## Fixtures

`global-setup.js` registers the deterministic test user (`e2e-playwright@local.dev`) on first run via `POST /api/v1/auth/register`. Tolerates 400/409 (user exists) and 429 (rate-limited).

`test-user.js` exports the credentials for the setup project + auth-flow tests.

## Coverage

| Spec | What it asserts |
|---|---|
| `auth.setup.js` | Logs in once via API; saves storageState |
| `auth.spec.js` | Unauth → /login redirect, login happy path, login error path |
| `pages.spec.js` | Authenticated render of /, /insights (Funnel card), /profile-coach (Analyze button), /proposals |

## Adding tests

- One spec file per feature area. Use `test.describe()` for grouping.
- Tests in any spec file other than `auth.spec.js` automatically start signed-in. Just `await page.goto(...)`.
- Selectors: prefer `getByRole('heading'|'button'|'link', { name: ... })` over CSS classes (resilient to refactors).

## Test artifacts

`test-results/`, `playwright-report/`, `blob-report/`, and `e2e/.auth/` are gitignored. On failure, screenshots, videos, and traces are saved under `test-results/<test-name>-chromium/`.
