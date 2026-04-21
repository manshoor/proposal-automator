# Dashboard RSC Migration — Design

## Context

The Next.js dashboard has every page marked `'use client'`. This was flagged in the 35-item code review (item #10) as a missed RSC opportunity: all pages are client-rendered, data fetching happens after hydration, and the dashboard ships more client JS than necessary.

The root blocker is authentication: JWTs live in `localStorage`, accessible only to client code. Server components cannot read `localStorage` — they can read cookies via `next/headers`. Migrating the dashboard to server-rendered data fetching therefore requires moving dashboard auth to HttpOnly cookies, which *also* resolves review item #1.1 (JWT-in-localStorage is XSS-exposed).

The Chrome extension uses a separate auth path (`Authorization: Bearer`) and must keep working unchanged.

**Outcome:** all 10 authed dashboard pages fetch their initial data server-side via cookie auth, with interactive pieces as client islands. Extension untouched. JWTs no longer readable by JS.

## Scope

- **In scope:** 10 authed pages (`/`, `/analytics`, `/proposals`, `/profile`, `/settings`, `/projects`, `/templates`, `/prompts`, `/admin/users`, `/admin/prompts`), the login/register flow, and the auth middleware + cookie plumbing on the backend.
- **Out of scope:** extension changes, route-level caching policies, server actions, TypeScript migration, `/login` and `/register` page refactors beyond what the new auth flow requires.

## Architecture

### Auth: dual-mode (Bearer or cookie)

Backend accepts **either** `Authorization: Bearer` (used by extension) **or** the `accessToken` cookie. On login/refresh, backend sets HttpOnly cookies *and* continues returning tokens in the response body. The extension reads tokens from the body as today. The dashboard's `/login` page stops storing tokens (the cookies the server set are sufficient) and simply redirects on success.

Cookie settings:
- `accessToken` — HttpOnly, Secure (prod only), SameSite=Lax, Path=/, 15 min
- `refreshToken` — HttpOnly, Secure (prod only), SameSite=Lax, Path=/, 7 days

### Page structure

Each converted page becomes two files:

```
app/<route>/
  page.js            — server component: reads cookie, fetches data, passes as props
  <route>-client.js  — client component ('use client'): state, handlers, modals, charts
```

Data fetching:
- Server components use a new `lib/server-api.js` helper that reads the cookie via `next/headers`, forwards it to the backend, and returns parsed JSON. On 401, it calls `redirect('/login')`.
- Client components keep using `lib/api.js`, which switches to `credentials: 'include'` (cookie auto-sent) and stops reading `localStorage`.

Mutation flow (unchanged from current UX):
1. Client handler calls `api.post(...)` → cookie travels automatically.
2. Backend responds.
3. Client updates local state and/or calls `router.refresh()` to re-run the server component.

### Single source of truth

Server components never query PostgreSQL directly. All data access goes through the existing backend HTTP API. This preserves the current auth+validation layer and keeps the dashboard decoupled from the DB schema.

## Components & files

**New files:**
```
backend/lib/cookies.js                — setAuthCookies / clearAuthCookies helpers
dashboard/lib/server-api.js           — serverFetch() using next/headers cookie
dashboard/lib/session.js              — readSession() server helper (current user)
dashboard/app/<route>/<route>-client.js — one per converted page (10 files)
```

**Modified files:**
```
backend/package.json                  — add cookie-parser
backend/server.js                     — register cookie-parser middleware
backend/middleware/auth.js            — accept cookie as fallback
backend/api/auth.js                   — login/refresh/logout manage cookies
dashboard/lib/api.js                  — drop localStorage + Authorization, use credentials:'include'
dashboard/components/AuthLayout.js    — simplify (server-side auth already done upstream)
dashboard/components/Sidebar.js       — receives user as prop from server layout (no JWT decode)
dashboard/app/layout.js               — becomes server component, reads cookie, passes user down
dashboard/app/<route>/page.js         — rewritten as server component (10 files)
dashboard/app/login/page.js           — login response no longer stores tokens in localStorage
```

### Page-by-page conversion notes

| Page | Server fetches | Client island |
|---|---|---|
| `/` | `/analytics`, `/proposals?limit=5`, `/analytics/insights` | — (static display only) |
| `/analytics` | `/analytics`, `/analytics/insights` | Recharts, insight toggle, "Analyze patterns" button |
| `/proposals` | First page of proposals (25, matching current PAGE_SIZE) | Filters, search, row expansion, pagination, toast |
| `/profile` | Current profile | Form, hook generator, resume upload |
| `/settings` | Current settings | Form, LLM config, toggles |
| `/projects` | Project list | Grid, modal, enhance flow, screenshot manager |
| `/templates` | Templates list | TemplateEditor modal, delete flow |
| `/prompts` | User prompts | Editor |
| `/admin/users` | User list | CRUD modals |
| `/admin/prompts` | Master prompts | CRUD modals |

## Data flow

**Initial load (converted page):**
1. Browser requests `/proposals`.
2. `page.js` (server) reads `accessToken` cookie. If missing → `redirect('/login')`.
3. Calls `serverFetch('/proposals?limit=25&sort=created_at&order=desc')` which forwards the cookie to the backend.
4. Backend authenticates (cookie path), returns JSON.
5. `page.js` renders and passes data as `initialData` prop to `<ProposalsClient>`.
6. HTML streams to browser; client bundle hydrates the interactive component with `initialData` as initial state.

**Client-side mutation / pagination:**
1. User triggers a handler (e.g. `loadMore`).
2. `api.get('/proposals?...&offset=25', { credentials: 'include' })` — cookie sent automatically.
3. Backend responds.
4. Client updates local state (for pagination: append to list) OR calls `router.refresh()` (for mutations that affect server-rendered data).

**Token refresh:**
- Client-side 401 → `api.js` calls `POST /auth/refresh` (cookie-based); backend rotates and sets new cookies; client retries the original call.
- Server-side 401 → `serverFetch` calls `redirect('/login')`.

## Error handling

- Server-side 401: `redirect('/login')` via `serverFetch`.
- Server-side 5xx / network: thrown error caught by the existing `app/error.js` boundary.
- Client-side errors: existing `<Toast>` pattern (unchanged).
- Client-side 401: existing auto-refresh in `api.js` (updated for cookies), falls through to `/login` redirect if refresh fails.

## Backwards compatibility

- **Extension:** zero changes. Continues using `Authorization: Bearer`. Backend accepts either.
- **Existing dashboard sessions:** users with only `localStorage` tokens hit a server component, have no cookie, and are redirected to `/login`. One-time re-login. No data loss — all state is server-side.
- **`/api` legacy alias:** already exists (server.js:58) and is unaffected.

## Verification

End-to-end smoke test sequence (dev):
1. `docker compose build backend dashboard && docker compose up -d`
2. Open `http://localhost:3003/login`, log in as a test user.
3. **Chrome DevTools → Application → Cookies → localhost:3003:** confirm `accessToken` and `refreshToken` are present, marked `HttpOnly`, `SameSite=Lax`.
4. **DevTools → Application → Local Storage:** confirm `accessToken` / `refreshToken` are absent.
5. Navigate to `/proposals` → **View Source** (Ctrl+U): confirm proposal rows appear in raw HTML (not a loading shell).
6. Disable JavaScript → reload `/` → confirm layout + initial data still render (analytics numbers, recent proposals).
7. Re-enable JS → click filters, expand a row, load more → confirm interactivity still works.
8. Reinstall the Chrome extension → confirm proposals can still be generated and sent (proves Bearer path still works).
9. Manually expire the access cookie (edit to past date in DevTools) → refresh a page → confirm seamless refresh via cookie (no visible reauth).
10. Delete both cookies → refresh → confirm redirect to `/login`.

### Rollback

Revert the single commit. Cookie code is additive on the backend; the dashboard changes land as a unit and can be reverted wholesale.
