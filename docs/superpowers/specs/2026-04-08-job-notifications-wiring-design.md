# Job Match Notifications — Wiring Design Spec

**Date:** 2026-04-08
**Problem:** User bids too late — by the time they see a good job, 20-50 proposals are already submitted.
**Goal:** Wire up the existing notification infrastructure so the extension actively monitors for matching jobs and alerts via badge + sound.

---

## What Already Exists (no changes needed)

- `service-worker.js` — `checkForNewJobs()` fully implemented: opens background tab, scrapes feed, filters matches, creates notifications, tracks seen jobs
- `service-worker.js` — Alarm listener for `'checkFeed'` alarm
- `service-worker.js` — `ENABLE_FEED_NOTIFICATIONS` message handler: creates/clears alarm
- `service-worker.js` — `chrome.notifications.onClicked` handler: opens job URL
- `feed-scraper.js` — Complete feed scraping with multiple selector fallbacks
- `feed-ui.js` — Toggle checkbox for notifications on feed page
- Database `settings` table — `notification_enabled`, `notification_interval` columns
- Settings schema — validation for both fields

---

## What Needs Wiring

### 1. Dashboard settings page — add notification controls

**File:** `dashboard/app/settings/page.js`

Add a "Job Notifications" section with:
- Toggle: "Enable job notifications" (maps to `notification_enabled`)
- Dropdown/input: "Check interval" in minutes (maps to `notification_interval`, default 15, range 1-60)
- Save via existing `api.put('/settings', { notification_enabled, notification_interval })`

### 2. Extension popup — activate alarm on load

**File:** `extension/popup/popup.js`

On popup initialization (when settings are loaded from backend):
- Read `notification_enabled` and `notification_interval` from settings
- Send `ENABLE_FEED_NOTIFICATIONS` message to service worker:
  ```js
  chrome.runtime.sendMessage({
    type: 'ENABLE_FEED_NOTIFICATIONS',
    enabled: settings.notification_enabled,
    intervalMinutes: settings.notification_interval || 15
  });
  ```

This ensures the alarm is always synced with the latest backend settings whenever the popup opens.

### 3. Extension install/update — resume alarm

**File:** `extension/background/service-worker.js`

Add `chrome.runtime.onInstalled` listener:
- Fetch settings from backend (if logged in)
- If `notification_enabled` is true, create the `'checkFeed'` alarm

---

## Files to Modify

| File | Change |
|------|--------|
| `dashboard/app/settings/page.js` | Add notification toggle + interval control |
| `extension/popup/popup.js` | Send ENABLE_FEED_NOTIFICATIONS on load |
| `extension/background/service-worker.js` | Add onInstalled handler to resume alarm |

---

## Verification

1. Enable notifications in dashboard settings → extension badge should start showing after first check interval
2. Disable notifications → alarm should stop, badge cleared
3. Change interval → alarm should recreate with new interval
4. Navigate to a matching Upwork job feed → should see badge count increment
5. Click notification → should open the job URL
6. Restart browser → notification alarm should resume if enabled (onInstalled handler)
