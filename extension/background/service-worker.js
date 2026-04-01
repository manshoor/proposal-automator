/**
 * service-worker.js
 * Background service worker for the Upwork Proposal Automator.
 * Handles message routing, API calls to the backend, and settings retrieval.
 */

'use strict';

// ---- Helpers ----

/**
 * Get the currently active tab.
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

/**
 * Send a message to the content script in the active tab.
 * @param {object} message
 * @returns {Promise<any>}
 */
async function sendToContentScript(message) {
  const tab = await getActiveTab();
  if (!tab) throw new Error('No active tab found.');
  return chrome.tabs.sendMessage(tab.id, message);
}

/**
 * Retrieve settings from chrome.storage.sync.
 * Mirrors the getSettings() helper from storage.js but usable in the service worker
 * (content scripts share the page scope; service workers cannot load content scripts).
 * @returns {Promise<{ provider: string, apiKey: string, backendUrl: string, defaultRate: number }>}
 */
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

// ---- Message listener ----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type } = message;

  switch (type) {
    // ------------------------------------------------------------------
    // GENERATE_PROPOSAL — call backend with job data + user settings
    // ------------------------------------------------------------------
    case 'GENERATE_PROPOSAL': {
      (async () => {
        try {
          const settings = await loadSettings();

          if (!settings.apiKey) {
            sendResponse({
              success: false,
              error: 'No API key configured. Please open the settings page and add your API key.'
            });
            return;
          }

          const backendUrl = (settings.backendUrl || 'http://localhost:3002').replace(/\/$/, '');
          const endpoint = `${backendUrl}/api/generate-proposal`;

          const payload = {
            jobData: message.jobData || {},
            provider: settings.provider,
            apiKey: settings.apiKey,
            templateContent: message.templateContent || null,
            extraInstruction: message.extraInstruction || null,
            existingProposal: message.existingProposal || null
          };

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            sendResponse({
              success: false,
              error: `Backend returned ${response.status}: ${errorText}`
            });
            return;
          }

          const data = await response.json();
          sendResponse({ success: true, data });
        } catch (err) {
          sendResponse({
            success: false,
            error: err.message || 'Failed to generate proposal. Is the backend running?'
          });
        }
      })();
      // Return true to keep the message channel open for the async response
      return true;
    }

    // ------------------------------------------------------------------
    // RELAY_TO_CONTENT — forward an arbitrary message to the active tab
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
    // GET_SETTINGS — return settings from chrome.storage.sync
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
