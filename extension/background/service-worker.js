/**
 * service-worker.js
 * Background service worker for the Upwork Proposal Automator.
 * Handles: message routing, API calls, notifications, feed checking.
 */

'use strict';

importScripts('../lib/constants.js', '../lib/storage.js', '../lib/api.js');

// ---- Helpers ----

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendToContentScript(message) {
  const tab = await getActiveTab();
  if (!tab) throw new Error('No active tab found.');
  return chrome.tabs.sendMessage(tab.id, message);
}

async function loadFilters() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['jobFilters', 'notificationsEnabled'], (result) => {
      resolve({
        filters: result.jobFilters || null,
        notificationsEnabled: result.notificationsEnabled || false
      });
    });
  });
}

// ---- Follow-up Notification System ----

/**
 * In-memory guard: tracks which follow-up IDs we have already notified within
 * the current service-worker lifetime so a transient failure to mark a row
 * as 'expired' on the backend doesn't cause duplicate notifications during
 * the same session.  (The backend status='expired' update is the durable
 * guard; this is belt-and-suspenders.)
 *
 * Map<followupId (string), notifiedAt (number ms epoch)>
 */
const _fuNotifiedCache = new Map();
const _FU_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Map<notificationId (string), followupRow (object)>
 * Populated by checkDueFollowUps when each individual notification is created
 * so that onButtonClicked can look up the right message text and metadata.
 * Entries are removed when the notification is cleared.
 */
const _fuRowsByNotifId = new Map();

/**
 * Check for scheduled follow-ups that are now due and fire desktop
 * notifications for them.  Called by the 'upa-followup-check' alarm.
 */
async function checkDueFollowUps() {
  const settings = await getSettings();
  if (!settings.accessToken) {
    console.log('[follow-ups] No access token — skipping check (user not logged in)');
    return;
  }

  const backendUrl = settings.backendUrl; // already has trailing slash stripped

  // Derive the dashboard URL from the backend URL.
  // MVP heuristic: replace the port number with 3003.
  // e.g. http://localhost:3002  ->  http://localhost:3003
  const dashboardUrl = backendUrl.replace(/:\d+$/, ':3003');

  // Fetch scheduled follow-ups
  let rows;
  try {
    const res = await fetch(backendUrl + '/api/v1/follow-ups?status=scheduled', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.accessToken
      }
    });
    if (!res.ok) {
      console.warn('[follow-ups] GET /api/v1/follow-ups returned', res.status);
      return;
    }
    const payload = await res.json();
    // The backend may wrap results in { data: [...] } or return a bare array
    rows = Array.isArray(payload) ? payload : (payload.data || payload.followUps || []);
  } catch (err) {
    console.warn('[follow-ups] Failed to fetch follow-ups:', err);
    return;
  }

  const now = new Date();

  // Filter: only rows whose scheduledAt is on or before now
  const due = rows.filter((r) => {
    if (!r.scheduledAt) return false;
    return new Date(r.scheduledAt) <= now;
  });

  if (due.length === 0) return;

  // Apply in-memory de-dupe cache
  const nowMs = Date.now();
  const freshDue = due.filter((r) => {
    const rowId = String(r.id);
    const notifiedAt = _fuNotifiedCache.get(rowId);
    if (notifiedAt && (nowMs - notifiedAt) < _FU_CACHE_TTL_MS) {
      console.log('[follow-ups] Skipping already-notified row', rowId);
      return false;
    }
    return true;
  });

  if (freshDue.length === 0) return;

  // Fire notifications
  if (freshDue.length === 1) {
    const row = freshDue[0];
    const jobTitle = row.jobTitle || row.job_title || 'Follow-up due';
    const preview = (row.messageText || row.message_text || '').slice(0, 100);
    const notifId = 'fu-' + row.id;
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Follow-up due: ' + jobTitle,
      message: preview || 'Open dashboard to send your follow-up.',
      buttons: [{ title: 'Send on Upwork now' }],
      requireInteraction: true,
      priority: 1
    });
    _fuRowsByNotifId.set(notifId, row);
    _fuNotifiedCache.set(String(row.id), nowMs);
  } else {
    chrome.notifications.create('fu-summary', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: freshDue.length + ' follow-ups due',
      message: 'Open dashboard to send them.',
      priority: 1
    });
    freshDue.forEach((r) => _fuNotifiedCache.set(String(r.id), nowMs));
  }

  // Mark each due row as expired on the backend so it doesn't re-notify.
  // Failures are non-fatal — log and continue.
  await Promise.all(
    due.map((r) =>
      fetch(backendUrl + '/api/v1/follow-ups/' + r.id, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.accessToken
        },
        body: JSON.stringify({ status: 'expired' })
      }).catch((err) => {
        console.warn('[follow-ups] Failed to mark follow-up', r.id, 'as expired:', err);
      })
    )
  );
}

// ---- Follow-up injection into active Upwork tab ----

/**
 * Upwork message URL patterns we search for when looking for an open thread.
 */
const UPWORK_MESSAGE_URL_PATTERNS = [
  'https://www.upwork.com/messages/*',
  'https://www.upwork.com/ab/messages/*',
  'https://www.upwork.com/nx/messages/*',
];

/**
 * Find an open Upwork message tab and ask the follow-up-injector content
 * script to pre-fill the composer with the follow-up message text.
 *
 * If no message tab is open, navigate to /ab/messages/ as a fallback so the
 * user can click into the right thread manually (the paste path).
 *
 * @param {object} followup - The follow-up row from the backend.
 */
async function injectIntoUpworkTab(followup) {
  const messageText = followup.messageText || followup.message_text || '';
  if (!messageText.trim()) {
    console.warn('[follow-ups] injectIntoUpworkTab: no messageText on row', followup.id);
    return;
  }

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: UPWORK_MESSAGE_URL_PATTERNS });
  } catch (err) {
    console.warn('[follow-ups] tabs.query failed:', err);
  }

  if (tabs.length > 0) {
    const tab = tabs[0];

    // Bring the tab into focus
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (err) {
      console.warn('[follow-ups] Could not activate tab:', err);
    }

    // Ask the content script to inject
    try {
      chrome.tabs.sendMessage(
        tab.id,
        {
          type: 'INJECT_FOLLOWUP',
          payload: {
            messageText,
            jobUrl: followup.jobUrl || followup.job_url || undefined,
            jobTitle: followup.jobTitle || followup.job_title || undefined,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            // Content script not present (page not yet reloaded, etc.) — fall through
            console.warn('[follow-ups] sendMessage error — content script may not be loaded:', chrome.runtime.lastError.message);
            return;
          }
          if (response && !response.ok) {
            console.warn('[follow-ups] Injector could not find composer element:', response.reason);
          }
        }
      );
    } catch (err) {
      console.warn('[follow-ups] sendMessage threw:', err);
    }
    return;
  }

  // No open message tab — open /ab/messages/ and let the user navigate to the right thread.
  // The injector will be injected when the page loads, but without a pre-targeted thread URL
  // we can't auto-select the conversation, so this is the manual backstop.
  console.log('[follow-ups] No Upwork message tab open — opening /ab/messages/ as fallback');
  try {
    await chrome.tabs.create({ url: 'https://www.upwork.com/ab/messages/' });
  } catch (err) {
    console.warn('[follow-ups] Could not open Upwork messages tab:', err);
  }
}

// ---- Notification button click ----

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  // Only handle our per-follow-up notifications (not the summary)
  if (!notifId.startsWith('fu-') || notifId === 'fu-summary') return;
  if (btnIdx !== 0) return; // only the "Send on Upwork now" button (index 0)

  const followup = _fuRowsByNotifId.get(notifId);
  if (!followup) {
    console.warn('[follow-ups] onButtonClicked: no row cached for', notifId);
    return;
  }

  try {
    await injectIntoUpworkTab(followup);
  } catch (err) {
    console.warn('[follow-ups] injectIntoUpworkTab failed:', err);
  }

  chrome.notifications.clear(notifId, () => {
    _fuRowsByNotifId.delete(notifId);
  });
});

// ---- Feed Notification System ----

async function checkForNewJobs() {
  const { filters, notificationsEnabled } = await loadFilters();
  if (!notificationsEnabled || !filters || !filters.enabled) return;

  try {
    // Open Upwork feed in a background tab, scrape, then close
    const tab = await chrome.tabs.create({
      url: 'https://www.upwork.com/nx/find-work/best-matches',
      active: false
    });

    // Wait for page to fully load (instead of arbitrary timeout)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Tab load timed out after 30s'));
      }, 30000);

      function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          // Brief delay for JS frameworks to render content
          setTimeout(resolve, 2000);
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Inject scraper and get jobs
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // This runs in the page context — scrape job cards
        const cards = document.querySelectorAll('section[data-test="job-tile"], article[data-ev-job-uid]');
        return Array.from(cards).map(card => {
          const titleEl = card.querySelector('a[data-test="job-title"]');
          const title = titleEl ? titleEl.textContent.trim() : '';
          const url = titleEl ? titleEl.href : '';
          const uid = card.getAttribute('data-ev-job-uid') || url;
          const descEl = card.querySelector('.air3-line-clamp-wrapper p, .job-tile-description');
          const desc = descEl ? descEl.textContent.trim() : '';
          const budgetEl = card.querySelector('[data-test="is-fixed-price"] strong, [data-test="is-hourly"] strong');
          const budget = budgetEl ? budgetEl.textContent.trim() : '';
          const skillEls = card.querySelectorAll('.air3-badge, [data-test="token"] span');
          const skills = Array.from(skillEls).map(s => s.textContent.trim()).filter(Boolean);
          return { uid, title, url, desc, budget, skills };
        });
      }
    });

    // Close the background tab
    await chrome.tabs.remove(tab.id);

    if (!results || !results[0] || !results[0].result) return;
    const jobs = results[0].result;

    // Get previously seen job IDs
    const { seenJobIds = [] } = await chrome.storage.local.get('seenJobIds');
    const seenSet = new Set(seenJobIds);

    // Filter for new matching jobs
    const newMatches = [];
    for (const job of jobs) {
      if (seenSet.has(job.uid)) continue;

      // Basic filter matching
      let matches = true;
      const titleDesc = (job.title + ' ' + job.desc).toLowerCase();

      if (filters.keywordsInclude && filters.keywordsInclude.length > 0) {
        const hasKeyword = filters.keywordsInclude.some(kw => titleDesc.includes(kw.toLowerCase()));
        if (!hasKeyword) matches = false;
      }
      if (filters.keywordsExclude && filters.keywordsExclude.length > 0) {
        const hasExcluded = filters.keywordsExclude.some(kw => titleDesc.includes(kw.toLowerCase()));
        if (hasExcluded) matches = false;
      }
      if (filters.skillsInclude && filters.skillsInclude.length > 0) {
        const jobSkillsLower = job.skills.map(s => s.toLowerCase());
        const hasSkill = filters.skillsInclude.some(s => jobSkillsLower.includes(s.toLowerCase()));
        if (!hasSkill) matches = false;
      }

      if (matches) newMatches.push(job);
    }

    // Update seen IDs (keep last 500)
    const allIds = [...seenJobIds, ...jobs.map(j => j.uid)];
    await chrome.storage.local.set({ seenJobIds: allIds.slice(-500) });

    // Send notifications for matches
    for (const job of newMatches.slice(0, 3)) { // max 3 notifications at a time
      chrome.notifications.create(job.url, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'New Matching Job',
        message: job.title || 'New job on Upwork',
        priority: 1
      });
    }
  } catch (err) {
    console.error('[Service Worker] Feed check error:', err);
  }
}

// ---- Alarms ----

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkFeed') {
    checkForNewJobs();
  }
  if (alarm.name === 'upa-followup-check') {
    checkDueFollowUps().catch((err) => console.warn('[follow-up alarm] failed', err));
  }
});

// ---- Notification click ----

chrome.notifications.onClicked.addListener(async (notificationId) => {
  // Follow-up notifications — open the dashboard /follow-ups page
  if (notificationId.startsWith('fu-')) {
    try {
      const settings = await getSettings();
      const backendUrl = settings.backendUrl || BACKEND_URL_DEFAULT;
      // MVP heuristic: swap the port to 3003 for the dashboard
      const dashboardUrl = backendUrl.replace(/:\d+$/, ':3003');
      chrome.tabs.create({ url: dashboardUrl + '/follow-ups' });
    } catch (err) {
      console.warn('[follow-ups] Could not open dashboard on notification click:', err);
    }
    chrome.notifications.clear(notificationId, () => {
      _fuRowsByNotifId.delete(notificationId);
    });
    return;
  }

  // Feed job notifications — notificationId is the job URL
  if (notificationId.startsWith('http')) {
    chrome.tabs.create({ url: notificationId });
  }
  chrome.notifications.clear(notificationId);
});

// ---- Startup/Install handlers ----

/**
 * Register the follow-up check alarm.
 * Uses 'create' with the same name — Chrome deduplicates by name, so calling
 * this on both onInstalled and onStartup is safe and ensures the alarm
 * survives browser restarts.
 */
function _registerFollowUpAlarm() {
  chrome.alarms.create('upa-followup-check', {
    delayInMinutes: 1,     // first fire 1 minute after registration
    periodInMinutes: 60    // then every 60 minutes
  });
}

chrome.runtime.onStartup.addListener(() => {
  console.log('[Service Worker] Browser started — re-registering alarms');
  _registerFollowUpAlarm();
});

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Service Worker] Extension installed/updated');

  // Register the follow-up check alarm
  _registerFollowUpAlarm();

  // Resume notification alarm and sync filters if previously enabled
  try {
    const settings = await getSettings();
    if (!settings.accessToken) return;

    const res = await apiFetch('/api/v1/settings');
    if (res.ok) {
      const data = await res.json();
      // Sync filters for checkForNewJobs()
      chrome.storage.sync.set({
        jobFilters: {
          enabled: true,
          skillsInclude: data.skills_include || [],
          keywordsInclude: data.keywords_include || [],
          keywordsExclude: data.keywords_exclude || [],
          budgetMin: data.budget_min || null,
          budgetMax: data.budget_max || null,
        }
      });
      if (data.notification_enabled) {
        chrome.alarms.create('checkFeed', {
          periodInMinutes: data.notification_interval || 15
        });
        console.log('[Service Worker] Notification alarm resumed');
      }
    }
  } catch (err) {
    console.warn('[Service Worker] Could not resume notifications:', err);
  }
});

// ---- Message listener ----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type } = message;

  switch (type) {
    // ------------------------------------------------------------------
    case 'GENERATE_PROPOSAL': {
      (async () => {
        try {
          const settings = await getSettings();
          if (!settings.accessToken) {
            sendResponse({ success: false, error: 'Not logged in. Open extension settings to log in.' });
            return;
          }
          const payload = {
            jobData: message.jobData || {},
            templateContent: message.templateContent || null,
            extraInstruction: message.extraInstruction || null,
            existingProposal: message.existingProposal || null,
            selectedProjects: message.selectedProjects || null,
            platform: message.platform || 'upwork'
          };
          const response = await apiFetch('/api/v1/generate-proposal', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            sendResponse({ success: false, error: `Backend returned ${response.status}: ${errorText}` });
            return;
          }
          const data = await response.json();
          sendResponse({ success: true, data });
        } catch (err) {
          sendResponse({ success: false, error: err.message || 'Failed to generate proposal.' });
        }
      })();
      return true;
    }

    // ------------------------------------------------------------------
    case 'ANALYZE_PROPOSAL': {
      (async () => {
        try {
          const settings = await getSettings();
          if (!settings.accessToken) {
            sendResponse({ success: false, error: 'Not logged in. Open extension settings to log in.' });
            return;
          }
          const payload = {
            coverLetter: message.coverLetter,
            jobTitle: message.jobTitle || '',
            jobDescription: message.jobDescription || '',
            jobSkills: message.jobSkills || []
          };
          const response = await apiFetch('/api/v1/analyze-proposal', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            sendResponse({ success: false, error: `Backend returned ${response.status}: ${errorText}` });
            return;
          }
          const data = await response.json();
          sendResponse({ success: true, data });
        } catch (err) {
          sendResponse({ success: false, error: err.message || 'Failed to analyze proposal.' });
        }
      })();
      return true;
    }

    // ------------------------------------------------------------------
    case 'GENERATE_MESSAGE': {
      (async () => {
        try {
          const settings = await getSettings();
          if (!settings.accessToken) {
            sendResponse({ success: false, error: 'Not logged in. Open extension settings to log in.' });
            return;
          }
          const payload = {
            conversationHistory: message.conversationHistory || [],
            jobTitle: message.jobTitle || '',
            tone: message.tone || 'professional',
            question: message.question || null
          };
          const response = await apiFetch('/api/v1/generate-message', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            sendResponse({ success: false, error: `Backend returned ${response.status}: ${errorText}` });
            return;
          }
          const data = await response.json();
          sendResponse({ success: true, data });
        } catch (err) {
          sendResponse({ success: false, error: err.message || 'Failed to generate message.' });
        }
      })();
      return true;
    }

    // ------------------------------------------------------------------
    case 'ENABLE_FEED_NOTIFICATIONS': {
      (async () => {
        try {
          const enabled = message.enabled;
          await chrome.storage.sync.set({ notificationsEnabled: enabled });
          if (enabled) {
            chrome.alarms.create('checkFeed', { periodInMinutes: message.intervalMinutes || 5 });
            sendResponse({ success: true, data: { message: 'Feed notifications enabled' } });
          } else {
            chrome.alarms.clear('checkFeed');
            sendResponse({ success: true, data: { message: 'Feed notifications disabled' } });
          }
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    // ------------------------------------------------------------------
    case 'CHECK_PROPOSAL_RESPONSES': {
      (async () => {
        try {
          const settings = await getSettings();
          if (!settings.accessToken) {
            sendResponse({ success: false, error: 'Not logged in' });
            return;
          }
          // Fetch recent sent proposals
          const res = await apiFetch('/api/v1/proposals?status=sent&limit=50');
          if (!res.ok) {
            sendResponse({ success: false, error: 'Failed to fetch proposals' });
            return;
          }
          const proposals = await res.json();
          const threads = message.threads || [];

          // Match threads against proposals by job title similarity
          const matches = [];
          for (const thread of threads) {
            if (!thread.hasUnread) continue;
            const threadTitle = (thread.title || '').toLowerCase();
            for (const prop of proposals) {
              const jobTitle = (prop.job_title || '').toLowerCase();
              // Fuzzy match: thread title contains significant part of job title or vice versa
              if (jobTitle.length > 5 && (threadTitle.includes(jobTitle) || jobTitle.includes(threadTitle))) {
                matches.push({ proposalId: prop.id, jobTitle: prop.job_title, client: thread.client });
                break;
              }
            }
          }

          // Notify for matches (max 3)
          for (const match of matches.slice(0, 3)) {
            chrome.notifications.create('response-' + match.proposalId, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Client Responded!',
              message: `${match.client || 'A client'} responded to "${match.jobTitle}"`,
              priority: 2,
            });
          }

          sendResponse({ success: true, data: { matched: matches.length } });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    // ------------------------------------------------------------------
    case 'RELAY_TO_CONTENT': {
      (async () => {
        try {
          const result = await sendToContentScript(message.payload || {});
          sendResponse({ success: true, data: result });
        } catch (err) {
          sendResponse({ success: false, error: err.message || String(err) });
        }
      })();
      return true;
    }

    // ------------------------------------------------------------------
    case 'GET_SETTINGS': {
      (async () => {
        try {
          const settings = await getSettings();
          sendResponse({ success: true, data: {
            backendUrl: settings.backendUrl,
            defaultRate: settings.defaultRate,
            loggedIn: !!settings.accessToken,
            userEmail: settings.userEmail
          }});
        } catch (err) {
          sendResponse({ success: false, error: err.message || String(err) });
        }
      })();
      return true;
    }

    // ------------------------------------------------------------------
    default:
      return false;
  }
});
