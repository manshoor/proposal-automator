/**
 * feed-ui.js
 * Main orchestrator for the Job Feed Filter feature.
 * Injected on Upwork search/feed pages (see manifest.json).
 *
 * Relies on (loaded before this file via manifest):
 *   lib/constants.js   → ALLOWED_LOCATIONS, VETTING_THRESHOLDS
 *   lib/storage.js     → getSettings, saveSettings
 *   content/vetting.js → vetClient
 *   content/feed-scraper.js → scrapeJobCards, observeNewCards
 *   content/job-filter.js   → matchesFilters, loadFilters, saveFilters
 */

(function () {
  'use strict';

  // ---- State ----
  var _state = {
    filters: null,           // current filter config
    panelOpen: false,        // whether the filter panel is expanded
    notificationsEnabled: false,
    cardObserver: null,      // MutationObserver from observeNewCards
    navObserver: null,       // MutationObserver for SPA URL changes
    lastHref: window.location.href,
    initialised: false
  };

  // ---- Constants ----
  var BAR_ID = 'upa-filter-bar';
  var PANEL_ID = 'upa-filter-panel';
  var FILTERED_CLASS = 'upa-filtered-out';
  var DOT_CLASS = 'upa-match-dot';
  var STORAGE_KEY_NOTIFICATIONS = 'notificationsEnabled';

  // ---- DOM helpers ----

  var _el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') {
          node.className = attrs[k];
        } else if (k === 'style' && typeof attrs[k] === 'object') {
          for (var prop in attrs[k]) {
            if (Object.prototype.hasOwnProperty.call(attrs[k], prop)) {
              node.style[prop] = attrs[k][prop];
            }
          }
        } else {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (typeof child === 'string') {
          node.appendChild(document.createTextNode(child));
        } else if (child) {
          node.appendChild(child);
        }
      }
    }
    return node;
  };

  var _text = function (str) {
    return document.createTextNode(str);
  };

  // ---- Notification helpers ----

  var _loadNotificationPref = function () {
    return new Promise(function (resolve) {
      chrome.storage.sync.get(STORAGE_KEY_NOTIFICATIONS, function (res) {
        resolve(!!res[STORAGE_KEY_NOTIFICATIONS]);
      });
    });
  };

  var _saveNotificationPref = function (enabled) {
    var obj = {};
    obj[STORAGE_KEY_NOTIFICATIONS] = enabled;
    chrome.storage.sync.set(obj);
  };

  var _sendNotification = function (jobCard) {
    if (!_state.notificationsEnabled) return;
    try {
      chrome.runtime.sendMessage({
        type: 'SHOW_NOTIFICATION',
        data: {
          title: 'New matching job: ' + (jobCard.title || 'Untitled'),
          message: jobCard.description
            ? jobCard.description.substring(0, 100) + (jobCard.description.length > 100 ? '...' : '')
            : 'A new job matching your filters was found.',
          url: jobCard.url || ''
        }
      });
    } catch (e) {
      // Service worker may be inactive — ignore
    }
  };

  // ---- Card visual helpers ----

  /**
   * Apply filter result to a single job card element.
   * Adds/removes the dim class and injects a colored dot next to the title.
   */
  var _applyCardVisual = function (cardData, passes) {
    var el = cardData.element;
    if (!el) return;

    if (passes) {
      el.classList.remove(FILTERED_CLASS);
    } else {
      el.classList.add(FILTERED_CLASS);
    }

    // Remove any existing dot first
    var existingDot = el.querySelector('.' + DOT_CLASS);
    if (existingDot) existingDot.parentNode.removeChild(existingDot);

    // Only inject the dot if filters are active
    if (!_state.filters || !_state.filters.enabled) return;

    var dot = _el('span', { class: DOT_CLASS + (passes ? ' upa-match-dot--green' : ' upa-match-dot--red') });
    var titleAnchor = el.querySelector('a[data-test="job-title"]');
    if (titleAnchor && titleAnchor.parentNode) {
      titleAnchor.parentNode.insertBefore(dot, titleAnchor);
    }
  };

  /**
   * Apply filter to all currently scraped cards.
   */
  var _applyFiltersToAll = function () {
    var cards = scrapeJobCards();
    var filters = _state.filters;

    for (var i = 0; i < cards.length; i++) {
      var passes = matchesFilters(cards[i], filters);
      _applyCardVisual(cards[i], passes);
    }

    console.log('[FeedUI] Applied filters to', cards.length, 'cards');
  };

  /**
   * Apply filter to a specific array of card data objects (from observeNewCards).
   */
  var _applyFiltersToCards = function (cards) {
    for (var i = 0; i < cards.length; i++) {
      var passes = matchesFilters(cards[i], _state.filters);
      _applyCardVisual(cards[i], passes);
      if (passes) _sendNotification(cards[i]);
    }
  };

  // ---- Filter toolbar UI ----

  /**
   * Build a labeled form row.
   */
  var _buildFormRow = function (labelText, inputEl) {
    var label = _el('label', { class: 'upa-form-label' }, [_text(labelText)]);
    label.appendChild(inputEl);
    return _el('div', { class: 'upa-form-row' }, [label]);
  };

  /**
   * Build a text input with a placeholder.
   */
  var _buildTextInput = function (placeholder, currentValue) {
    var input = _el('input', {
      type: 'text',
      class: 'upa-input',
      placeholder: placeholder
    });
    input.value = currentValue || '';
    return input;
  };

  /**
   * Build a number input.
   */
  var _buildNumberInput = function (placeholder, currentValue) {
    var input = _el('input', {
      type: 'number',
      class: 'upa-input upa-input--number',
      placeholder: placeholder,
      min: '0'
    });
    input.value = (currentValue !== null && currentValue !== undefined && currentValue !== '') ? currentValue : '';
    return input;
  };

  /**
   * Build the full filter toolbar and inject it into the page.
   */
  var _buildAndInjectToolbar = function () {
    // Remove any existing toolbar
    var existing = document.getElementById(BAR_ID);
    if (existing) existing.parentNode.removeChild(existing);

    var filters = _state.filters || {};

    // ---- Toggle button area ----
    var enabledToggle = _el('label', { class: 'upa-toggle-switch', title: 'Enable/disable filters' });
    var enabledCheckbox = _el('input', { type: 'checkbox', 'aria-label': 'Enable filters' });
    enabledCheckbox.checked = !!filters.enabled;
    enabledToggle.appendChild(enabledCheckbox);
    enabledToggle.appendChild(_el('span', { class: 'upa-toggle-slider' }));

    var toggleLabel = _el('span', { class: 'upa-toggle-label' }, [_text('Filters: ')]);
    var toggleStatus = _el('strong', { class: 'upa-toggle-status' }, [_text(filters.enabled ? 'ON' : 'OFF')]);
    toggleLabel.appendChild(toggleStatus);

    var expandBtn = _el('button', {
      class: 'upa-expand-btn',
      'aria-expanded': _state.panelOpen ? 'true' : 'false',
      'aria-controls': PANEL_ID,
      title: 'Expand filter panel'
    }, [_text(_state.panelOpen ? '▲ Filters' : '▼ Filters')]);

    var headerLeft = _el('div', { class: 'upa-bar-left' }, [
      _el('span', { class: 'upa-brand' }, [_text('UPA')]),
      toggleLabel,
      enabledToggle
    ]);

    var headerRight = _el('div', { class: 'upa-bar-right' }, [expandBtn]);

    var barHeader = _el('div', { class: 'upa-bar-header' }, [headerLeft, headerRight]);

    // ---- Filter panel inputs ----

    // Budget
    var budgetMinInput = _buildNumberInput('Min ($)', filters.budgetMin);
    var budgetMaxInput = _buildNumberInput('Max ($)', filters.budgetMax);
    var budgetRow = _el('div', { class: 'upa-form-row' }, [
      _el('label', { class: 'upa-form-label' }, [
        _text('Budget ($)'),
        _el('div', { class: 'upa-budget-inputs' }, [
          budgetMinInput,
          _el('span', { class: 'upa-budget-sep' }, [_text('–')]),
          budgetMaxInput
        ])
      ])
    ]);

    // Skills include
    var skillsInput = _buildTextInput('React, Node.js, Python...', (filters.skillsInclude || []).join(', '));
    var skillsRow = _buildFormRow('Skills (match any):', skillsInput);

    // Keywords include
    var keywordsIncInput = _buildTextInput('e-commerce, API, SaaS...', (filters.keywordsInclude || []).join(', '));
    var keywordsIncRow = _buildFormRow('Keywords include (any):', keywordsIncInput);

    // Keywords exclude
    var keywordsExcInput = _buildTextInput('logo, data entry, transcription...', (filters.keywordsExclude || []).join(', '));
    var keywordsExcRow = _buildFormRow('Keywords exclude:', keywordsExcInput);

    // Location filter
    var locationCheckbox = _el('input', {
      type: 'checkbox',
      id: 'upa-location-check',
      'aria-label': 'Target countries only'
    });
    locationCheckbox.checked = !!filters.locationAllowed;
    var locationRow = _el('div', { class: 'upa-form-row upa-form-row--checkbox' }, [
      locationCheckbox,
      _el('label', { 'for': 'upa-location-check', class: 'upa-checkbox-label' }, [
        _text('Target countries only (' + ALLOWED_LOCATIONS.slice(0, 3).join(', ') + '...)')
      ])
    ]);

    // Min client spent
    var minSpentInput = _buildNumberInput('e.g. 10000', filters.minClientSpent);
    var minSpentRow = _buildFormRow('Min client spent ($):', minSpentInput);

    // Max connects
    var maxConnectsInput = _buildNumberInput('e.g. 6', filters.maxConnects);
    var maxConnectsRow = _buildFormRow('Max Connects per job:', maxConnectsInput);

    // Max proposals already submitted
    var maxProposalsInput = _buildNumberInput('e.g. 10', filters.maxProposals);
    var maxProposalsRow = _buildFormRow('Max proposals submitted:', maxProposalsInput);

    // Notifications toggle
    var notifToggle = _el('label', { class: 'upa-toggle-switch', title: 'Notify on new matching jobs' });
    var notifCheckbox = _el('input', { type: 'checkbox', 'aria-label': 'Notify me on new matches' });
    notifCheckbox.checked = _state.notificationsEnabled;
    notifToggle.appendChild(notifCheckbox);
    notifToggle.appendChild(_el('span', { class: 'upa-toggle-slider' }));

    var notifRow = _el('div', { class: 'upa-form-row upa-form-row--checkbox' }, [
      notifToggle,
      _el('span', { class: 'upa-checkbox-label' }, [_text('Notify me on new matching jobs')])
    ]);

    // Buttons
    var saveBtn = _el('button', { class: 'upa-btn upa-btn--primary', type: 'button' }, [_text('Save & Apply')]);
    var resetBtn = _el('button', { class: 'upa-btn upa-btn--secondary', type: 'button' }, [_text('Reset')]);
    var btnRow = _el('div', { class: 'upa-btn-row' }, [saveBtn, resetBtn]);

    // Panel
    var panel = _el('div', {
      id: PANEL_ID,
      class: 'upa-filter-panel' + (_state.panelOpen ? ' upa-filter-panel--open' : '')
    }, [
      budgetRow,
      skillsRow,
      keywordsIncRow,
      keywordsExcRow,
      locationRow,
      minSpentRow,
      maxConnectsRow,
      maxProposalsRow,
      notifRow,
      btnRow
    ]);

    // Full bar
    var bar = _el('div', { id: BAR_ID, class: 'upa-filter-bar' }, [barHeader, panel]);

    // ---- Wire up events ----

    // Toggle enable/disable filters
    enabledCheckbox.addEventListener('change', function () {
      _state.filters.enabled = enabledCheckbox.checked;
      toggleStatus.textContent = enabledCheckbox.checked ? 'ON' : 'OFF';
      saveFilters(_state.filters);
      _applyFiltersToAll();
    });

    // Expand/collapse panel
    expandBtn.addEventListener('click', function () {
      _state.panelOpen = !_state.panelOpen;
      panel.classList.toggle('upa-filter-panel--open', _state.panelOpen);
      expandBtn.setAttribute('aria-expanded', _state.panelOpen ? 'true' : 'false');
      expandBtn.textContent = _state.panelOpen ? '▲ Filters' : '▼ Filters';
    });

    // Save & Apply
    saveBtn.addEventListener('click', function () {
      var splitTrim = function (str) {
        return str.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      };

      _state.filters.budgetMin = budgetMinInput.value ? parseFloat(budgetMinInput.value) : null;
      _state.filters.budgetMax = budgetMaxInput.value ? parseFloat(budgetMaxInput.value) : null;
      _state.filters.skillsInclude = splitTrim(skillsInput.value);
      _state.filters.keywordsInclude = splitTrim(keywordsIncInput.value);
      _state.filters.keywordsExclude = splitTrim(keywordsExcInput.value);
      _state.filters.locationAllowed = locationCheckbox.checked;
      _state.filters.minClientSpent = minSpentInput.value ? parseFloat(minSpentInput.value) : 0;
      _state.filters.maxConnects = maxConnectsInput.value ? parseInt(maxConnectsInput.value, 10) : null;
      _state.filters.maxProposals = maxProposalsInput.value ? parseInt(maxProposalsInput.value, 10) : null;
      _state.filters.enabled = enabledCheckbox.checked;

      saveFilters(_state.filters).then(function () {
        console.log('[FeedUI] Filters saved:', _state.filters);
        _applyFiltersToAll();
        // Flash the button to give visual feedback
        saveBtn.textContent = 'Saved!';
        setTimeout(function () { saveBtn.textContent = 'Save & Apply'; }, 1500);
      });
    });

    // Reset
    resetBtn.addEventListener('click', function () {
      var fresh = {
        budgetMin: null,
        budgetMax: null,
        skillsInclude: [],
        keywordsInclude: [],
        keywordsExclude: [],
        locationAllowed: false,
        minClientSpent: 0,
        enabled: false
      };
      _state.filters = fresh;
      saveFilters(fresh).then(function () {
        // Rebuild toolbar with clean state
        _buildAndInjectToolbar();
        _applyFiltersToAll();
      });
    });

    // Notifications toggle
    notifCheckbox.addEventListener('change', function () {
      _state.notificationsEnabled = notifCheckbox.checked;
      _saveNotificationPref(_state.notificationsEnabled);
    });

    // ---- Inject into page ----
    _injectBar(bar);
  };

  /**
   * Find the best injection point and insert the bar.
   * Tries several Upwork-specific containers before falling back to document.body.
   */
  var _injectBar = function (bar) {
    // Logged-in find-work feed
    var container = document.querySelector('[data-test="job-tile-list"]') ||
                    document.querySelector('.find-work-content') ||
                    document.querySelector('main') ||
                    document.querySelector('#main') ||
                    document.body;

    // Insert before the first child so bar sits at the top
    if (container.firstChild) {
      container.insertBefore(bar, container.firstChild);
    } else {
      container.appendChild(bar);
    }

    console.log('[FeedUI] Filter bar injected');
  };

  // ---- SPA navigation ----

  /**
   * Watch for URL changes (Upwork is a React SPA).
   * Re-initialises the toolbar and reapplies filters after navigation.
   */
  var _watchNavigation = function () {
    _state.navObserver = new MutationObserver(function () {
      var current = window.location.href;
      if (current !== _state.lastHref) {
        _state.lastHref = current;
        console.log('[FeedUI] SPA navigation detected, reinitialising on:', current);
        // Give the new page's DOM time to render
        setTimeout(_init, 1500);
      }
    });
    _state.navObserver.observe(document.body, { childList: true, subtree: true });
  };

  // ---- Init ----

  var _init = function () {
    // Only run on feed/search pages
    var href = window.location.href;
    var isFeedPage = /upwork\.com\/(nx\/find-work|nx\/search|ab\/find-work|search\/jobs)/i.test(href);
    if (!isFeedPage) return;

    // Disconnect previous card observer if any
    if (_state.cardObserver) {
      _state.cardObserver.disconnect();
      _state.cardObserver = null;
    }

    // Load notification pref and filters in parallel
    Promise.all([loadFilters(), _loadNotificationPref()]).then(function (results) {
      _state.filters = results[0];
      _state.notificationsEnabled = results[1];

      console.log('[FeedUI] Loaded filters:', _state.filters);
      console.log('[FeedUI] Notifications enabled:', _state.notificationsEnabled);

      // Build + inject toolbar
      _buildAndInjectToolbar();

      // Apply filters to existing cards
      _applyFiltersToAll();

      // Watch for new cards (infinite scroll)
      _state.cardObserver = observeNewCards(function (newCards) {
        _applyFiltersToCards(newCards);
      });
    }).catch(function (err) {
      console.error('[FeedUI] Init error:', err);
    });
  };

  // ---- Bootstrap ----

  // Start SPA nav watcher once
  _watchNavigation();

  // Run immediately (document_idle means DOM is ready)
  _init();

  console.log('[Upwork Proposal Automator] Feed UI script loaded on:', window.location.href);

})();
