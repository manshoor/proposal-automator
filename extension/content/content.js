/**
 * content.js
 * Main content script orchestrator.
 * Relies on scrapeJobPage, vetClient, detectHiddenInstructions, autofillProposal
 * all being loaded before this file (via manifest.json script order).
 */

(function () {
  'use strict';

  // URL guard — manifest now has a single unified content_scripts entry, so
  // every main bootstrap self-scopes to the URLs it was previously matched on.
  // This file's original entry covered job-detail + apply pages + feed (the
  // last because SPA nav from feed → job-detail must keep the script alive).
  var _CONTENT_PATTERNS = [
    /^https:\/\/www\.upwork\.com\/jobs\//,
    /^https:\/\/www\.upwork\.com\/(ab|nx)\/proposals\/job\//,
    /^https:\/\/www\.upwork\.com\/freelance-jobs\/apply\//,
    /^https:\/\/www\.upwork\.com\/nx\/find-work\//,
  ];
  if (!_CONTENT_PATTERNS.some(function (re) { return re.test(window.location.href); })) return;

  // ---- SPA navigation detection ----
  var _lastHref = window.location.href;
  var _navObserver = null;

  function _startContentNavWatch() {
    if (_navObserver) {
      _navObserver.disconnect();
      _navObserver = null;
    }
    _navObserver = new MutationObserver(function () {
      if (window.location.href !== _lastHref) {
        _lastHref = window.location.href;
        if (typeof clearScraperCache === 'function') {
          clearScraperCache();
        }
      }
    });
    _navObserver.observe(document.body, { childList: true, subtree: true });
  }

  _startContentNavWatch();

  try { if (typeof installErrorReporter === 'function') installErrorReporter('content-script'); } catch (e) { /* no-op */ }

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
              proposalCount: jobData.proposalCount,
              paymentVerified: jobData.client.paymentVerified,
              memberSince: jobData.client.memberSince,
              avgHourlyRate: jobData.client.avgHourlyRate,
              clientRating: jobData.client.clientRating,
              invitesSent: jobData.client.invitesSent,
              alreadyHired: jobData.client.alreadyHired,
              lastClientActivity: jobData.client.lastClientActivity
            }, jobData);

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

  // ---- Screening Questions Auto-Answer ----
  // Detect Q&A fields on proposal pages and add "AI Answer" buttons

  function injectScreeningQuestionButtons() {
    if (!isProposalPage()) return;

    // Wait for the questions area to load
    setTimeout(function () {
      var questionGroups = document.querySelectorAll('.fe-proposal-job-questions .form-group, .questions-area .form-group');
      if (questionGroups.length === 0) return;

      console.log('[Content] Found', questionGroups.length, 'screening questions');

      for (var i = 0; i < questionGroups.length; i++) {
        var group = questionGroups[i];
        if (group.getAttribute('data-upa-qa-injected')) continue;
        group.setAttribute('data-upa-qa-injected', 'true');

        var label = group.querySelector('label');
        var textarea = group.querySelector('textarea');
        if (!label || !textarea) continue;

        var questionText = (label.textContent || '').trim();
        if (!questionText) continue;

        // Create AI Answer button
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'AI Answer';
        btn.className = 'upa-qa-btn';
        btn.style.cssText = 'margin-left:8px;padding:2px 10px;font-size:11px;background:#7c3aed;color:#fff;border:none;border-radius:12px;cursor:pointer;vertical-align:middle;';
        btn.setAttribute('data-question', questionText);

        (function (questionStr, textareaEl, buttonEl) {
          buttonEl.addEventListener('click', function () {
            buttonEl.textContent = 'Generating...';
            buttonEl.disabled = true;

            // Get job data for context
            scrapeJobPage().then(function (jobData) {
              chrome.runtime.sendMessage({
                type: 'GENERATE_MESSAGE',
                conversationHistory: [],
                jobTitle: jobData.title || '',
                question: questionStr,
                tone: 'professional'
              }, function (response) {
                if (response && response.success && response.data && response.data.reply) {
                  // Fill textarea with React-compatible method
                  textareaEl.focus();
                  if (textareaEl.select) textareaEl.select();
                  var inserted = document.execCommand('insertText', false, response.data.reply);
                  if (!inserted || textareaEl.value !== response.data.reply) {
                    var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
                    if (setter && setter.set) setter.set.call(textareaEl, response.data.reply);
                    textareaEl.dispatchEvent(new Event('input', { bubbles: true }));
                    textareaEl.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  buttonEl.textContent = 'Done!';
                  buttonEl.style.background = '#22c55e';
                } else {
                  buttonEl.textContent = 'Failed';
                  buttonEl.style.background = '#ef4444';
                  console.error('[Content] Q&A error:', response && response.error);
                }
                setTimeout(function () {
                  buttonEl.textContent = 'AI Answer';
                  buttonEl.style.background = '#7c3aed';
                  buttonEl.disabled = false;
                }, 3000);
              });
            });
          });
        })(questionText, textarea, btn);

        label.appendChild(btn);
      }
    }, 2000); // Wait for proposal page to render
  }

  // Run on load and on SPA navigation
  injectScreeningQuestionButtons();

})();
