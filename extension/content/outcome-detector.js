/**
 * Phase 3 Learning Coach — outcome detector content script.
 *
 * Listens for Upwork DOM signals that the client has engaged with our submitted
 * proposals (message thread opened, proposal viewed, etc.) and POSTs them to
 * /api/v1/outcomes/events. Best-effort: any failure silently no-ops.
 *
 * Feature-flagged: only runs when chrome.storage.local has
 * outcome_tracking_enabled = true. The flag is synced by the popup from
 * GET /api/v1/outcomes/tracking on each open.
 *
 * Defensive against Upwork DOM churn — selector misses are logged and skipped,
 * never thrown.
 */

(function () {
  'use strict';

  const STATE = {
    enabled: false,
    observer: null,
    lastUrl: window.location.href,
    seenThreadIds: new Set(),
    pollTimer: null,
  };

  // ---- Bootstrap ----

  chrome.storage.local.get(['outcome_tracking_enabled'], (result) => {
    STATE.enabled = !!result.outcome_tracking_enabled;
    if (!STATE.enabled) return;
    init();
  });

  // React to flag changes mid-session
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.outcome_tracking_enabled) return;
    const next = !!changes.outcome_tracking_enabled.newValue;
    if (next === STATE.enabled) return;
    STATE.enabled = next;
    if (STATE.enabled) init();
    else teardown();
  });

  function init() {
    try {
      handleCurrentUrl();
      // Watch SPA navigation — Upwork is a single-page app
      if (!STATE.pollTimer) {
        STATE.pollTimer = setInterval(() => {
          if (window.location.href !== STATE.lastUrl) {
            STATE.lastUrl = window.location.href;
            handleCurrentUrl();
          }
        }, 1500);
      }
    } catch (err) {
      console.warn('[outcome-detector] init failed', err);
    }
  }

  function teardown() {
    if (STATE.observer) { STATE.observer.disconnect(); STATE.observer = null; }
    if (STATE.pollTimer) { clearInterval(STATE.pollTimer); STATE.pollTimer = null; }
    STATE.seenThreadIds.clear();
  }

  // ---- Per-URL dispatch ----

  function handleCurrentUrl() {
    const url = window.location.href;
    teardownObserver();

    // /messages/<id>/  → user opened a thread
    if (/upwork\.com\/(ab\/|nx\/)?messages\/[^/?]+/.test(url)) {
      scheduleScan(scanMessageThread, 1500);
      return;
    }
    // /proposals/  (listing) → status badges per row
    if (/upwork\.com\/(ab\/|nx\/)?proposals\/?$/.test(url) || /\/freelancers\/proposals/.test(url)) {
      scheduleScan(scanProposalsList, 1500);
      attachListObserver();
      return;
    }
  }

  function scheduleScan(fn, delayMs) {
    setTimeout(() => { try { fn(); } catch (err) { console.warn('[outcome-detector] scan failed', err); } }, delayMs);
  }

  function teardownObserver() {
    if (STATE.observer) { STATE.observer.disconnect(); STATE.observer = null; }
  }

  function attachListObserver() {
    if (STATE.observer) STATE.observer.disconnect();
    STATE.observer = new MutationObserver(debounce(() => {
      try { scanProposalsList(); } catch (err) { console.warn('[outcome-detector] list observer scan failed', err); }
    }, 1500));
    STATE.observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Scanners ----

  function scanMessageThread() {
    const threadMatch = window.location.href.match(/\/messages\/([^/?#]+)/);
    if (!threadMatch) return;
    const threadId = threadMatch[1];
    if (STATE.seenThreadIds.has(threadId)) return;
    STATE.seenThreadIds.add(threadId);

    const jobUrl = findJobUrlInDom();
    const jobTitle = findJobTitleInDom();
    if (!jobUrl && !jobTitle) return;

    sendEvent({
      eventType: 'message_thread_opened',
      source: 'dom',
      jobUrl: jobUrl || undefined,
      jobTitle: jobTitle || undefined,
      occurredAt: new Date().toISOString(),
      metadata: { threadId },
    });
  }

  // Heuristic status-badge mapping from Upwork's proposal-list rows.
  // We scan visible text within each plausible row container; if it contains a known
  // status keyword AND we can extract the job title/url, fire the corresponding event.
  const STATUS_MAP = [
    { keywords: ['viewed by client', 'viewed'], event: 'viewed' },
    { keywords: ['interview'], event: 'interview' },
    { keywords: ['hired', 'offer accepted'], event: 'hired' },
    { keywords: ['archived', 'not selected', 'declined'], event: 'archived' },
  ];

  function scanProposalsList() {
    // Try a couple of plausible row selectors. Upwork uses dynamic classnames so we
    // search broadly and rely on text-based matching as the discriminator.
    const candidates = document.querySelectorAll(
      'section[data-test*="proposal" i], div[data-test*="proposal" i], li[data-test*="proposal" i], article'
    );
    if (!candidates.length) return;

    const events = [];
    for (const node of candidates) {
      const text = (node.textContent || '').toLowerCase();
      if (text.length === 0 || text.length > 4000) continue;
      const link = node.querySelector('a[href*="/jobs/"]');
      const jobUrl = link?.href || null;
      const titleNode = node.querySelector('h3, h4, [data-test*="title" i], a[href*="/jobs/"]');
      const jobTitle = titleNode?.textContent?.trim()?.slice(0, 200) || null;
      if (!jobUrl && !jobTitle) continue;

      for (const { keywords, event } of STATUS_MAP) {
        if (keywords.some((kw) => text.includes(kw))) {
          const dedupeKey = `${event}:${jobUrl || jobTitle}`;
          if (STATE.seenThreadIds.has(dedupeKey)) break;
          STATE.seenThreadIds.add(dedupeKey);
          events.push({
            eventType: event,
            source: 'dom',
            jobUrl: jobUrl || undefined,
            jobTitle: jobTitle || undefined,
            occurredAt: new Date().toISOString(),
            metadata: { kind: 'proposal-list-row' },
          });
          break;
        }
      }
    }
    if (events.length) sendEvents(events);
  }

  // ---- DOM extraction helpers ----

  function findJobUrlInDom() {
    const link = document.querySelector('a[href*="/jobs/"]');
    return link?.href || null;
  }

  function findJobTitleInDom() {
    const candidates = [
      'h1[data-test*="title" i]',
      'h2[data-test*="title" i]',
      '[data-test*="job-title" i]',
      'h1',
      'h2',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text && text.length >= 2 && text.length <= 200) return text;
    }
    return null;
  }

  // ---- Network ----

  function sendEvent(event) { sendEvents([event]); }

  async function sendEvents(events) {
    if (!events || !events.length) return;
    try {
      // Reuse the extension's apiFetch helper (loaded earlier in the content_scripts chain via lib/api.js)
      if (typeof window.apiFetch !== 'function') return;
      await window.apiFetch('/api/v1/outcomes/events', {
        method: 'POST',
        body: JSON.stringify({ events }),
      });
    } catch (err) {
      // Non-fatal — outcome tracking is best-effort
      console.warn('[outcome-detector] send failed', err?.message || err);
    }
  }

  // ---- Utility ----

  function debounce(fn, ms) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }
})();
