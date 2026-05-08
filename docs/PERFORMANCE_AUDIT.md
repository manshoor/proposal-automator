# Performance Audit — Upwork Proposal Automator

**Date:** 2026-05-09
**Scope:** Full-stack — Express backend, Next.js 14 RSC dashboard, Chrome MV3 extension
**Methodology:** Three parallel codebase reviews (one per surface), 45 specific findings collected with file:line evidence.

---

## Summary

| Surface | Findings | Highest severity |
|---|---|---|
| Backend | 18 | HIGH (parallelizable LLM loop, missing index on nightly cleanup) |
| Dashboard | 15 | CRITICAL (`cache: 'no-store'` globally disables RSC caching) |
| Extension | 12 | HIGH (4 content scripts duplicate library parsing) |
| **Total** | **45** | |

The codebase is generally well-architected — good async patterns, parameterized SQL, structured logging, BullMQ for heavy LLM work. The performance issues fall into a few clusters:

1. **Sequential awaits where parallelism would help** (backend + dashboard).
2. **Missing or sub-optimal indexes** for queries that already run on indexed-PK paths but filter on secondary columns (backend).
3. **No RSC caching** in the dashboard — every page nav is a full server render + backend call.
4. **Observer thrash** in extension content scripts — MutationObservers without debouncing fire dozens of times during feed scrolls.

The **top-15 fixes** at the end of this document are the highest-ROI items to tackle first.

---

## Backend findings (18)

### DB query patterns (5)

#### B1. [MEDIUM] `SELECT *` returns all ~40 columns when only a few are needed
- **File:** `backend/repositories/proposal.repository.js:50`
- **Evidence:** `SELECT * FROM proposals WHERE id = $1`
- **Impact:** Increases memory + network + serialization. Heavy JSON columns (`vetting_result`, `job_skills`) are always shipped even when caller only needs `id`, `job_title`, `status`.
- **Fix:** Replace with explicit column list per caller.

#### B2. [MEDIUM] `SELECT *` on global templates without LIMIT
- **File:** `backend/repositories/template.repository.js:8`
- **Evidence:** `SELECT * FROM templates ORDER BY created_at DESC` (no LIMIT, no required user filter)
- **Impact:** Loads all templates; payload grows unbounded as users add templates.
- **Fix:** Require userId; add LIMIT in repo as a safety net.

#### B3. [HIGH] Full-table scan in nightly Loom cleanup worker
- **File:** `backend/workers/loom-cleanup.worker.js:23`
- **Evidence:** `SELECT loom_url FROM proposals WHERE loom_url IS NOT NULL` — no index on `loom_url`.
- **Impact:** Runs every 24h. As `proposals` grows past ~10k rows, the seq scan dominates and locks/starves other queries during cleanup.
- **Fix:** Partial index `CREATE INDEX idx_proposals_loom_url ON proposals(loom_url) WHERE loom_url IS NOT NULL`.

#### B4. [MEDIUM] Follow-up expiry update has no helpful index
- **File:** `backend/workers/followup-expiry.worker.js:9`
- **Evidence:** `UPDATE proposal_followups SET status='expired' WHERE status='scheduled' AND scheduled_at < NOW() - INTERVAL '7 days'`
- **Impact:** Existing index `(user_id, status, scheduled_at)` doesn't help — leading column is wrong. Runs every 30 min.
- **Fix:** Add `CREATE INDEX idx_followups_status_scheduled ON proposal_followups(status, scheduled_at)`.

#### B5. [MEDIUM] Banned-phrases lookup unindexed on filter columns
- **File:** `backend/repositories/banned-phrases.repository.js:10-21`
- **Evidence:** `WHERE active = TRUE AND (scope = 'system' OR scope = 'admin' OR (scope = 'user' AND user_id = $1))`
- **Impact:** Called on every proposal generation (hottest path). Full scan currently.
- **Fix:** `CREATE INDEX idx_banned_phrases_active_scope ON banned_phrases(active, scope)`.

### API hot paths (4)

#### B6. [HIGH] Sequential LLM loop in project enhance-all
- **File:** `backend/api/projects.js:51-68`
- **Evidence:** `for (const project of weak) { await callLLM(...) }`
- **Impact:** 5 weak projects × ~20s LLM latency = 100-150s total before the endpoint responds. Locks one HTTP worker the entire time.
- **Fix:** `Promise.all(weak.map(p => callLLM(...)))`. Existing per-user LLM rate limiter already throttles concurrency.

#### B7. [MEDIUM] Bootstrap returns full template/project rows
- **File:** `backend/api/bootstrap.js:21-27`
- **Evidence:** `templateRepo.findAll({}, userId)` returns full rows; client only uses 4 of ~10 columns.
- **Impact:** ~50% larger payload than needed.
- **Fix:** Add explicit column lists (B1 fix covers this transitively).

#### B8. [MEDIUM] Analytics endpoint runs 6 parallel queries every 5 min
- **File:** `backend/services/analytics.service.js:8-90`
- **Evidence:** Cache TTL 300s; on miss, 6 concurrent queries run.
- **Impact:** Cache miss = 6× DB hits. Could grow expensive at scale.
- **Fix:** Extend TTL to 600s or implement event-driven invalidation on proposal create/update.

#### B9. [LOW] No issue — pagination cache key construction is correct
- **File:** `backend/services/proposal.service.js:38`
- **Evidence:** Cache key includes `:${sort}:${order}` — paging keys verified separate.
- **Impact:** None. Listed for completeness.
- **Fix:** None.

### Service layer (3)

#### B10. [HIGH] `generateProposal` chains profile → analysis → prompts sequentially
- **File:** `backend/services/proposal.service.js:222-257`
- **Evidence:** Profile fetch (l. 222), then job analysis (l. 257), then prompt fetch (l. 260). The LLM-driven job analysis is on the critical path and blocks downstream work.
- **Impact:** Adds 10-20s to every proposal generation that could be saved by parallelism.
- **Fix:** `Promise.all([getProfileOrDefault(userId), extractJobAnalysisOrThrow(...)])`.

#### B11. [MEDIUM] `getProfileOrDefault` swallows errors silently
- **File:** `backend/services/profile.service.js:51-57`
- **Evidence:** `catch { return DEFAULT_PROFILE }`
- **Impact:** If DB is down, endpoint returns 200 with empty profile — masks real issues from logs/alerts.
- **Fix:** `catch (err) { logger.warn({err}, 'Profile fetch failed'); return DEFAULT_PROFILE; }`.

#### B12. [MEDIUM] Analytics learn fetches full proposals before in-memory slice
- **File:** `backend/services/analytics.service.js:89-97`
- **Evidence:** `summarize = (list) => list.slice(0, 15).map(...)`. Backing query has no LIMIT.
- **Impact:** For 1000-proposal users, loads all 18 columns × 1000 rows just to keep 15.
- **Fix:** Push the LIMIT 15 into the SQL.

### Middleware + rate limiting (2)

#### B13. [MEDIUM] `globalLimiter` uses in-memory store (not distributed)
- **File:** `backend/middleware/rate-limiter.js:18-26`
- **Evidence:** No `store:` option passed. Defaults to in-memory.
- **Impact:** Multi-instance deploys: each instance has its own counter, so a user can exceed the rate by 2× / N×.
- **Fix:** `store: createStore('global')` (helper already exists, used by auth + LLM limiters).

#### B14. [LOW] Logger correctly configured (JSON in prod, pretty in dev)
- **File:** `backend/lib/logger.js:6-8`
- **Impact:** None — listed for completeness.
- **Fix:** None.

### Connection pools + caching (2)

#### B15. [MEDIUM] pg pool size 20 may bottleneck under traffic
- **File:** `backend/db/pool.js:7-12`
- **Evidence:** `max: 20`, `idleTimeoutMillis: 30000`.
- **Impact:** Backend has ~28 endpoints + BullMQ worker (3 concurrent LLM jobs) + 2 background workers. Concurrent users beyond ~15 will queue.
- **Fix:** Bump to `max: 50`, drop idle timeout to 10s.

#### B16. [MEDIUM] Cache invalidation prefix-deletes all proposal keys on every create
- **File:** `backend/services/proposal.service.js:113-115`
- **Evidence:** `cacheDelPrefix('proposals:' + userId)` on each create. Clears every variant (filter, sort, page).
- **Impact:** Subsequent reads all miss cache. Could be more surgical.
- **Fix:** Only invalidate "newest list" variants; accept eventual consistency on filtered lists.

### Queues (1)

#### B17. [LOW] BullMQ `removeOnComplete: { count: 200 }` retains last 200 jobs in Redis
- **File:** `backend/queues/llm.queue.js:17-22`
- **Impact:** Bounded but stays in Redis indefinitely.
- **Fix:** `{ count: 50, age: 3600 }` — keep 1 hour OR 50 jobs, whichever smaller.

### Hot-path service overhead (1)

#### B18. [MEDIUM] Profile lookup on every proposal generation hits cache or DB
- **File:** `backend/services/proposal.service.js:222-224`
- **Evidence:** Profile cache check on every proposal; cache miss = round-trip.
- **Impact:** Adds 5-50ms baseline. Cache-miss spikes to ~100ms.
- **Fix:** Module-local `Map` cache with 5-min TTL, or pre-warm at auth time.

---

## Dashboard findings (15)

### RSC / Client split (2)

#### D1. [CRITICAL] `cache: 'no-store'` hardcoded on every `serverFetch`
- **File:** `dashboard/lib/server-api.js:24`
- **Evidence:** `cache: 'no-store'` is unconditional.
- **Impact:** Every page navigation re-fetches from backend. RSC HTML caching, CDN caching, and browser caching are all bypassed. Largest single perf win available.
- **Fix:** Thread an optional `revalidate: number` arg through `serverFetch`. Default to `next: { revalidate: 60 }` for read-only endpoints; keep `no-store` for `/auth/me`, `/proposals`, `/follow-ups` (mutation-heavy or per-request).

#### D2. [HIGH] `readSession()` runs in root layout — re-fetched per nav
- **File:** `dashboard/app/layout.js:14`
- **Evidence:** `readSession()` awaited in `RootLayout`; not memoized.
- **Impact:** Every route change refetches the session even though it's stable.
- **Fix:** Wrap in `React.cache(...)` so a single render shares the result across server-component subtrees.

### Data-fetching waterfalls (2)

#### D3. [MEDIUM] Insights page: server fetch + client refetch on demand
- **File:** `dashboard/app/insights/insights-client.js:27-28`
- **Impact:** First render uses server data; recompute click triggers identical client fetch — duplicate work.
- **Fix:** Pass server data to client; only refetch after a mutation (POST /recompute).

#### D4. [MEDIUM] Analytics: similar duplicate-fetch pattern
- **File:** `dashboard/app/analytics/analytics-client.js:28`
- **Impact:** Same as D3.
- **Fix:** Same as D3.

### Bundle + re-renders (4)

#### D5. [HIGH] Recharts imported at top level in `AnalyticsCharts`
- **File:** `dashboard/components/AnalyticsCharts.js:3-6`
- **Evidence:** Direct import of `BarChart`, `PieChart`, `AreaChart`.
- **Impact:** ~70 KB gzipped Recharts ships in main bundle. `analytics-client.js` already wraps via `dynamic()` (good), but other pages may pull it transitively.
- **Fix:** Per-chart `dynamic()` import inside `AnalyticsCharts` itself.

#### D6. [MEDIUM] Proposals list filter recomputes on every render
- **File:** `dashboard/app/proposals/proposals-client.js:198-202`
- **Evidence:** `const filtered = proposals.filter(...)` in render body.
- **Impact:** All 25+ rows re-render on every parent state change.
- **Fix:** `useMemo([proposals, filter, search], ...)`.

#### D7. [MEDIUM] `Row` rebuilds child handlers on every parent render
- **File:** `dashboard/app/proposals/proposals-client.js:388-436`
- **Evidence:** Inline arrow functions for `onStatusChange`/`onDelete`/`onEarningsUpdate`.
- **Impact:** Every parent re-render → new function refs → all rows re-render even if their data didn't change.
- **Fix:** `React.memo(Row)` + `useCallback` for handlers.

#### D8. [MEDIUM] Profile form has 7 separate useState calls
- **File:** `dashboard/app/profile/profile-client.js:8-25`
- **Impact:** Any state change re-renders the whole form tree.
- **Fix:** Consolidate into one `useReducer`, or migrate to react-hook-form.

### Caching + revalidation (2)

#### D9. [CRITICAL] (covered by D1) Zero revalidation strategy
- See D1.

#### D10. [HIGH] Templates client refetches manually after mutations
- **File:** `dashboard/app/templates/templates-client.js:38-49`
- **Impact:** Stale-while-revalidate not implemented; relies on user to click refresh.
- **Fix:** Use SWR/React-Query, or `router.refresh()` after each mutation.

### Hydration (2)

#### D11. [MEDIUM] Sidebar re-renders on every nav due to `usePathname`
- **File:** `dashboard/components/Sidebar.js:49, 83-84`
- **Impact:** 10+ nav items re-evaluate active state on every route change.
- **Fix:** CSS-only active state via `data-attr`, or memoize per-item.

#### D12. [MEDIUM] AuthLayout is a client component on all routes
- **File:** `dashboard/components/AuthLayout.js:1, 12-14`
- **Impact:** Hydrates mobile-sidebar state on every authenticated page even if user never opens it.
- **Fix:** Lift the toggle to a tiny dedicated client component; keep AuthLayout server.

### Images (2)

#### D13. [HIGH] Projects gallery uses raw `<img>` for external URLs
- **File:** `dashboard/app/projects/projects-client.js:327, 404`
- **Impact:** No format conversion (WebP), no responsive sizing, no blur placeholder. Heavy first-paint cost for large screenshots.
- **Fix:** `next/image` with `sizes` + `loading="lazy"`.

#### D14. [LOW] Inline SVG icons in Sidebar
- **File:** `dashboard/components/Sidebar.js:8-46`
- **Impact:** Re-parsed on hydration but tiny.
- **Fix:** Extract to a single icon module (cosmetic).

### Client API calls (1)

#### D15. [MEDIUM] Proposal detail fetched on each row expand — no cache
- **File:** `dashboard/app/proposals/proposals-client.js:325-332`
- **Impact:** Re-clicking a row refetches its full detail.
- **Fix:** Cache details in a Map keyed by id, or use SWR.

---

## Extension findings (12)

### Manifest + script loading (3)

#### E1. [HIGH] Four content scripts injected on every Upwork page
- **File:** `extension/manifest.json:18-95`
- **Evidence:** 4 separate `content_scripts` entries; libraries (`lib/constants.js`, `lib/storage.js`, `lib/api.js`) duplicated across them.
- **Impact:** Each script context parses + executes lib code independently. 3-4× redundant work per page load.
- **Fix:** Out-of-scope for this audit — high-risk manifest restructure. Track separately. (Note: NOT in the top-15 fix list because of risk.)

#### E2. [MEDIUM] Feed-scraper observer scoped to `body` with `subtree: true`
- **File:** `extension/content/feed-scraper.js:222-239`
- **Evidence:** `observer.observe(container, { childList: true, subtree: true })`.
- **Impact:** During Upwork's infinite-scroll, the observer fires dozens of times per second. Each callback runs 4 querySelectorAll across the whole feed.
- **Fix:** 500ms debounce on the callback.

#### E3. [MEDIUM] feed-ui calls `_applyFiltersToAll` 3 times in 5s
- **File:** `extension/content/feed-ui.js:560-566`
- **Evidence:** Immediate + 2s + 5s timers, plus mutation observer with 1.5s debounce.
- **Impact:** Filter logic runs 3-4× per nav.
- **Fix:** Defer second pass until card count stabilizes; consolidate timers.

### Content scripts (3)

#### E4. [MEDIUM] Repeated querySelectorAll in `scrapeSkills`
- **File:** `extension/content/scraper.js:318-330`
- **Evidence:** Loops every `section.air3-card-section` to find Skills section.
- **Impact:** O(n) page sections per call.
- **Fix:** Cache parent ref on first match; break early.

#### E5. [MEDIUM] Budget parsing tries 3+ selector strategies sequentially
- **File:** `extension/content/scraper.js:243-303`
- **Impact:** ~20 DOM queries per job-detail load.
- **Fix:** Combine selectors with `:is()`; break outer loop on first hit.

#### E6. [LOW] Hidden-instructions regex: redundant `lastIndex` reset
- **File:** `extension/content/hidden-instructions.js:52-82`
- **Impact:** Trivial.
- **Fix:** Remove the second reset.

### Observers + polling (2)

#### E7. [MEDIUM] outcome-detector uses both `setInterval` AND `MutationObserver`
- **File:** `extension/content/outcome-detector.js:57, 106`
- **Evidence:** 1.5s `setInterval` polls `location.href`; observer also debounces at 1.5s. Both call `handleCurrentUrl`.
- **Impact:** Duplicate wakeups; CPU-inefficient.
- **Fix:** Remove the polling; rely solely on the observer.

#### E8. [MEDIUM] follow-up-injector retries via `setInterval(500ms)` × 6
- **File:** `extension/content/follow-up-injector.js:125`
- **Evidence:** No throttling if multiple notifications fire close together.
- **Impact:** Concurrent retry loops on overlapping notifications.
- **Fix:** Single global retry queue; debounce message handler.

### Popup + DOM (2)

#### E9. [MEDIUM] Popup init makes 3-4 network calls in parallel but each one is blocking
- **File:** `extension/popup/popup.js:865-897`
- **Evidence:** outcome flag, connects, bootstrap fire independently.
- **Impact:** ~400-1000ms before popup is interactive (worst-case backend latency).
- **Fix:** Out-of-scope for top-15 (requires new `/popup-init` endpoint). Track separately.

#### E10. [MEDIUM] Vetting red-flags renders without DocumentFragment batching
- **File:** `extension/popup/popup.js:690-718`
- **Impact:** Each `appendChild` triggers a reflow.
- **Fix:** Use `DocumentFragment` to batch the appends.

### Service worker + network (2)

#### E11. [MEDIUM] Two separate alarms (checkFeed every 5-15min + followup every 60min)
- **File:** `extension/background/service-worker.js:430-434, 467-469, 283-327`
- **Impact:** Service worker wakes up frequently; each wake creates a new execution context. Hidden-tab feed scrape opens a real Upwork tab in the background.
- **Fix:** Single 30-min alarm dispatches both checks (skip follow-up if it ran <55m ago). Skip hidden-tab scrape if user already has Upwork open recently.

#### E12. [LOW] Connect-balance PUT fires on every job-detail page view
- **File:** `extension/content/scraper.js:604-613`
- **Impact:** Most updates are no-ops (balance unchanged). Tens of redundant PUTs per session.
- **Fix:** `chrome.storage.local` cache; PUT only when delta ≥ 1.

---

## Top 15 prioritized fixes (highest ROI first)

### Backend

1. **[HIGH] B6** — Parallelize LLM calls in `backend/api/projects.js:51-68` (5-project batch: 100s → 30s).
2. **[HIGH] B3** — Add `idx_proposals_loom_url` partial index (`backend/db/migrations/021_perf_indexes.sql`).
3. **[HIGH] B10** — Parallelize profile + job-analysis in `proposal.service.js:222-257` (~10s saved per proposal).
4. **[MEDIUM] B4 + B5** — Add `idx_followups_status_scheduled` and `idx_banned_phrases_active_scope` (same migration).
5. **[MEDIUM] B1, B7** — Replace `SELECT *` with explicit column lists in `proposal.repository.js`, `template.repository.js`, `project.repository.js`.
6. **[MEDIUM] B15** — Bump pg pool from 20 → 50 in `db/pool.js`.
7. **[MEDIUM] B13** — Use Redis store on `globalLimiter` in `middleware/rate-limiter.js`.

### Dashboard

8. **[CRITICAL] D1** — Replace `cache: 'no-store'` with `next: { revalidate: 60 }` for read-only endpoints in `lib/server-api.js`.
9. **[HIGH] D2** — Memoize `readSession()` in `app/layout.js` via `React.cache`.
10. **[MEDIUM] D6 + D7** — `useMemo` the proposals list filter + `React.memo` the `Row` component.
11. **[MEDIUM] D13** — Switch `<img>` to `next/image` in `app/projects/projects-client.js`.

### Extension

12. **[MEDIUM] E2** — Debounce the feed-scraper MutationObserver callback (500ms).
13. **[MEDIUM] E7** — Drop `setInterval` polling in `outcome-detector.js`; keep only the observer.
14. **[MEDIUM] E11** — Merge service-worker alarms; throttle hidden-tab feed scrape.
15. **[LOW-but-quick] E12** — Cache last Connect-balance in `chrome.storage.local`; skip PUTs when unchanged.

---

## Out of scope (explicitly deferred)

- **E1** — Merging 4 content scripts into 1 (high reward, high risk; manifest restructure deserves its own branch).
- **E9** — `/api/v1/popup-init` batched endpoint (requires new backend endpoint and popup refactor).
- **D5** — Per-chart `dynamic()` split for Recharts (already partly done at the page level).
- pgBouncer / connection pooling middleware (infrastructure change, not application code).
- Lighthouse / WebPageTest before-after benchmarking (separate verification effort).
- Test infrastructure (project-wide initiative).

---

## Verification recipes

### Backend
```sh
# Confirm new indexes are used
docker compose exec -T db psql -U postgres -d upwork_proposals \
  -c "EXPLAIN ANALYZE SELECT loom_url FROM proposals WHERE loom_url IS NOT NULL LIMIT 5;"
# Expect: "Index Scan using idx_proposals_loom_url" (not "Seq Scan").

# Confirm parallel LLM completions
# Hit POST /projects/enhance-all on a user with 3-5 weak projects.
# Tail logs: completions should arrive within seconds of each other, not 20s apart.
docker compose logs backend --tail 200 -f
```

### Dashboard
```
1. Hard refresh /insights with DevTools Network panel open. Note the RSC payload size + latency.
2. Click to /proposals, then back to /insights within 60s.
3. The second /insights load should NOT show a request to /api/v1/insights — RSC HTML cached.
4. React DevTools Profiler: trigger a proposal status change in the list. Confirm only the changed Row re-renders, not all 25.
```

### Extension
```
1. Open an Upwork feed page with Chrome DevTools → Performance recording started.
2. Scroll the feed for 10 seconds. Stop recording.
3. Scripting time per frame should be < 50ms (was likely > 200ms with unthrottled observer).
4. Open the extension popup 3 times in a row. Network panel should show /connects/balance PUT only on the first job-detail page view per session for unchanged balances.
```
