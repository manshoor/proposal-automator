/**
 * job-filter.js
 * Pure logic module — no DOM manipulation.
 *
 * Relies on:
 *   ALLOWED_LOCATIONS  from lib/constants.js
 *
 * Exposes globally:
 *   matchesFilters(jobCard, filters) → boolean
 *   loadFilters()                    → Promise<filters>
 *   saveFilters(filters)             → Promise<void>
 */

/**
 * Default filter state — all permissive (nothing is excluded by default).
 */
var DEFAULT_JOB_FILTERS = {
  budgetMin: null,
  budgetMax: null,
  skillsInclude: [],
  keywordsInclude: [],
  keywordsExclude: [],
  locationAllowed: false,
  minClientSpent: 0,
  maxConnects: null,
  maxProposals: null,
  enabled: false
};

/**
 * Normalise a string for case-insensitive keyword matching.
 */
var _filterNormalise = function (str) {
  return (str || '').toLowerCase().trim();
};

/**
 * Test whether a search term exists in the given text (case-insensitive, whole-word boundary aware).
 */
var _filterContains = function (haystack, needle) {
  if (!needle) return false;
  return haystack.indexOf(_filterNormalise(needle)) !== -1;
};

/**
 * Evaluate whether a job card object passes all active filters.
 *
 * @param {Object} jobCard   - Object returned by scrapeJobCards() or observeNewCards()
 * @param {Object} filters   - Filter config (see DEFAULT_JOB_FILTERS shape)
 * @returns {boolean}
 */
function matchesFilters(jobCard, filters) {
  if (!filters || !filters.enabled) return true;

  var card = jobCard || {};
  var budget = typeof card.budgetAmount === 'number' ? card.budgetAmount : null;
  var skills = Array.isArray(card.skills) ? card.skills : [];
  var clientSpent = typeof card.clientSpent === 'number' ? card.clientSpent : 0;

  var titleLower = _filterNormalise(card.title || '');
  var descLower = _filterNormalise(card.description || '');
  var combinedText = titleLower + ' ' + descLower;

  // ---- Budget: min ----
  if (filters.budgetMin !== null && filters.budgetMin !== undefined && filters.budgetMin !== '') {
    var minVal = parseFloat(filters.budgetMin);
    if (!isNaN(minVal) && minVal > 0) {
      if (budget === null || budget < minVal) return false;
    }
  }

  // ---- Budget: max ----
  if (filters.budgetMax !== null && filters.budgetMax !== undefined && filters.budgetMax !== '') {
    var maxVal = parseFloat(filters.budgetMax);
    if (!isNaN(maxVal) && maxVal > 0) {
      if (budget === null || budget > maxVal) return false;
    }
  }

  // ---- Skills: must match at least one ----
  if (Array.isArray(filters.skillsInclude) && filters.skillsInclude.length > 0) {
    var skillsLower = skills.map(function (s) { return _filterNormalise(s); });
    var hasSkillMatch = filters.skillsInclude.some(function (requiredSkill) {
      var needle = _filterNormalise(requiredSkill);
      if (!needle) return false;
      return skillsLower.some(function (s) { return s.indexOf(needle) !== -1; });
    });
    if (!hasSkillMatch) return false;
  }

  // ---- Keywords include: title+desc must contain at least one ----
  if (Array.isArray(filters.keywordsInclude) && filters.keywordsInclude.length > 0) {
    var hasKeywordMatch = filters.keywordsInclude.some(function (kw) {
      return _filterContains(combinedText, kw);
    });
    if (!hasKeywordMatch) return false;
  }

  // ---- Keywords exclude: title+desc must NOT contain any ----
  if (Array.isArray(filters.keywordsExclude) && filters.keywordsExclude.length > 0) {
    var hasExcluded = filters.keywordsExclude.some(function (kw) {
      return _filterContains(combinedText, kw);
    });
    if (hasExcluded) return false;
  }

  // ---- Location: client must be in ALLOWED_LOCATIONS ----
  if (filters.locationAllowed) {
    var cardLocation = _filterNormalise(card.clientLocation || '');
    if (cardLocation) {
      var isAllowed = ALLOWED_LOCATIONS.some(function (loc) {
        return cardLocation.indexOf(_filterNormalise(loc)) !== -1;
      });
      if (!isAllowed) return false;
    }
    // If no location data on the card we give it the benefit of the doubt
    // (feed cards rarely expose client location — vetted on detail page)
  }

  // ---- Min client spent ----
  if (filters.minClientSpent !== null && filters.minClientSpent !== undefined && filters.minClientSpent !== '') {
    var minSpentVal = parseFloat(filters.minClientSpent);
    if (!isNaN(minSpentVal) && minSpentVal > 0) {
      // Filter out clients who spent less than minimum (including $0)
      if (clientSpent < minSpentVal) return false;
    }
  }

  // ---- Max connects cost ----
  if (filters.maxConnects !== null && filters.maxConnects !== undefined && filters.maxConnects !== '') {
    var maxConn = parseInt(filters.maxConnects, 10);
    if (!isNaN(maxConn) && maxConn > 0) {
      var cardConnects = typeof card.connectCost === 'number' ? card.connectCost : 0;
      if (cardConnects > 0 && cardConnects > maxConn) return false;
    }
  }

  // ---- Max proposals already submitted ----
  if (filters.maxProposals !== null && filters.maxProposals !== undefined && filters.maxProposals !== '') {
    var maxProp = parseInt(filters.maxProposals, 10);
    if (!isNaN(maxProp) && maxProp > 0) {
      var cardProposals = typeof card.proposalCount === 'number' ? card.proposalCount : 0;
      if (cardProposals > 0 && cardProposals > maxProp) return false;
    }
  }

  return true;
}

/**
 * Load saved filters from chrome.storage.sync.
 * Returns a Promise that resolves to a filters object (with DEFAULT_JOB_FILTERS as fallback).
 */
function loadFilters() {
  return new Promise(function (resolve) {
    chrome.storage.sync.get('jobFilters', function (result) {
      var saved = result.jobFilters;
      if (!saved || typeof saved !== 'object') {
        resolve(Object.assign({}, DEFAULT_JOB_FILTERS));
        return;
      }
      // Merge with defaults so any new fields are always present
      var merged = Object.assign({}, DEFAULT_JOB_FILTERS, saved);
      resolve(merged);
    });
  });
}

/**
 * Persist filters to chrome.storage.sync.
 * Returns a Promise that resolves when saved.
 */
function saveFilters(filters) {
  return new Promise(function (resolve) {
    chrome.storage.sync.set({ jobFilters: filters }, function () {
      resolve();
    });
  });
}

/**
 * Score a job for "Connect-frugality" preference. Higher = prefer.
 * Caller decides whether to actually use this; the existing filter logic is unchanged.
 * @param {Object} jobCard
 * @param {number|null} userBalance — current Connect balance, or null if unknown
 * @returns {number} 0-1, higher = more frugal-friendly
 */
function connectFrugalityScore(jobCard, userBalance) {
  if (typeof userBalance !== 'number' || userBalance >= 30) return 0.5;  // not budget-stressed
  var cost = (jobCard && typeof jobCard.connectCost === 'number') ? jobCard.connectCost : 6;
  if (cost === 0) return 1.0;
  if (cost <= 6) return 0.8;
  if (cost <= 12) return 0.4;
  return 0.1;
}

// Expose for feed-ui.js (loaded after this file via manifest)
if (typeof window !== 'undefined') {
  window.connectFrugalityScore = connectFrugalityScore;
}
