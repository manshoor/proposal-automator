/**
 * content.js
 * Main content script orchestrator.
 * Relies on scrapeJobPage, vetClient, detectHiddenInstructions, autofillProposal
 * all being loaded before this file (via manifest.json script order).
 */

(function () {
  'use strict';

  // ---- SPA navigation detection ----
  var _lastHref = window.location.href;

  var _navObserver = new MutationObserver(function () {
    if (window.location.href !== _lastHref) {
      _lastHref = window.location.href;
      if (typeof clearScraperCache === 'function') {
        clearScraperCache();
      }
    }
  });

  _navObserver.observe(document.body, { childList: true, subtree: true });

  console.log('[Upwork Proposal Automator] Content script loaded on:', window.location.href);

  // ---- Message handler ----
  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    var type = message.type;

    switch (type) {
      case 'GET_JOB_DATA': {
        scrapeJobPage()
          .then(function (data) {
            sendResponse({ success: true, data: data });
          })
          .catch(function (err) {
            console.error('[Content] GET_JOB_DATA error:', err);
            sendResponse({ success: false, error: err.message || String(err) });
          });
        return true; // async response
      }

      case 'GET_VETTING': {
        scrapeJobPage()
          .then(function (jobData) {
            var vetting = vetClient({
              location: jobData.client.location,
              totalSpent: jobData.client.totalSpent,
              hireRate: jobData.client.hireRate,
              hireCount: jobData.client.hireCount || 0,
              reviewCount: jobData.client.reviewCount,
              recentReviews: jobData.client.recentReviews,
              proposalCount: jobData.proposalCount
            });

            var hiddenInstructions = detectHiddenInstructions(jobData.description);

            console.log('[Content] Vetting result:', vetting);
            console.log('[Content] Hidden instructions:', hiddenInstructions);

            sendResponse({
              success: true,
              data: {
                jobData: jobData,
                vetting: vetting,
                hiddenInstructions: hiddenInstructions
              }
            });
          })
          .catch(function (err) {
            console.error('[Content] GET_VETTING error:', err);
            sendResponse({ success: false, error: err.message || String(err) });
          });
        return true;
      }

      case 'AUTOFILL_PROPOSAL': {
        if (!message.data) {
          sendResponse({ success: false, error: 'No autofill data provided.' });
          return false;
        }
        // autofillProposal is async (milestones need await)
        autofillProposal(message.data)
          .then(function (result) {
            sendResponse({ success: true, data: result });
          })
          .catch(function (err) {
            console.error('[Content] AUTOFILL error:', err);
            sendResponse({ success: false, error: err.message || String(err) });
          });
        return true; // async response
      }

      case 'RESCRAPE': {
        if (typeof clearScraperCache === 'function') {
          clearScraperCache();
        }
        scrapeJobPage()
          .then(function (data) {
            sendResponse({ success: true, data: data });
          })
          .catch(function (err) {
            console.error('[Content] RESCRAPE error:', err);
            sendResponse({ success: false, error: err.message || String(err) });
          });
        return true;
      }

      default:
        return false;
    }
  });
})();
