# Extension Data Caching via Redis + Local Cache — Design Spec

**Date:** 2026-04-09
**Problem:** Extension popup makes 5 separate API calls on every open (settings, profile, templates, projects, proposals) with no caching. Each call adds 200-500ms latency. Combined with DOM scraping, popup init takes 2-3 seconds.
**Goal:** 3-layer caching (extension local → backend Redis → DB) with a single bootstrap endpoint. Popup should open in <500ms on repeat visits. 15-minute local cache TTL.

---

## Architecture: 3-Layer Cache

```
Layer 1: chrome.storage.local (15 min TTL, instant)
  ↓ miss
Layer 2: GET /api/v1/bootstrap → Redis (10 min TTL, ~5-20ms)
  ↓ miss
Layer 3: Parallel DB queries → cache in Redis → return
```

---

## Backend: `/api/v1/bootstrap` endpoint

### New file: `backend/api/bootstrap.js`

Single GET endpoint that returns everything the extension needs:

```json
{
  "profile": { "full_name", "title", "summary", "skills", "experience", "portfolio", "default_hourly_rate" },
  "templates": [{ "id", "name", "content", "platform" }],
  "projects": [{ "id", "name", "description", "technologies", "outcome", "is_featured" }],
  "settings": { "notification_enabled", "notification_interval", "skills_include", "keywords_include", "keywords_exclude", "budget_min", "budget_max", "locations", "min_spent", "min_hire_rate", "min_reviews" },
  "recentProposalUrls": ["url1", "url2", ...]
}
```

### Implementation:
1. Check Redis cache: key `bootstrap:{userId}`, TTL 600s
2. If cached → return immediately
3. If miss → `Promise.all` to fetch profile, templates, projects, settings, recent proposal URLs in parallel
4. For `recentProposalUrls`: query `SELECT job_url FROM proposals WHERE user_id = $1 AND status = 'sent' ORDER BY created_at DESC LIMIT 100`
5. Cache combined result in Redis
6. Return response

### Cache invalidation:
Add `cacheDel('bootstrap:' + userId)` to every service that mutates constituent data:
- `profile.service.js` — on profile update
- `project.service.js` — on create/update/delete
- `template.service.js` — on create/update/delete
- `settings.service.js` — on settings update
- `proposal.service.js` — on create/update/delete

### Route: `backend/routes/v1/index.js`
Mount: `router.use('/bootstrap', bootstrapRouter);`

---

## Extension: Local Cache in chrome.storage.local

### New helpers in `extension/lib/storage.js`:

```js
function getBootstrapCache() {
  return new Promise(resolve => {
    chrome.storage.local.get(['bootstrapData', 'bootstrapTimestamp'], result => {
      const age = Date.now() - (result.bootstrapTimestamp || 0);
      if (result.bootstrapData && age < 15 * 60 * 1000) {
        resolve(result.bootstrapData);
      } else {
        resolve(null);
      }
    });
  });
}

function setBootstrapCache(data) {
  chrome.storage.local.set({
    bootstrapData: data,
    bootstrapTimestamp: Date.now()
  });
}

function clearBootstrapCache() {
  chrome.storage.local.remove(['bootstrapData', 'bootstrapTimestamp']);
}
```

---

## Extension: Popup Initialization Rewrite

### Current flow (sequential, 5 API calls):
```
getSettings → tabs.query → GET_VETTING → settings API → profile API → templates API → projects API → proposals API
```

### New flow (parallel, 0-1 API calls):
```
PARALLEL:
  ├── GET_VETTING (content script DOM scraping)
  └── getBootstrapCache()
        ├── HIT → use cached data
        └── MISS → apiFetch('/api/v1/bootstrap') → cache locally

THEN: render popup with both datasets
```

### Changes to `extension/popup/popup.js` — `init()` function:

Replace the 5 sequential API calls (settings, profile, templates, projects, proposals) at lines 477-668 with:

```js
// Start both in parallel
const [vettingResult, bootstrapData] = await Promise.all([
  sendToContent(activeTabId, { type: 'GET_VETTING' }),
  loadBootstrap()
]);

async function loadBootstrap() {
  let data = await getBootstrapCache();
  if (!data) {
    const res = await apiFetch('/api/v1/bootstrap');
    if (res.ok) {
      data = await res.json();
      setBootstrapCache(data);
    }
  }
  return data;
}
```

Then use `bootstrapData` to:
- Sync notification settings (from `bootstrapData.settings`)
- Calculate fit score (from `bootstrapData.profile.skills`)
- Populate template dropdown (from `bootstrapData.templates`)
- Create project checkboxes (from `bootstrapData.projects`)
- Check duplicate proposals (from `bootstrapData.recentProposalUrls`)

### Refresh button
Add a small refresh icon button in the popup header. On click:
```js
clearBootstrapCache();
// Re-run loadBootstrap() to fetch fresh data
```

---

## Files to Create/Modify

| # | File | Action | Change |
|---|------|--------|--------|
| 1 | `backend/api/bootstrap.js` | Create | Single bootstrap endpoint with Redis caching |
| 2 | `backend/routes/v1/index.js` | Modify | Mount bootstrap route |
| 3 | `backend/repositories/proposal.repository.js` | Modify | Add `findRecentUrls(userId, limit)` |
| 4 | `backend/services/profile.service.js` | Modify | Add bootstrap cache invalidation |
| 5 | `backend/services/project.service.js` | Modify | Add bootstrap cache invalidation |
| 6 | `backend/services/template.service.js` | Modify | Add bootstrap cache invalidation |
| 7 | `backend/services/settings.service.js` | Modify | Add bootstrap cache invalidation |
| 8 | `extension/lib/storage.js` | Modify | Add getBootstrapCache/setBootstrapCache/clearBootstrapCache |
| 9 | `extension/popup/popup.js` | Modify | Replace 5 API calls with bootstrap cache, parallelize with DOM scraping |

---

## Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| API calls per popup open | 5 | 0-1 |
| Network latency per open | ~1-2.5s | 0ms (cached) or ~200ms (1 call) |
| Backend DB queries per open | 5-6 | 0 (Redis) or 5 parallel |
| Popup ready time | ~2-3s | ~500ms (DOM scraping only) |

---

## Verification

1. Open extension popup — first open fetches from `/bootstrap`, subsequent opens use cache
2. Check chrome.storage.local — `bootstrapData` and `bootstrapTimestamp` should exist
3. Wait 15+ minutes — next open should refetch from API
4. Update a project in dashboard — bootstrap cache should be invalidated server-side (Redis cleared)
5. Click refresh button in popup — should clear local cache and refetch
6. Check Network tab — should see single `/bootstrap` call instead of 5 separate calls
7. Verify templates dropdown, project checkboxes, duplicate check all work from bootstrap data
