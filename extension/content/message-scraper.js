/**
 * message-scraper.js
 * Scrapes conversation context from Upwork message/interview pages.
 * Loaded as a content script — vanilla JS, no modules, no throws.
 */

/**
 * Safely get trimmed text content from an element.
 * @param {Element|null} el
 * @returns {string}
 */
function msgGetText(el) {
  if (!el) return '';
  return (el.innerText || el.textContent || '').trim();
}

/**
 * Try a list of CSS selectors in order, returning the first matching element.
 * @param {string[]} selectors
 * @param {Element} [root]
 * @returns {Element|null}
 */
function msgQueryFirst(selectors, root) {
  var scope = root || document;
  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = scope.querySelector(selectors[i]);
      if (el) return el;
    } catch (e) { /* bad selector — skip */ }
  }
  return null;
}

/**
 * Try a list of CSS selectors and return all matching elements from the first
 * selector that yields results.
 * @param {string[]} selectors
 * @param {Element} [root]
 * @returns {NodeList|Element[]}
 */
function msgQueryAll(selectors, root) {
  var scope = root || document;
  for (var i = 0; i < selectors.length; i++) {
    try {
      var els = scope.querySelectorAll(selectors[i]);
      if (els && els.length > 0) return els;
    } catch (e) { /* bad selector — skip */ }
  }
  return [];
}

/**
 * Determine whether a message element was sent by the current user.
 * Upwork typically marks outgoing messages with classes or data attributes.
 * @param {Element} msgEl
 * @returns {'me'|'client'}
 */
function detectSender(msgEl) {
  var cls = (msgEl.className || '') + ' ' + (msgEl.getAttribute('data-sender') || '');

  // Class-based signals used by Upwork
  var mePatterns = [
    'is-from-current-user',
    'outgoing',
    'from-me',
    'sent',
    'mine',
    'air3-message--outgoing',
  ];

  for (var i = 0; i < mePatterns.length; i++) {
    if (cls.toLowerCase().indexOf(mePatterns[i]) !== -1) return 'me';
  }

  // Check parent containers as well
  var parent = msgEl.parentElement;
  while (parent && parent !== document.body) {
    var pCls = (parent.className || '').toLowerCase();
    for (var j = 0; j < mePatterns.length; j++) {
      if (pCls.indexOf(mePatterns[j]) !== -1) return 'me';
    }
    parent = parent.parentElement;
  }

  return 'client';
}

/**
 * Scrape the current conversation thread.
 * Returns up to the last 10 messages, the client name, and the job title.
 *
 * @returns {{ clientName: string, jobTitle: string, messages: Array<{sender: 'me'|'client', text: string}> }}
 */
function scrapeConversation() {
  var result = { clientName: '', jobTitle: '', messages: [] };

  try {
    // --- Job title ---
    var titleEl = msgQueryFirst([
      '[data-test="room-title"]',
      '.room-name',
      '.thread-header-title',
      '.air3-message-thread-header h1',
      '.air3-message-thread-header h2',
      '.thread-title',
      '[data-cy="room-name"]',
      '.nav-header-title',
      '.conversation-title',
    ]);
    if (titleEl) result.jobTitle = msgGetText(titleEl);

    // --- Client name ---
    var clientEl = msgQueryFirst([
      '[data-test="participant-name"]',
      '.participant-name',
      '.thread-header-name',
      '.air3-message-header-name',
      '.client-name',
      '[data-cy="participant-name"]',
    ]);
    if (clientEl) result.clientName = msgGetText(clientEl);

    // --- Messages ---
    var messageEls = msgQueryAll([
      '[data-test="message"]',
      '.air3-message',
      '.thread-message',
      '.message-item',
      '.msg-item',
      '[data-cy="message"]',
      '.thread-messages .message',
      '.messages-list .message',
    ]);

    var parsed = [];
    for (var i = 0; i < messageEls.length; i++) {
      var msgEl = messageEls[i];

      // Find the text body within the message element
      var bodyEl = msgQueryFirst([
        '[data-test="message-body"]',
        '.msg-body',
        '.message-body',
        '.air3-message-body',
        '.message-content',
        'p',
      ], msgEl) || msgEl;

      var text = msgGetText(bodyEl);
      if (!text) continue;

      parsed.push({
        sender: detectSender(msgEl),
        text: text,
      });
    }

    // Keep only the last 10 messages for context
    result.messages = parsed.slice(-10);
  } catch (e) {
    console.warn('[message-scraper] scrapeConversation error:', e);
  }

  return result;
}

/**
 * Scrape screening questions on proposal pages.
 *
 * @returns {Array<{ question: string, answerField: HTMLElement }>}
 */
function scrapeScreeningQuestions() {
  var results = [];

  try {
    // Containers that hold individual question blocks
    var containers = msgQueryAll([
      '[data-test="question"]',
      '.fe-proposal-job-questions .question',
      '.questions-area .question',
      '.screening-questions .question',
      '.proposal-questions li',
      '[data-cy="screening-question"]',
    ]);

    for (var i = 0; i < containers.length; i++) {
      var container = containers[i];

      // Find the question label
      var labelEl = msgQueryFirst([
        '[data-test="question-text"]',
        '.question-text',
        '.question-label',
        'label',
        'p',
        'span',
      ], container);

      var question = labelEl ? msgGetText(labelEl) : msgGetText(container);
      if (!question) continue;

      // Find the answer textarea
      var answerField = container.querySelector('textarea') ||
                        container.querySelector('input[type="text"]') ||
                        container.querySelector('[contenteditable="true"]');

      if (!answerField) continue;

      results.push({ question: question, answerField: answerField });
    }

    // Fallback: look for any labelled textareas on the page
    if (results.length === 0) {
      var textareas = document.querySelectorAll(
        '.fe-proposal-questions textarea, .proposal-questions textarea'
      );
      for (var j = 0; j < textareas.length; j++) {
        var ta = textareas[j];
        // Try to find a sibling/parent label
        var form = ta.closest('.question, .form-group, li, div[class*="question"]');
        var qText = '';
        if (form) {
          var lbl = form.querySelector('label, p, h4, h5, span.question-text');
          qText = lbl ? msgGetText(lbl) : '';
        }
        if (!qText) {
          var prev = ta.previousElementSibling;
          while (prev) {
            qText = msgGetText(prev);
            if (qText) break;
            prev = prev.previousElementSibling;
          }
        }
        if (qText) {
          results.push({ question: qText, answerField: ta });
        }
      }
    }
  } catch (e) {
    console.warn('[message-scraper] scrapeScreeningQuestions error:', e);
  }

  return results;
}

/**
 * Find the compose / reply textarea in the message thread.
 *
 * @returns {HTMLElement|null}
 */
function findComposeField() {
  var selectors = [
    'textarea[name="message"]',
    '[data-test="message-input"]',
    '[data-cy="message-input"]',
    '.msg-compose textarea',
    '.message-compose textarea',
    '.air3-textarea',
    '.compose-area textarea',
    '.reply-area textarea',
    '[placeholder*="message" i]',
    '[aria-label*="message" i]',
    'textarea',
  ];

  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = document.querySelector(selectors[i]);
      if (el && el.offsetParent !== null) return el; // must be visible
    } catch (e) { /* skip */ }
  }

  return null;
}
