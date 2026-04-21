# Dashboard RSC Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Next.js dashboard from fully client-rendered pages to server-rendered data fetching with client interactive islands, using HttpOnly cookies for auth.

**Architecture:** Backend auth middleware gains a cookie fallback (Bearer still works for the Chrome extension). Dashboard login sets HttpOnly `accessToken` and `refreshToken` cookies. Each dashboard page splits into a server `page.js` (auth check + initial fetch) and a client `<route>-client.js` (state, handlers, modals). Server components fetch the backend via a `serverFetch` helper that forwards the cookie; client components switch to `credentials: 'include'` and drop `localStorage` token handling.

**Tech Stack:** Next.js 14 App Router, Express 4, `cookie-parser`, `jsonwebtoken`, PostgreSQL (unchanged), Docker Compose for dev.

**Spec:** `docs/superpowers/specs/2026-04-16-dashboard-rsc-migration-design.md`

**Project conventions (from `CLAUDE.md` and memory):**
- Run `npm install` **inside the Docker container only** — never on the host.
- Never add `Co-Authored-By:` lines to commits.
- After every code change, smoke test before declaring done.

**No test framework exists.** Verification steps use `curl` (for backend) and browser / `curl --cookie-jar` (for dashboard) in place of automated tests. Treat the `curl` command as the failing test in the TDD pattern: run it first, confirm it fails or returns the current behavior, implement, then run again to confirm the new behavior.

**Standing dev loop:**
```bash
docker compose up -d
# backend on http://localhost:3002
# dashboard on http://localhost:3003
# DB on localhost:5433
```

If the containers are not running, start them before each verification step.

---

## Task 1: Add cookie-parser dependency and cookie helpers

**Files:**
- Modify: `backend/package.json`
- Create: `backend/lib/cookies.js`

- [ ] **Step 1: Baseline check — confirm cookie-parser is NOT installed**

Run: `docker compose exec backend node -e "require('cookie-parser')" 2>&1 || echo "NOT INSTALLED"`

Expected: prints `NOT INSTALLED` (or a "Cannot find module" error).

- [ ] **Step 2: Add `cookie-parser` to `backend/package.json` dependencies**

Locate the `"dependencies"` block and insert `"cookie-parser": "^1.4.7"` alphabetically (after `"cors"`):

```json
    "cors": "^2.8.5",
    "cookie-parser": "^1.4.7",
    "dotenv": "^16.4.0",
```

- [ ] **Step 3: Install the new dependency inside the backend container**

Run: `docker compose exec backend npm install`

Expected: "added N packages" including `cookie-parser`. If the command fails with `EACCES`, run it as root: `docker compose exec -u 0 backend npm install` — then `docker compose exec -u 0 backend chown -R node:node node_modules package-lock.json`.

- [ ] **Step 4: Create `backend/lib/cookies.js`**

```js
const IS_PROD = process.env.NODE_ENV === 'production';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function baseOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) {
    res.cookie('accessToken', accessToken, { ...baseOptions(), maxAge: ACCESS_MAX_AGE_MS });
  }
  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, { ...baseOptions(), maxAge: REFRESH_MAX_AGE_MS });
  }
}

export function clearAuthCookies(res) {
  res.clearCookie('accessToken', baseOptions());
  res.clearCookie('refreshToken', baseOptions());
}
```

- [ ] **Step 5: Syntax check**

Run: `docker compose exec backend node --check lib/cookies.js && echo OK`

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/lib/cookies.js
git commit -m "feat(backend): add cookie-parser dependency and cookie helpers"
```

---

## Task 2: Register cookie-parser middleware in server.js

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Baseline check — confirm cookies are not yet parsed**

Run: `curl -s -b "accessToken=abc123" http://localhost:3002/health`

Expected: returns `{"status":"ok","timestamp":"..."}` but `req.cookies` is `undefined` inside the app (we cannot assert this externally, so this check is informational).

- [ ] **Step 2: Register cookie-parser in `backend/server.js`**

Open `backend/server.js`. Add import alongside the other imports (after the `cors` import):

```js
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join } from 'path';
```

Register the middleware **after** `requestLogger` and **before** `helmet` (order: requestId → requestLogger → cookieParser → helmet → cors → json → rateLimiter):

```js
app.use(requestId);
app.use(requestLogger);
app.use(cookieParser());
app.use(helmet({
```

- [ ] **Step 3: Syntax check**

Run: `docker compose exec backend node --check server.js && echo OK`

Expected: `OK`.

- [ ] **Step 4: Restart the backend container and verify it boots cleanly**

Run: `docker compose restart backend && sleep 3 && docker compose logs backend --tail=20`

Expected: "Server running" log entry. No errors about missing modules.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat(backend): register cookie-parser middleware"
```

---

## Task 3: Auth middleware accepts cookie as fallback

**Files:**
- Modify: `backend/middleware/auth.js`

- [ ] **Step 1: Failing test — cookie-based auth is rejected**

First, log in and capture the access token into a shell variable:

```bash
ACCESS=$(curl -s -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"YOUR_PASSWORD"}' \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["accessToken"])')
echo "Got token: ${ACCESS:0:20}..."
```

If you don't know the password, create a throwaway test user first:
```bash
curl -s -X POST http://localhost:3002/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"rsc-test@example.com","password":"password1234","fullName":"RSC Test"}' \
  | python3 -m json.tool
# then grab accessToken from the response
```

Now hit a protected endpoint using **only a cookie** (no Bearer):

```bash
curl -s -i -b "accessToken=$ACCESS" http://localhost:3002/api/v1/auth/me
```

Expected: `HTTP/1.1 401` with body `"Authentication required..."`. This is the current broken behavior — cookie auth is not yet accepted.

- [ ] **Step 2: Update `backend/middleware/auth.js` to accept cookies**

Replace the entire `authenticate` function:

```js
export function authenticate(req, _res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw new AuthenticationError('Authentication required. Send Bearer token in Authorization header or accessToken cookie.');
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = extractUser(payload);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AuthenticationError('Access token expired. Please refresh.');
    }
    throw new AuthenticationError('Invalid access token.');
  }

  next();
}
```

- [ ] **Step 3: Syntax check**

Run: `docker compose exec backend node --check middleware/auth.js && echo OK`

Expected: `OK`.

- [ ] **Step 4: Restart and verify the same curl now succeeds**

```bash
docker compose restart backend && sleep 3
curl -s -i -b "accessToken=$ACCESS" http://localhost:3002/api/v1/auth/me
```

Expected: `HTTP/1.1 200` with JSON body `{"id":...,"email":"...","role":"..."}`.

- [ ] **Step 5: Confirm Bearer still works (regression check)**

```bash
curl -s -i -H "Authorization: Bearer $ACCESS" http://localhost:3002/api/v1/auth/me
```

Expected: `HTTP/1.1 200` with same JSON body. Extension compatibility preserved.

- [ ] **Step 6: Commit**

```bash
git add backend/middleware/auth.js
git commit -m "feat(backend): accept cookie as fallback for authenticate middleware"
```

---

## Task 4: Login / refresh / logout set and clear cookies

**Files:**
- Modify: `backend/api/auth.js`

- [ ] **Step 1: Failing test — login does not set cookies**

```bash
curl -s -i -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rsc-test@example.com","password":"password1234"}' \
  | grep -i 'set-cookie' || echo "NO SET-COOKIE HEADER"
```

Expected: prints `NO SET-COOKIE HEADER`.

- [ ] **Step 2: Update `backend/api/auth.js`**

Replace the entire file:

```js
import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limiter.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, refreshSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';
import { setAuthCookies, clearAuthCookies } from '../lib/cookies.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  setAuthCookies(res, result);
  res.status(201).json(result);
}));

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  setAuthCookies(res, result);
  res.json(result);
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  // Accept refresh token from body (extension) or cookie (dashboard).
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  if (!token) {
    res.status(400).json({ error: 'refreshToken is required (body or cookie)' });
    return;
  }
  const result = await authService.refresh(token);
  setAuthCookies(res, result);
  res.json(result);
}));

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  clearAuthCookies(res);
  res.json({ success: true });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
  });
}));

export default router;
```

- [ ] **Step 3: Syntax check**

Run: `docker compose exec backend node --check api/auth.js && echo OK`

Expected: `OK`.

- [ ] **Step 4: Restart and confirm login now sets cookies**

```bash
docker compose restart backend && sleep 3
curl -s -i -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rsc-test@example.com","password":"password1234"}' \
  | grep -i 'set-cookie'
```

Expected: two `Set-Cookie` headers, one for `accessToken`, one for `refreshToken`, both with `HttpOnly` and `SameSite=Lax`.

- [ ] **Step 5: Verify refresh via cookie only**

```bash
rm -f /tmp/rsc-cookies.txt
curl -s -c /tmp/rsc-cookies.txt -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rsc-test@example.com","password":"password1234"}' > /dev/null

curl -s -i -b /tmp/rsc-cookies.txt -c /tmp/rsc-cookies.txt \
  -X POST http://localhost:3002/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Expected: `HTTP/1.1 200`, body contains new `accessToken`/`refreshToken`, and response includes two new `Set-Cookie` headers.

- [ ] **Step 6: Verify logout clears cookies**

```bash
curl -s -i -b /tmp/rsc-cookies.txt -X POST http://localhost:3002/api/v1/auth/logout
```

Expected: `HTTP/1.1 200`. Response includes `Set-Cookie: accessToken=; ...` and `Set-Cookie: refreshToken=; ...` with `Expires=Thu, 01 Jan 1970` (cleared).

- [ ] **Step 7: Commit**

```bash
git add backend/api/auth.js
git commit -m "feat(backend): login/refresh/logout manage HttpOnly auth cookies"
```

---

## Task 5: Dashboard `lib/api.js` drops localStorage, uses credentials:'include'

**Files:**
- Modify: `dashboard/lib/api.js`

- [ ] **Step 1: Failing test — confirm current api.js reads localStorage**

Run: `grep -n "localStorage" /Users/manshoor/development/projects/office/chromePlugin/dashboard/lib/api.js`

Expected: multiple hits on `localStorage.getItem('accessToken')`, `localStorage.setItem(...)`. This is the current behavior we're replacing.

- [ ] **Step 2: Replace `dashboard/lib/api.js` entirely**

```js
const BASE = '/api/v1';

async function refreshAccessToken() {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function request(method, path, body, options = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal: options.signal,
  };
  if (body) opts.body = JSON.stringify(body);

  let res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(`${BASE}${path}`, opts);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(text);
  }
  return res.json();
}

async function upload(path, formData, options = {}) {
  const opts = {
    method: 'POST',
    body: formData,
    credentials: 'include',
    signal: options.signal,
  };

  let res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(`${BASE}${path}`, opts);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(text);
  }
  return res.json();
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  del: (path, options) => request('DELETE', path, undefined, options),
  upload: (path, formData, options) => upload(path, formData, options),
};
```

- [ ] **Step 3: Verify no localStorage references remain**

Run: `grep -n "localStorage" /Users/manshoor/development/projects/office/chromePlugin/dashboard/lib/api.js || echo "CLEAN"`

Expected: `CLEAN`.

- [ ] **Step 4: Commit**

```bash
git add dashboard/lib/api.js
git commit -m "feat(dashboard): api.js uses cookies instead of localStorage"
```

---

## Task 6: Create server-side `serverFetch` and `readSession` helpers

**Files:**
- Create: `dashboard/lib/server-api.js`
- Create: `dashboard/lib/session.js`

- [ ] **Step 1: Create `dashboard/lib/server-api.js`**

```js
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.API_URL || 'http://backend:3000';

/**
 * Server-side fetch that forwards the incoming request's cookies to the backend.
 * On 401, redirects to /login. On other errors, throws (caught by app/error.js).
 *
 * Usage in a server component:
 *   const proposals = await serverFetch('/proposals?limit=25');
 */
export async function serverFetch(path, options = {}) {
  const cookieStore = cookies();
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });

  if (res.status === 401) {
    redirect('/login');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Backend returned ${res.status}: ${text}`);
  }

  return res.json();
}
```

- [ ] **Step 2: Create `dashboard/lib/session.js`**

```js
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverFetch } from './server-api';

/**
 * Returns the authenticated user, or null if no auth cookie is present.
 * For pages that require auth, prefer requireSession() which redirects.
 */
export async function readSession() {
  const cookieStore = cookies();
  if (!cookieStore.get('accessToken')) return null;

  try {
    return await serverFetch('/auth/me');
  } catch {
    return null;
  }
}

/**
 * Same as readSession() but redirects to /login if no session.
 * Use in protected server components.
 */
export async function requireSession() {
  const session = await readSession();
  if (!session) redirect('/login');
  return session;
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/lib/server-api.js dashboard/lib/session.js
git commit -m "feat(dashboard): add serverFetch and session helpers for RSC"
```

---

## Task 7: Root layout becomes server component; simplify AuthLayout and Sidebar

**Files:**
- Modify: `dashboard/app/layout.js`
- Modify: `dashboard/components/AuthLayout.js`
- Modify: `dashboard/components/Sidebar.js`
- Modify: `dashboard/app/login/page.js`
- Modify: `dashboard/app/register/page.js`

- [ ] **Step 1: Update `dashboard/app/layout.js` to read session server-side**

Replace entirely:

```js
import { Inter } from 'next/font/google';
import './globals.css';
import AuthLayout from '../components/AuthLayout';
import { readSession } from '../lib/session';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'Upwork Dashboard',
  description: 'Manage proposals, profile, and templates',
};

export default async function RootLayout({ children }) {
  const session = await readSession();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthLayout session={session}>{children}</AuthLayout>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Replace `dashboard/components/AuthLayout.js`**

The client-side auth check and "Loading..." placeholder is no longer needed — server components already redirect on missing cookies. AuthLayout now just renders the chrome (mobile header, sidebar, main content) and passes `session` down to Sidebar.

```js
'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

const AUTH_PAGES = ['/login', '/register'];

export default function AuthLayout({ children, session }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PAGES.includes(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (isAuthPage) return children;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="text-gray-600 hover:text-gray-900">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span className="font-semibold text-gray-900 text-sm">Proposal Automator</span>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} session={session} />

      <main className="lg:ml-64 pt-14 lg:pt-0 p-4 sm:p-6 lg:p-8 min-h-screen">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Update `dashboard/components/Sidebar.js` to accept session as a prop**

Open the file. Remove the `useEffect` block that fetches `/auth/me` (lines ~40-47) and change the signature:

```js
export default function Sidebar({ mobileOpen, onClose, session }) {
  const pathname = usePathname();
  const userEmail = session?.email || '';
  const userRole = session?.role || '';
```

Also remove the now-unused `useState` for `userEmail`/`userRole` and the `useEffect` import if unused. Keep the logout handler (still uses `api.post` — now cookie-based).

The logout handler was previously:
```js
onClick={async () => {
  try { await api.post('/auth/logout', {}); } catch { /* best-effort */ }
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login';
}}
```

Replace with (remove the localStorage lines — cookies are cleared by the server):

```js
onClick={async () => {
  try { await api.post('/auth/logout', {}); } catch { /* best-effort */ }
  window.location.href = '/login';
}}
```

- [ ] **Step 4: Update `dashboard/app/login/page.js` — remove localStorage writes**

Open the file, find the `fetch` call that handles login success. Replace the block that stores tokens in localStorage:

```js
localStorage.setItem('accessToken', data.accessToken);
localStorage.setItem('refreshToken', data.refreshToken);
```

With:

```js
// Tokens are set as HttpOnly cookies by the server. No client storage needed.
```

Ensure the fetch call sends `credentials: 'include'`:

```js
const res = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email, password }),
});
```

- [ ] **Step 5: Update `dashboard/app/register/page.js` — same treatment**

Apply the same changes as Step 4 to the register page: add `credentials: 'include'` to the fetch, remove any `localStorage.setItem('accessToken', ...)` / `localStorage.setItem('refreshToken', ...)` lines.

- [ ] **Step 6: Verify no auth-token localStorage references remain in dashboard**

Run: `grep -rn "localStorage.*\\(accessToken\\|refreshToken\\)" /Users/manshoor/development/projects/office/chromePlugin/dashboard --include="*.js" || echo "CLEAN"`

Expected: `CLEAN`.

- [ ] **Step 7: Browser smoke test**

1. Open an incognito window → `http://localhost:3003/login`.
2. Log in.
3. DevTools → Application → Cookies → `http://localhost:3003`: confirm `accessToken` and `refreshToken` both present, both `HttpOnly`, `SameSite=Lax`.
4. DevTools → Application → Local Storage: confirm `accessToken` / `refreshToken` are NOT present.
5. Navigate to any page (e.g. `/profile`) — page loads, sidebar shows your email.
6. Click Logout → redirected to `/login`, cookies cleared (check DevTools).

Expected: all six checks pass.

- [ ] **Step 8: Commit**

```bash
git add dashboard/app/layout.js dashboard/components/AuthLayout.js dashboard/components/Sidebar.js dashboard/app/login/page.js dashboard/app/register/page.js
git commit -m "feat(dashboard): root layout reads session server-side; drop localStorage tokens"
```

---

## Task 8: Convert `/` (home) to RSC

**Files:**
- Modify: `dashboard/app/page.js`
- Create: `dashboard/app/home-client.js`

- [ ] **Step 1: Baseline — confirm `/` is currently fully client-rendered**

Open a logged-in incognito tab at `http://localhost:3003/` and run in terminal:

```bash
curl -s --cookie-jar /tmp/rsc-cookies.txt -X POST http://localhost:3002/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rsc-test@example.com","password":"password1234"}' > /dev/null
curl -s --cookie /tmp/rsc-cookies.txt http://localhost:3003/ | grep -oE "(Total proposals|hired|Pipeline)" | head -5
```

Expected: may be empty or only show skeleton text (client-rendered page has no data in initial HTML).

- [ ] **Step 2: Read current `app/page.js`**

Before editing, open the file to know exactly what data it fetches and what UI it renders. It fetches three endpoints: `/analytics`, `/proposals?limit=5&sort=created_at&order=desc`, `/analytics/insights`.

- [ ] **Step 3: Create `dashboard/app/home-client.js`**

Move the full existing client component code (everything currently in `app/page.js` below the `'use client'` directive) into this new file. Change the default export name to `HomeClient` and modify its signature to receive data as props:

```js
'use client';

import Link from 'next/link';
// ... other imports from the original page.js ...

export default function HomeClient({ analytics, proposals, insights }) {
  // Replace the useState+useEffect block with:
  // const [analytics] = useState(initialAnalytics); etc — OR just use the props directly.
  // Remove the useEffect that calls Promise.all([...]). Remove the loading skeleton branch.
  // The rest of the JSX stays identical.
}
```

Concretely: delete the `useState`/`useEffect`/`Promise.all` block at the top of the original component, and rename every reference to `analytics`, `proposals`, `insights` so it reads from the props instead. The skeleton/loading state can be deleted entirely (RSC handles loading via Suspense if needed).

- [ ] **Step 4: Replace `dashboard/app/page.js` with a server component**

```js
import { serverFetch } from '../lib/server-api';
import HomeClient from './home-client';

export default async function HomePage() {
  const [analytics, proposals, insights] = await Promise.all([
    serverFetch('/analytics').catch(() => null),
    serverFetch('/proposals?limit=5&sort=created_at&order=desc').catch(() => []),
    serverFetch('/analytics/insights').catch(() => []),
  ]);

  return <HomeClient analytics={analytics} proposals={proposals} insights={insights} />;
}
```

Note: there is no `'use client'` directive at the top. This is a server component by default.

- [ ] **Step 5: Verify home page still renders and now has data in initial HTML**

Restart dashboard (Next.js usually hot-reloads, but for the file move it's safer):
```bash
docker compose restart dashboard && sleep 5
```

Browser test:
1. Reload `http://localhost:3003/` while logged in.
2. Confirm all cards (Total proposals, Hired, etc.) render as before.

Terminal test:
```bash
curl -s --cookie /tmp/rsc-cookies.txt http://localhost:3003/ | grep -oE "(Total proposals|Pipeline|Recent activity)" | head -5
```

Expected: prints those strings (they're now in the server-rendered HTML, not just in the hydrated bundle). If the cookie expired, refresh via Task 4, Step 5's pattern.

- [ ] **Step 6: Commit**

```bash
git add dashboard/app/page.js dashboard/app/home-client.js
git commit -m "feat(dashboard): convert home page to server component"
```

---

## Task 9: Convert `/analytics` to RSC

**Files:**
- Modify: `dashboard/app/analytics/page.js`
- Create: `dashboard/app/analytics/analytics-client.js`

- [ ] **Step 1: Create `dashboard/app/analytics/analytics-client.js`**

Move the current contents of `app/analytics/page.js` here (starting with `'use client'`). Rename the default export component to `AnalyticsClient`. Change the signature:

```js
export default function AnalyticsClient({ initialData, initialInsights }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);  // always false now, or remove entirely
  const [insights, setInsights] = useState(initialInsights);
  // Remove the useEffect that does Promise.all on mount.
  // Keep toggleInsight, analyzePatterns, fetchInsights — they mutate and hit the API client-side.
  // Keep the loading=true skeleton branch only if we want to show it during router.refresh(); simpler to delete.
}
```

Delete the early-return skeleton (since `loading` starts `false`) OR keep it guarded by a separate `analyzing` / `refreshing` flag if needed.

- [ ] **Step 2: Replace `dashboard/app/analytics/page.js`**

```js
import { serverFetch } from '../../lib/server-api';
import AnalyticsClient from './analytics-client';

export default async function AnalyticsPage() {
  const [data, insights] = await Promise.all([
    serverFetch('/analytics').catch(() => null),
    serverFetch('/analytics/insights').catch(() => []),
  ]);

  return <AnalyticsClient initialData={data} initialInsights={insights} />;
}
```

- [ ] **Step 3: Browser verify**

Reload `/analytics` while logged in. All stat cards, insights list, and Recharts visualizations should render. The dynamic `<Charts>` component (imported via `next/dynamic`) still works because it's imported inside `analytics-client.js` (a client component).

Terminal verify:
```bash
curl -s --cookie /tmp/rsc-cookies.txt http://localhost:3003/analytics | grep -oE "Win rate|Total proposals|Insights" | head -3
```

Expected: strings appear in initial HTML.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/analytics/page.js dashboard/app/analytics/analytics-client.js
git commit -m "feat(dashboard): convert analytics page to server component"
```

---

## Task 10: Convert `/proposals` to RSC

**Files:**
- Modify: `dashboard/app/proposals/page.js`
- Create: `dashboard/app/proposals/proposals-client.js`

- [ ] **Step 1: Create `dashboard/app/proposals/proposals-client.js`**

Move the entire current `app/proposals/page.js` contents (including the `Row` sub-component) into this new file. Rename the default export to `ProposalsClient`. Change the signature:

```js
export default function ProposalsClient({ initialProposals }) {
  const [proposals, setProposals] = useState(initialProposals);
  const [loading, setLoading] = useState(false); // no longer needed
  const [hasMore, setHasMore] = useState(initialProposals.length === PAGE_SIZE);
  // ... rest unchanged: filter, search, expandedId, details, toast, loadMore, etc.
  // Remove the useEffect that fetches the first page on mount.
  // Remove the `if (loading) return <skeleton />;` branch — loading always starts false.
}
```

- [ ] **Step 2: Replace `dashboard/app/proposals/page.js`**

```js
import { serverFetch } from '../../lib/server-api';
import ProposalsClient from './proposals-client';

const PAGE_SIZE = 25;

export default async function ProposalsPage() {
  const proposals = await serverFetch(`/proposals?limit=${PAGE_SIZE}&offset=0&sort=created_at&order=desc`)
    .catch(() => []);
  return <ProposalsClient initialProposals={Array.isArray(proposals) ? proposals : []} />;
}
```

- [ ] **Step 3: Browser verify**

Reload `/proposals`. Table rows should appear immediately (no skeleton flash). Filter dropdown, search, row expand, Load More button should all still work.

Terminal verify:
```bash
curl -s --cookie /tmp/rsc-cookies.txt http://localhost:3003/proposals | grep -c '<tr'
```

Expected: count > 1 (rows are in initial HTML, not just a placeholder).

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/proposals/page.js dashboard/app/proposals/proposals-client.js
git commit -m "feat(dashboard): convert proposals page to server component"
```

---

## Task 11: Convert `/profile` to RSC

**Files:**
- Modify: `dashboard/app/profile/page.js`
- Create: `dashboard/app/profile/profile-client.js`

- [ ] **Step 1: Create `dashboard/app/profile/profile-client.js`**

Move the entire contents of `app/profile/page.js` (including the `HookGenerator` sub-component) into this new file. Rename default export to `ProfileClient`.

```js
export default function ProfileClient({ initialProfile }) {
  // Replace the useState init that currently fetches profile on mount
  // with: const [form, setForm] = useState(initialProfile || defaults);
  // Remove the useEffect that fetches `/profile`.
  // Keep the save, parseResume, analyze, generate handlers unchanged (they hit the API client-side).
}
```

Specifically — find the useState init for `form`:
```js
const [form, setForm] = useState({ full_name: '', title: '', summary: '', /* ... */ });
```

Replace with:
```js
const [form, setForm] = useState(initialProfile ? {
  full_name: initialProfile.full_name || '',
  title: initialProfile.title || '',
  summary: initialProfile.summary || '',
  skills: Array.isArray(initialProfile.skills) ? initialProfile.skills.join(', ') : '',
  experience: initialProfile.experience || '',
  portfolio: initialProfile.portfolio || '',
  default_hourly_rate: initialProfile.default_hourly_rate || 50,
} : { full_name: '', title: '', summary: '', skills: '', experience: '', portfolio: '', default_hourly_rate: 50 });
```

Remove the useEffect that calls `api.get('/profile')`. (The profile data now arrives via props.)

- [ ] **Step 2: Replace `dashboard/app/profile/page.js`**

```js
import { serverFetch } from '../../lib/server-api';
import ProfileClient from './profile-client';

export default async function ProfilePage() {
  const profile = await serverFetch('/profile').catch(() => null);
  return <ProfileClient initialProfile={profile} />;
}
```

- [ ] **Step 3: Browser verify**

Reload `/profile`. Form fields should show current values on first paint (no flash). Saving should still work (toast appears). Resume upload, analyze, hook generator should all still function.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/profile/page.js dashboard/app/profile/profile-client.js
git commit -m "feat(dashboard): convert profile page to server component"
```

---

## Task 12: Convert `/settings` to RSC

**Files:**
- Modify: `dashboard/app/settings/page.js`
- Create: `dashboard/app/settings/settings-client.js`

- [ ] **Step 1: Create `dashboard/app/settings/settings-client.js`**

Move the current `app/settings/page.js` into this new file. Rename default export to `SettingsClient`. Change signature:

```js
export default function SettingsClient({ initialSettings }) {
  const [locations, setLocations] = useState(initialSettings.locations || []);
  const [thresholds, setThresholds] = useState({
    minSpent: initialSettings.min_spent ?? 1000,
    minHireRate: initialSettings.min_hire_rate ?? 30,
    minReviews: initialSettings.min_reviews ?? 3,
  });
  // ... populate the rest from initialSettings the same way the current useEffect does.
}
```

Translate every state init from the current `useEffect(() => { api.get('/settings').then(data => { ... }) }, [])` block into direct `useState(...)` initializers reading from `initialSettings`. Delete the useEffect. Delete the loading skeleton branch.

- [ ] **Step 2: Replace `dashboard/app/settings/page.js`**

```js
import { serverFetch } from '../../lib/server-api';
import SettingsClient from './settings-client';

export default async function SettingsPage() {
  const settings = await serverFetch('/settings').catch(() => ({}));
  return <SettingsClient initialSettings={settings || {}} />;
}
```

- [ ] **Step 3: Browser verify**

Reload `/settings`. All fields (locations list, thresholds, filters, notification settings, LLM config) should show current values. Saving any section should still work.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/settings/page.js dashboard/app/settings/settings-client.js
git commit -m "feat(dashboard): convert settings page to server component"
```

---

## Task 13: Convert `/projects` to RSC

**Files:**
- Modify: `dashboard/app/projects/page.js`
- Create: `dashboard/app/projects/projects-client.js`

- [ ] **Step 1: Create `dashboard/app/projects/projects-client.js`**

Move contents of `app/projects/page.js` here, rename default export to `ProjectsClient`:

```js
export default function ProjectsClient({ initialProjects }) {
  const [projects, setProjects] = useState(initialProjects);
  // Remove the useEffect that fetches projects.
  // Keep all the other state, handlers, modals.
  // Remove the loading skeleton branch.
}
```

- [ ] **Step 2: Replace `dashboard/app/projects/page.js`**

```js
import { serverFetch } from '../../lib/server-api';
import ProjectsClient from './projects-client';

export default async function ProjectsPage() {
  const projects = await serverFetch('/projects').catch(() => []);
  return <ProjectsClient initialProjects={Array.isArray(projects) ? projects : []} />;
}
```

- [ ] **Step 3: Browser verify**

Reload `/projects`. Project grid appears immediately. Create, edit, delete, enhance, screenshot manager, file import should all still work.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/projects/page.js dashboard/app/projects/projects-client.js
git commit -m "feat(dashboard): convert projects page to server component"
```

---

## Task 14: Convert `/templates` to RSC

**Files:**
- Modify: `dashboard/app/templates/page.js`
- Create: `dashboard/app/templates/templates-client.js`

- [ ] **Step 1: Create `dashboard/app/templates/templates-client.js`**

Move `app/templates/page.js` contents. Rename export to `TemplatesClient`:

```js
export default function TemplatesClient({ initialTemplates }) {
  const [templates, setTemplates] = useState(initialTemplates);
  // Remove useEffect + fetchTemplates, but keep fetchTemplates as a client refresh function
  // if you want "reload" affordances — for now, we rely on router.refresh() after save/delete.
}
```

After `handleSave` and `handleDelete`, call `router.refresh()` to re-run the server fetch so the list stays in sync. Add the import:

```js
import { useRouter } from 'next/navigation';

// inside the component:
const router = useRouter();
```

Then at the end of each mutating handler:

```js
async function handleSave({ name, content }) {
  if (editorTarget) {
    const updated = await api.put('/templates/' + editorTarget.id, { name, content });
    setTemplates((prev) => prev.map((t) => (t.id === editorTarget.id ? updated : t)));
  } else {
    const created = await api.post('/templates', { name, content });
    setTemplates((prev) => [created, ...prev]);
  }
  closeEditor();
  router.refresh();
}
```

(And similarly in `handleDelete`.)

- [ ] **Step 2: Replace `dashboard/app/templates/page.js`**

```js
import { serverFetch } from '../../lib/server-api';
import TemplatesClient from './templates-client';

export default async function TemplatesPage() {
  const templates = await serverFetch('/templates').catch(() => []);
  return <TemplatesClient initialTemplates={Array.isArray(templates) ? templates : []} />;
}
```

- [ ] **Step 3: Browser verify**

Reload `/templates`. Grid of templates appears immediately. Create, edit, delete flows still work; the modal focus trap from Task #31 is still in effect.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/templates/page.js dashboard/app/templates/templates-client.js
git commit -m "feat(dashboard): convert templates page to server component"
```

---

## Task 15: Convert `/prompts` to RSC

**Files:**
- Modify: `dashboard/app/prompts/page.js`
- Create: `dashboard/app/prompts/prompts-client.js`

- [ ] **Step 1: Create `dashboard/app/prompts/prompts-client.js`**

Move `app/prompts/page.js` contents. Rename export to `PromptsClient`. Initialize state from props:

```js
export default function PromptsClient({ initialPrompts }) {
  const [prompts, setPrompts] = useState(initialPrompts);
  // Remove useEffect.
}
```

- [ ] **Step 2: Replace `dashboard/app/prompts/page.js`**

```js
import { serverFetch } from '../../lib/server-api';
import PromptsClient from './prompts-client';

export default async function PromptsPage() {
  const prompts = await serverFetch('/prompts').catch(() => []);
  return <PromptsClient initialPrompts={Array.isArray(prompts) ? prompts : []} />;
}
```

- [ ] **Step 3: Browser verify**

Reload `/prompts`. Prompt list appears immediately; editor, save, delete still work.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/prompts/page.js dashboard/app/prompts/prompts-client.js
git commit -m "feat(dashboard): convert prompts page to server component"
```

---

## Task 16: Convert `/admin/users` to RSC

**Files:**
- Modify: `dashboard/app/admin/users/page.js`
- Create: `dashboard/app/admin/users/users-client.js`

- [ ] **Step 1: Create `dashboard/app/admin/users/users-client.js`**

Move `app/admin/users/page.js` contents. Rename export to `UsersClient`:

```js
export default function UsersClient({ initialUsers }) {
  const [users, setUsers] = useState(initialUsers);
  // Remove useEffect on mount.
}
```

- [ ] **Step 2: Replace `dashboard/app/admin/users/page.js`**

```js
import { serverFetch } from '../../../lib/server-api';
import UsersClient from './users-client';

export default async function AdminUsersPage() {
  const users = await serverFetch('/admin/users').catch(() => []);
  return <UsersClient initialUsers={Array.isArray(users) ? users : []} />;
}
```

- [ ] **Step 3: Browser verify** (requires an admin account)

Log in as an admin (set `role=admin` in the DB if needed: `docker compose exec db psql -U postgres -d upwork -c "UPDATE users SET role='admin' WHERE email='rsc-test@example.com';"`). Navigate to `/admin/users`. User list appears immediately. CRUD actions still work.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/admin/users/page.js dashboard/app/admin/users/users-client.js
git commit -m "feat(dashboard): convert admin users page to server component"
```

---

## Task 17: Convert `/admin/prompts` to RSC

**Files:**
- Modify: `dashboard/app/admin/prompts/page.js`
- Create: `dashboard/app/admin/prompts/admin-prompts-client.js`

- [ ] **Step 1: Create `dashboard/app/admin/prompts/admin-prompts-client.js`**

Move `app/admin/prompts/page.js` contents. Rename export to `AdminPromptsClient`:

```js
export default function AdminPromptsClient({ initialPrompts }) {
  const [prompts, setPrompts] = useState(initialPrompts);
  // Remove useEffect on mount.
}
```

- [ ] **Step 2: Replace `dashboard/app/admin/prompts/page.js`**

```js
import { serverFetch } from '../../../lib/server-api';
import AdminPromptsClient from './admin-prompts-client';

export default async function AdminPromptsPage() {
  const prompts = await serverFetch('/admin/prompts').catch(() => []);
  return <AdminPromptsClient initialPrompts={Array.isArray(prompts) ? prompts : []} />;
}
```

- [ ] **Step 3: Browser verify** (admin)

Log in as an admin, open `/admin/prompts`. Master prompts list appears immediately. Create / edit / delete still work.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/admin/prompts/page.js dashboard/app/admin/prompts/admin-prompts-client.js
git commit -m "feat(dashboard): convert admin prompts page to server component"
```

---

## Task 18: End-to-end verification sweep

- [ ] **Step 1: Confirm extension path still works (Bearer)**

The Chrome extension uses `Authorization: Bearer` — unaffected by our changes, but verify once to be sure.

```bash
# From Task 3 Step 5, using Bearer auth
curl -s -H "Authorization: Bearer $ACCESS" http://localhost:3002/api/v1/auth/me | python3 -m json.tool
```

Expected: `200`, correct user JSON.

- [ ] **Step 2: Confirm both cookies and Bearer can be used simultaneously**

```bash
# Dashboard: cookie only
curl -s -b /tmp/rsc-cookies.txt http://localhost:3002/api/v1/proposals?limit=1 | head -c 200
echo ""

# Extension: Bearer only
curl -s -H "Authorization: Bearer $ACCESS" http://localhost:3002/api/v1/proposals?limit=1 | head -c 200
```

Expected: both return proposal JSON.

- [ ] **Step 3: Visit every converted page while logged in and verify initial HTML contains data**

For each of `/`, `/analytics`, `/proposals`, `/profile`, `/settings`, `/projects`, `/templates`, `/prompts`, `/admin/users`, `/admin/prompts`:

1. Visit the page in the browser.
2. View Source (Ctrl+U).
3. Confirm the page-specific content appears in the HTML (not just a loading shell).

For `/admin/*` pages you'll need the admin account set up in Task 16 Step 3.

- [ ] **Step 4: Verify JS-disabled still shows initial data**

In DevTools → Settings → Debugger: "Disable JavaScript". Reload `/proposals`. The proposal rows should still appear (server-rendered). Re-enable JS.

- [ ] **Step 5: Verify cookie expiry forces re-login**

In DevTools → Application → Cookies → delete both `accessToken` and `refreshToken`. Refresh the page. You should be redirected to `/login`.

- [ ] **Step 6: Verify auto-refresh on expired access token**

1. Log in fresh.
2. In DevTools → Application → Cookies → edit the `accessToken` value to something invalid (e.g. `broken`) while leaving `refreshToken` intact.
3. Trigger a client-side mutation (e.g. change a proposal status). The request 401s; `api.js` calls `/auth/refresh` which uses the still-valid `refreshToken` cookie and gets new cookies; the original request is retried.
4. Confirm the mutation succeeds without the user noticing.

Expected: action completes, Toast shows success.

- [ ] **Step 7: Confirm extension still generates proposals**

Load an Upwork job page with the extension → click "Generate Proposal" → confirm a proposal is returned. This proves `Authorization: Bearer` still works end-to-end.

- [ ] **Step 8: Final commit if any fixes were made during verification**

If you had to fix anything while running verifications, commit it:

```bash
git status
# if clean, skip this step
git add -A
git commit -m "fix: issues discovered during RSC migration smoke test"
```
