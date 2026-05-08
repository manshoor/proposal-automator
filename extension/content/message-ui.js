/**
 * message-ui.js
 * Injects the AI Message Copilot UI into Upwork message/interview pages.
 * Vanilla JS only — no modules, no frameworks.
 * Depends on: message-scraper.js (loaded before this file via manifest.json).
 */

(function () {
  'use strict';

  // ---- Constants ----

  var PANEL_ID = 'upa-copilot-panel';
  var BTN_ID = 'upa-copilot-trigger-btn';
  var QA_BTN_CLASS = 'upa-qa-btn';

  // ---- React-compatible value setter (mirrors autofill.js) ----

  function setNativeValueMsg(element, value) {
    var setter = null;
    if (element.tagName === 'TEXTAREA') {
      setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    }
    if (!setter || !setter.set) {
      setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    }
    if (setter && setter.set) {
      setter.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function forceSetValueMsg(element, value) {
    element.focus();
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.select ? element.select() : document.execCommand('selectAll');
    var inserted = document.execCommand('insertText', false, value);
    if (!inserted || element.value !== value) {
      setNativeValueMsg(element, value);
    }
    if (element.value !== value) {
      element.value = value;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ---- Backend call ----

  function generateMessage(payload, onSuccess, onError) {
    // apiFetch is available via lib/api.js loaded in manifest
    isLoggedIn().then(function (loggedIn) {
      if (!loggedIn) {
        onError('Not logged in. Open the extension settings to log in.');
        return;
      }
      apiFetch('/api/v1/generate-message', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (errBody) {
              throw new Error((errBody.error && errBody.error.message) || ('Backend error ' + res.status));
            }).catch(function () {
              throw new Error('Backend error ' + res.status);
            });
          }
          return res.json();
        })
        .then(function (data) {
          if (data && data.reply) {
            onSuccess(data.reply);
          } else {
            onError('No reply returned from backend.');
          }
        })
        .catch(function (err) {
          onError(err.message || 'Failed to reach backend. Is it running?');
        });
    });
  }

  // ---- Panel builder ----

  function buildPanel() {
    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'upa-copilot-panel';

    panel.innerHTML = [
      '<div class="upa-copilot-header">',
        '<div class="upa-copilot-header-title">',
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
            '<path d="M12 2a7 7 0 0 1 7 7c0 2.6-1.4 4.9-3.5 6.2L15 19H9l-.5-3.8C6.4 13.9 5 11.6 5 9a7 7 0 0 1 7-7z"/>',
            '<line x1="9" y1="22" x2="15" y2="22"/>',
          '</svg>',
          'AI Message Copilot',
        '</div>',
        '<button class="upa-copilot-close" title="Close">&#x2715;</button>',
      '</div>',
      '<div class="upa-copilot-body">',
        '<div>',
          '<div class="upa-tone-label">Tone</div>',
          '<div class="upa-tone-group">',
            '<button class="upa-tone-btn upa-tone-active" data-tone="professional">Professional</button>',
            '<button class="upa-tone-btn" data-tone="friendly">Friendly</button>',
            '<button class="upa-tone-btn" data-tone="brief">Brief</button>',
            '<button class="upa-tone-btn" data-tone="rate-negotiation">Rate Neg.</button>',
          '</div>',
        '</div>',
        '<button class="upa-generate-btn">',
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
            '<polygon points="5 3 19 12 5 21 5 3"/>',
          '</svg>',
          'Generate Reply',
        '</button>',
        '<div class="upa-spinner" id="upa-copilot-spinner"></div>',
        '<div class="upa-copilot-error" id="upa-copilot-error"></div>',
        '<div class="upa-copilot-preview-wrap" id="upa-copilot-preview-wrap">',
          '<textarea class="upa-copilot-preview" id="upa-copilot-preview" rows="5" placeholder="Generated reply will appear here..."></textarea>',
          '<div class="upa-action-row">',
            '<button class="upa-insert-btn">Insert</button>',
            '<button class="upa-regen-btn">Regenerate</button>',
          '</div>',
        '</div>',
      '</div>',
    ].join('');

    return panel;
  }

  // ---- Panel logic ----

  var _selectedTone = 'professional';

  function wirePanel(panel) {
    var closeBtn = panel.querySelector('.upa-copilot-close');
    var toneButtons = panel.querySelectorAll('.upa-tone-btn');
    var generateBtn = panel.querySelector('.upa-generate-btn');
    var insertBtn = panel.querySelector('.upa-insert-btn');
    var regenBtn = panel.querySelector('.upa-regen-btn');
    var spinner = panel.querySelector('.upa-spinner');
    var preview = panel.querySelector('.upa-copilot-preview');
    var previewWrap = panel.querySelector('.upa-copilot-preview-wrap');
    var errorEl = panel.querySelector('.upa-copilot-error');

    // Close
    closeBtn.addEventListener('click', function () {
      panel.style.display = 'none';
    });

    // Tone selection
    for (var i = 0; i < toneButtons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          for (var j = 0; j < toneButtons.length; j++) {
            toneButtons[j].classList.remove('upa-tone-active');
          }
          btn.classList.add('upa-tone-active');
          _selectedTone = btn.getAttribute('data-tone') || 'professional';
        });
      })(toneButtons[i]);
    }

    function setLoading(isLoading) {
      generateBtn.disabled = isLoading;
      regenBtn.disabled = isLoading;
      if (isLoading) {
        spinner.classList.add('upa-visible');
        errorEl.classList.remove('upa-visible');
      } else {
        spinner.classList.remove('upa-visible');
      }
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.add('upa-visible');
    }

    function doGenerate() {
      var conversation = { clientName: '', jobTitle: '', messages: [] };
      try {
        if (typeof scrapeConversation === 'function') {
          conversation = scrapeConversation();
        }
      } catch (e) { /* defensive */ }

      setLoading(true);
      previewWrap.classList.remove('upa-visible');

      generateMessage(
        {
          conversationHistory: conversation.messages,
          jobTitle: conversation.jobTitle || '',
          tone: _selectedTone,
        },
        function (reply) {
          setLoading(false);
          preview.value = reply;
          previewWrap.classList.add('upa-visible');
        },
        function (err) {
          setLoading(false);
          showError(err);
        }
      );
    }

    generateBtn.addEventListener('click', doGenerate);
    regenBtn.addEventListener('click', doGenerate);

    // Insert into compose field
    insertBtn.addEventListener('click', function () {
      var replyText = preview.value;
      if (!replyText) return;

      var composeField = null;
      try {
        if (typeof findComposeField === 'function') {
          composeField = findComposeField();
        }
      } catch (e) { /* defensive */ }

      if (!composeField) {
        showError('Compose field not found. Click inside the message box and try again.');
        return;
      }

      try {
        forceSetValueMsg(composeField, replyText);
      } catch (e) {
        showError('Could not insert text: ' + e.message);
        return;
      }

      panel.style.display = 'none';
    });
  }

  // ---- Trigger button ----

  function buildTriggerButton() {
    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.className = 'upa-copilot-btn';
    btn.title = 'AI Message Copilot';
    btn.innerHTML = [
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M12 2a7 7 0 0 1 7 7c0 2.6-1.4 4.9-3.5 6.2L15 19H9l-.5-3.8C6.4 13.9 5 11.6 5 9a7 7 0 0 1 7-7z"/>',
        '<line x1="9" y1="22" x2="15" y2="22"/>',
      '</svg>',
      'AI Reply',
    ].join('');
    return btn;
  }

  // ---- Q&A answer buttons for screening questions ----

  function injectQAButtons() {
    var questions = [];
    try {
      if (typeof scrapeScreeningQuestions === 'function') {
        questions = scrapeScreeningQuestions();
      }
    } catch (e) { /* defensive */ }

    if (!questions || questions.length === 0) return;

    for (var i = 0; i < questions.length; i++) {
      (function (item) {
        // Don't inject twice
        if (item.answerField.dataset.upaQaInjected) return;
        item.answerField.dataset.upaQaInjected = '1';

        var qaBtn = document.createElement('button');
        qaBtn.className = QA_BTN_CLASS;
        qaBtn.type = 'button';
        qaBtn.innerHTML = [
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
            '<polygon points="5 3 19 12 5 21 5 3"/>',
          '</svg>',
          'AI Answer',
        ].join('');

        qaBtn.addEventListener('click', function () {
          qaBtn.disabled = true;
          qaBtn.textContent = 'Generating...';

          var conversation = { jobTitle: '' };
          try {
            if (typeof scrapeConversation === 'function') {
              conversation = scrapeConversation();
            }
          } catch (e) { /* defensive */ }

          generateMessage(
            {
              question: item.question,
              jobTitle: conversation.jobTitle || '',
              tone: _selectedTone,
              conversationHistory: [],
            },
            function (reply) {
              try {
                forceSetValueMsg(item.answerField, reply);
              } catch (e) { /* defensive */ }
              qaBtn.disabled = false;
              qaBtn.innerHTML = [
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
                  '<polygon points="5 3 19 12 5 21 5 3"/>',
                '</svg>',
                'AI Answer',
              ].join('');
            },
            function (err) {
              qaBtn.disabled = false;
              qaBtn.title = err;
              qaBtn.innerHTML = [
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
                  '<polygon points="5 3 19 12 5 21 5 3"/>',
                '</svg>',
                'AI Answer',
              ].join('');
              console.warn('[message-ui] Q&A generation error:', err);
            }
          );
        });

        // Insert button after the textarea
        if (item.answerField.parentNode) {
          item.answerField.parentNode.insertBefore(qaBtn, item.answerField.nextSibling);
        }
      })(questions[i]);
    }
  }

  // ---- Main init ----

  function init() {
    // Avoid double-injection
    if (document.getElementById(BTN_ID)) return;

    var panel = buildPanel();
    wirePanel(panel);
    document.body.appendChild(panel);

    var triggerBtn = buildTriggerButton();
    document.body.appendChild(triggerBtn);

    triggerBtn.addEventListener('click', function () {
      var isVisible = panel.style.display !== 'none' && panel.style.display !== '';
      panel.style.display = isVisible ? 'none' : 'block';
    });

    // Inject Q&A buttons for screening questions (proposal pages)
    injectQAButtons();
  }

  // ---- Wait for compose field before injecting (SPA-safe) ----

  function waitForComposeThenInit(timeout) {
    timeout = timeout || 12000;
    var deadline = Date.now() + timeout;

    var observer = new MutationObserver(function () {
      var composeField = null;
      try {
        if (typeof findComposeField === 'function') {
          composeField = findComposeField();
        }
      } catch (e) { /* defensive */ }

      if (composeField || Date.now() >= deadline) {
        observer.disconnect();
        init();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also try immediately in case the field is already present
    var immediateField = null;
    try {
      if (typeof findComposeField === 'function') {
        immediateField = findComposeField();
      }
    } catch (e) { /* defensive */ }

    if (immediateField) {
      observer.disconnect();
      init();
      return;
    }

    // Timeout safety: inject even if compose field never appears
    // (e.g. interview pages that only show questions)
    setTimeout(function () {
      observer.disconnect();
      if (!document.getElementById(BTN_ID)) {
        init();
      }
    }, timeout);
  }

  // ---- SPA re-init on navigation ----

  var _lastMsgHref = window.location.href;
  var _navObserverMsg = null;

  function _startNavWatch() {
    // Disconnect any previous observer to prevent duplicates
    if (_navObserverMsg) {
      _navObserverMsg.disconnect();
      _navObserverMsg = null;
    }
    _navObserverMsg = new MutationObserver(function () {
      if (window.location.href !== _lastMsgHref) {
        _lastMsgHref = window.location.href;

        // Remove existing panel + button so they can be re-injected
        var oldPanel = document.getElementById(PANEL_ID);
        var oldBtn = document.getElementById(BTN_ID);
        if (oldPanel) oldPanel.remove();
        if (oldBtn) oldBtn.remove();

        // Remove Q&A injection markers so they can be re-applied
        var injected = document.querySelectorAll('[data-upa-qa-injected]');
        for (var i = 0; i < injected.length; i++) {
          delete injected[i].dataset.upaQaInjected;
        }

        // 800ms: Upwork's message SPA route change triggers a remount of the
        // compose textarea. Re-initializing synchronously binds to the stale
        // element. waitForComposeThenInit() observes for the new field, but
        // starting the observer before React clears the old one sometimes
        // resolves against the outgoing node.
        setTimeout(function () { waitForComposeThenInit(); }, 800);
      }
    });
    _navObserverMsg.observe(document.body, { childList: true, subtree: true });
  }

  _startNavWatch();

  try { if (typeof installErrorReporter === 'function') installErrorReporter('content-script'); } catch (e) { /* no-op */ }

  // Kick off on initial page load
  waitForComposeThenInit();
})();
