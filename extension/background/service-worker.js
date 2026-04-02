/**
 * service-worker.js
 * Background service worker for the Upwork Proposal Automator.
 * Handles: message routing, API calls, notifications, feed checking.
 */

'use strict';

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

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ['provider', 'apiKey', 'backendUrl', 'defaultRate'],
      (result) => {
        resolve({
          provider: result.provider || 'anthropic',
          apiKey: result.apiKey || '',
          backendUrl: result.backendUrl || 'http://localhost:3002',
          defaultRate: result.defaultRate || 50
        });
      }
    );
  });
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

    // Wait for page to load
    await new Promise(r => setTimeout(r, 10000));

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
});

// ---- Notification click ----

chrome.notifications.onClicked.addListener((notificationId) => {
  // notificationId is the job URL
  if (notificationId.startsWith('http')) {
    chrome.tabs.create({ url: notificationId });
  }
  chrome.notifications.clear(notificationId);
});

// ---- Install handler ----

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Service Worker] Extension installed/updated');
});

// ---- Message listener ----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type } = message;

  switch (type) {
    // ------------------------------------------------------------------
    case 'GENERATE_PROPOSAL': {
      (async () => {
        try {
          const settings = await loadSettings();
          if (!settings.apiKey) {
            sendResponse({ success: false, error: 'No API key configured.' });
            return;
          }
          const backendUrl = (settings.backendUrl || 'http://localhost:3002').replace(/\/$/, '');
          const payload = {
            jobData: message.jobData || {},
            provider: settings.provider,
            apiKey: settings.apiKey,
            templateContent: message.templateContent || null,
            extraInstruction: message.extraInstruction || null,
            existingProposal: message.existingProposal || null,
            selectedProjects: message.selectedProjects || null,
            platform: message.platform || 'upwork'
          };
          const response = await fetch(`${backendUrl}/api/generate-proposal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    case 'GENERATE_MESSAGE': {
      (async () => {
        try {
          const settings = await loadSettings();
          if (!settings.apiKey) {
            sendResponse({ success: false, error: 'No API key configured.' });
            return;
          }
          const backendUrl = (settings.backendUrl || 'http://localhost:3002').replace(/\/$/, '');
          const payload = {
            conversationHistory: message.conversationHistory || [],
            jobTitle: message.jobTitle || '',
            tone: message.tone || 'professional',
            question: message.question || null,
            provider: settings.provider,
            apiKey: settings.apiKey
          };
          const response = await fetch(`${backendUrl}/api/generate-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
          const settings = await loadSettings();
          sendResponse({ success: true, data: settings });
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
