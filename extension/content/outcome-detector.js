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
    seenThreadIds: new Set(),         // raw message-thread IDs (used in scanMessageThread)
    seenProposalListKeys: new Set(),  // "${event}:${jobUrl||jobTitle}" dedupe strings (used in scanProposalsList)
    pollTimer: null,

    // Tracks the highest event rank reached per job URL so that state transitions
    // (viewed → interview → hired) each fire exactly once per session.
    // TODO: this ranking is best-effort — the backend already deduplicates by
    //       (proposal_id, event_type, occurred_at::date) so duplicates are mostly harmless.
    highestRankByJob: new Map(),  // jobUrl|jobTitle → EVENT_RANK number
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
    STATE.seenProposalListKeys.clear();
    STATE.highestRankByJob.clear();
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

  // ---- Status keyword definitions ----

  // Rank model: viewed < interview < hired; archived is terminal but parallel.
  // Only fire an event when the detected rank is strictly higher than what we've
  // already seen for this job. archived always fires once regardless.
  const EVENT_RANK = { viewed: 1, interview: 2, hired: 3, archived: -1 };

  const STATUS_KEYWORDS = [
    { event: 'viewed',    patterns: [/\bviewed\b/i, /\bopened by client\b/i] },
    { event: 'interview', patterns: [/\binterview\b/i, /\bmessages?\s+sent\b/i] },
    { event: 'hired',     patterns: [/\bhired\b/i, /\boffer accepted\b/i, /\bcontract started\b/i] },
    { event: 'archived',  patterns: [/\barchived\b/i, /\bnot\s+selected\b/i, /\bdeclined\b/i, /\bclosed\b/i, /\bwithdrawn\b/i] },
  ];

  /**
   * Given a row element, locate the best status text to test.
   *
   * Strategy (most-precise first):
   *   1. Elements with a data-test attr containing "status"
   *   2. Elements with an Upwork badge class that also mentions "status"
   *   3. aria-label attrs that mention "status"
   *   4. Leaf nodes whose className contains "status"
   *   5. Fallback: row's td / [role=cell] / small leaf nodes only
   *
   * Returns the textContent of the first match, or null.
   */
  function extractStatusText(rowNode) {
    const STRUCTURED_SELECTORS = [
      '[data-test*="status" i]',
      '.air3-badge[class*="status" i]',
      '[aria-label*="status" i]',
      '[class*="status" i]:not(:has(*))',  // leaf nodes whose class includes "status"
    ];

    for (const sel of STRUCTURED_SELECTORS) {
      try {
        const el = rowNode.querySelector(sel);
        if (el) {
          const text = (el.textContent || el.getAttribute('aria-label') || '').trim();
          if (text) return text;
        }
      } catch (_) {
        // :has() may not be supported in older Chrome builds; continue to next selector
      }
    }

    // Fallback: restrict to leaf-most cell-like elements to avoid matching
    // the job description body text (which is the main source of false positives).
    const leaves = rowNode.querySelectorAll('td, [role="cell"], small');
    if (leaves.length) {
      // Concatenate only the short leaf texts — long text is description, not status.
      const parts = [];
      for (const leaf of leaves) {
        const t = (leaf.textContent || '').trim();
        if (t.length > 0 && t.length <= 60) parts.push(t);
      }
      return parts.join(' ') || null;
    }

    return null;
  }

  /**
   * Match a status string against the keyword list.
   * Returns the first matching event name or null.
   */
  function matchStatusEvent(statusText) {
    if (!statusText) return null;
    for (const { event, patterns } of STATUS_KEYWORDS) {
      if (patterns.some((re) => re.test(statusText))) return event;
    }
    return null;
  }

  // ---- Scanners ----

  /**
   * Section 4: scanMessageThread — detect message_thread_opened and (v0) replied.
   *
   * Job URL / title extraction is now scoped to the thread container first
   * before falling back to page-wide searches, preventing navigation links
   * like "Browse jobs" from being picked up as the proposal job.
   */
  function scanMessageThread() {
    console.debug('[outcome-detector] scanning message thread');
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

    // Section 5: watch for client replies appearing after initial load.
    // We attach a lightweight mutation observer on the message list.
    // If the heuristic gets too noisy this block can be removed — the
    // message_thread_opened event above is sufficient for V1.
    attachReplyObserver({ threadId, jobUrl, jobTitle });
  }

  /**
   * Section 5: mutation observer for the active message thread.
   * Fires a "replied" event when a new client-side message bubble appears
   * after the initial render. Scoped to the message-list container so it
   * doesn't react to sidebar noise.
   */
  function attachReplyObserver({ threadId, jobUrl, jobTitle }) {
    // Only one reply observer at a time (teardownObserver handles the list observer;
    // we track the reply observer separately so they don't conflict).
    if (STATE._replyObserver) { STATE._replyObserver.disconnect(); STATE._replyObserver = null; }

    const MSG_LIST_SELECTORS = [
      '[data-test*="message-list" i]',
      '[data-test*="messages-list" i]',
      '[role="log"]',
      '[role="list"][aria-label*="message" i]',
    ];

    let messageContainer = null;
    for (const sel of MSG_LIST_SELECTORS) {
      try {
        messageContainer = document.querySelector(sel);
        if (messageContainer) break;
      } catch (_) { /* skip invalid selector */ }
    }

    if (!messageContainer) return;  // Couldn't find container; skip silently

    // Track bubbles already present so we only react to genuinely new ones.
    const BUBBLE_SELECTOR = '[data-test*="message-bubble" i], [data-test*="message-item" i], [class*="message-bubble" i], [class*="messageBubble" i]';
    const seenBubbles = new Set(
      Array.from(messageContainer.querySelectorAll(BUBBLE_SELECTOR)).map((el) => el)
    );

    STATE._replyObserver = new MutationObserver(debounce(() => {
      try {
        const allBubbles = messageContainer.querySelectorAll(BUBBLE_SELECTOR);
        for (const bubble of allBubbles) {
          if (seenBubbles.has(bubble)) continue;
          seenBubbles.add(bubble);

          // Determine sender: look for a sender label / aria attribute on or near the bubble.
          const senderEl = bubble.querySelector(
            '[data-test*="sender" i], [aria-label*="from" i], [class*="sender" i]:not(:has(*))'
          );
          const senderText = (senderEl?.textContent || senderEl?.getAttribute('aria-label') || '').trim().toLowerCase();

          // Heuristic: if the bubble has a "you" / "me" indicator it's the freelancer's own message.
          const isOwnMessage = /\byou\b|\bme\b/.test(senderText);
          if (isOwnMessage) continue;

          // New message from client — fire replied event (backend dedupes by date).
          sendEvent({
            eventType: 'replied',
            source: 'dom',
            jobUrl: jobUrl || undefined,
            jobTitle: jobTitle || undefined,
            occurredAt: new Date().toISOString(),
            metadata: { threadId, trigger: 'new-bubble' },
          });
          // Fire at most once per mutation batch to avoid burst sends.
          break;
        }
      } catch (err) {
        console.warn('[outcome-detector] reply observer failed', err);
      }
    }, 2000));

    STATE._replyObserver.observe(messageContainer, { childList: true, subtree: true });
  }

  /**
   * Section 1 + 2 + 3: scanProposalsList
   *
   * Uses a prioritised selector list (specific → fallback).
   * Status detection prefers structured DOM signals over raw text matching.
   * Dedupe is rank-aware: a viewed→interview transition fires both events.
   */
  function scanProposalsList() {
    try {
      // --- Section 1: row selector, prioritised ---
      let candidates = document.querySelectorAll([
        'tr[data-test*="proposal" i]',
        'div[data-test="my-proposal-row"]',
        'div[data-test="proposalRow"]',
        'div[data-test="proposalsTableRow"]',
        'article[data-test*="proposal" i]',
      ].join(','));

      if (candidates.length === 0) {
        // Broad fallback — log a warning so we know selectors need updating.
        console.warn('[outcome-detector] primary proposal-row selectors matched nothing; falling back to broad query — selectors may need updating');
        candidates = document.querySelectorAll('section[data-test*="proposal" i]');
      }

      console.debug(`[outcome-detector] scanning ${candidates.length} proposal candidates`);

      if (candidates.length === 0) return;

      const events = [];

      for (const node of candidates) {
        try {
          // Sanity-check node size (skip containers that are way too large)
          if ((node.textContent || '').length > 6000) continue;

          // --- Job identity ---
          const link = node.querySelector('a[href*="/jobs/"]');
          const jobUrl = link?.href || null;
          const titleNode = node.querySelector('h3, h4, [data-test*="title" i], a[href*="/jobs/"]');
          const jobTitle = titleNode?.textContent?.trim()?.slice(0, 200) || null;
          if (!jobUrl && !jobTitle) continue;

          const jobKey = jobUrl || jobTitle;

          // --- Section 2: status detection ---
          const statusText = extractStatusText(node);
          const event = matchStatusEvent(statusText);
          if (!event) continue;

          // --- Section 3: rank-aware dedupe ---
          const rank = EVENT_RANK[event];
          const currentRank = STATE.highestRankByJob.get(jobKey) ?? -Infinity;

          // archived fires once regardless of rank (it's a terminal parallel state)
          if (event !== 'archived' && rank <= currentRank) continue;

          // Check legacy string dedupe as well (belt-and-suspenders for same session)
          const dedupeKey = `${event}:${jobKey}`;
          if (STATE.seenProposalListKeys.has(dedupeKey)) continue;

          STATE.seenProposalListKeys.add(dedupeKey);
          // Update rank (don't update for archived since it's parallel, not sequential)
          if (event !== 'archived') {
            STATE.highestRankByJob.set(jobKey, rank);
          } else if (!STATE.highestRankByJob.has(jobKey)) {
            // Mark archived so it won't re-fire this session
            STATE.highestRankByJob.set(jobKey, rank);
          }

          events.push({
            eventType: event,
            source: 'dom',
            jobUrl: jobUrl || undefined,
            jobTitle: jobTitle || undefined,
            occurredAt: new Date().toISOString(),
            metadata: { kind: 'proposal-list-row' },
          });
        } catch (rowErr) {
          console.warn('[outcome-detector] error processing proposal row', rowErr);
        }
      }

      if (events.length) sendEvents(events);
    } catch (err) {
      console.warn('[outcome-detector] scanProposalsList failed', err);
    }
  }

  // ---- DOM extraction helpers ----

  /**
   * Section 4: job URL — scoped to thread container first.
   */
  function findJobUrlInDom() {
    // Try thread-scoped containers first to avoid matching nav "Browse jobs" links.
    const THREAD_SCOPES = [
      '[data-test*="thread" i] a[href*="/jobs/"]',
      '[role="main"] a[href*="/jobs/"]',
    ];
    for (const sel of THREAD_SCOPES) {
      try {
        const el = document.querySelector(sel);
        if (el?.href) return el.href;
      } catch (_) { /* skip */ }
    }
    // Broad fallback
    const link = document.querySelector('a[href*="/jobs/"]');
    return link?.href || null;
  }

  /**
   * Section 4: job title — scoped to thread container first.
   */
  function findJobTitleInDom() {
    // Thread-scoped first
    const THREAD_SCOPES = [
      '[data-test*="thread" i]',
      '[role="main"]',
    ];

    for (const scope of THREAD_SCOPES) {
      try {
        const container = document.querySelector(scope);
        if (!container) continue;
        const TITLE_SELECTORS = [
          'h1[data-test*="title" i]',
          'h2[data-test*="title" i]',
          '[data-test*="job-title" i]',
          'h1',
          'h2',
        ];
        for (const sel of TITLE_SELECTORS) {
          const el = container.querySelector(sel);
          const text = el?.textContent?.trim();
          if (text && text.length >= 2 && text.length <= 200) return text;
        }
      } catch (_) { /* skip */ }
    }

    // Broad fallback (original behaviour)
    const FALLBACK_SELECTORS = [
      'h1[data-test*="title" i]',
      'h2[data-test*="title" i]',
      '[data-test*="job-title" i]',
      'h1',
      'h2',
    ];
    for (const sel of FALLBACK_SELECTORS) {
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
