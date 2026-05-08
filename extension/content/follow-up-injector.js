/**
 * follow-up-injector.js
 * Content script for auto-send v1 follow-up injection.
 *
 * Runs on Upwork message-thread pages. Listens for INJECT_FOLLOWUP messages
 * from the service worker, finds the active composer textarea (or
 * contenteditable element), pre-fills it with the follow-up text, and returns
 * focus to the user so they can click Send themselves.
 *
 * No auto-click of Send — the user stays in control.
 */

(function () {
  'use strict';

  // ---- Selectors ----

  /**
   * Ordered list of selectors to try when locating the message-compose area.
   * Upwork's DOM is unstable across deploys, so we fall through from most
   * specific to most generic.
   */
  const TEXTAREA_SELECTORS = [
    'textarea[data-test="message-input"]',
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="reply" i]',
    '[contenteditable="true"][role="textbox"]',
    'textarea',
  ];

  /**
   * Container selectors used to scope the last-ditch textarea search when the
   * composer appears inside a sub-panel rather than globally on the page.
   */
  const CONTAINER_SELECTORS = [
    '[data-test*="message-thread" i]',
    '[role="main"]',
  ];

  // ---- Element finder ----

  /**
   * Try each selector globally; if none match, scope to known containers.
   * Returns the first Element found, or null.
   */
  function findComposerElement() {
    for (const sel of TEXTAREA_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Scoped fallback — look inside each known container
    for (const containerSel of CONTAINER_SELECTORS) {
      const container = document.querySelector(containerSel);
      if (!container) continue;
      for (const sel of TEXTAREA_SELECTORS) {
        const el = container.querySelector(sel);
        if (el) return el;
      }
    }

    return null;
  }

  // ---- Injection logic ----

  /**
   * Inject text into a <textarea> using React's synthetic event system.
   * Direct .value assignment is insufficient for controlled React inputs —
   * we must invoke the native setter and then dispatch an 'input' event.
   */
  function injectIntoTextarea(el, text) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    nativeSetter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Inject text into a [contenteditable] element.
   * Sets textContent and dispatches 'input' so any framework listeners pick
   * up the change.
   */
  function injectIntoContentEditable(el, text) {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Determine whether an element is a contenteditable rather than a textarea,
   * then delegate to the appropriate injector.
   */
  function injectText(el, text) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') {
      injectIntoTextarea(el, text);
    } else {
      // contenteditable div/span/p
      injectIntoContentEditable(el, text);
    }
  }

  // ---- Retry loop ----

  /**
   * Upwork is a SPA. When the service worker navigates the user to a message
   * thread, the DOM may still be loading by the time this message arrives.
   * Poll every 500 ms for up to 3 seconds before giving up.
   *
   * Returns a Promise that resolves with { ok: true } on success or
   * { ok: false, reason: 'textarea-not-found' } after exhausting retries.
   */
  function injectWithRetry(text) {
    return new Promise((resolve) => {
      const MAX_ATTEMPTS = 6;    // 6 × 500 ms = 3 s
      const INTERVAL_MS = 500;
      let attempts = 0;

      const timer = setInterval(() => {
        attempts++;
        try {
          const el = findComposerElement();
          if (el) {
            clearInterval(timer);
            injectText(el, text);
            resolve({ ok: true });
            return;
          }
        } catch (err) {
          console.warn('[follow-up-injector] Error during element search attempt', attempts, err);
        }

        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(timer);
          console.warn('[follow-up-injector] Composer element not found after', MAX_ATTEMPTS, 'attempts');
          resolve({ ok: false, reason: 'textarea-not-found' });
        }
      }, INTERVAL_MS);
    });
  }

  // ---- Message listener ----

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'INJECT_FOLLOWUP') {
      // Not our message — let other listeners handle it
      return false;
    }

    const payload = message.payload || {};
    const messageText = payload.messageText;

    if (!messageText || typeof messageText !== 'string' || !messageText.trim()) {
      console.warn('[follow-up-injector] INJECT_FOLLOWUP received with empty or missing messageText');
      sendResponse({ ok: false, reason: 'empty-message-text' });
      return false;
    }

    // Async handling — must return true to keep the message channel open
    injectWithRetry(messageText.trim())
      .then((result) => {
        try {
          sendResponse(result);
        } catch (err) {
          // The port may have been closed if the sender navigated away — safe to ignore
          console.warn('[follow-up-injector] Could not send response (port closed?):', err.message);
        }
      })
      .catch((err) => {
        console.warn('[follow-up-injector] Unexpected error in injectWithRetry:', err);
        try {
          sendResponse({ ok: false, reason: 'unexpected-error' });
        } catch (_) {
          // Port already closed — ignore
        }
      });

    // Return true tells Chrome to keep the channel open for async sendResponse
    return true;
  });

  console.log('[follow-up-injector] Loaded on', window.location.pathname);
})();
