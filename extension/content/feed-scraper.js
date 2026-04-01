/**
 * feed-scraper.js
 * Scrapes job cards from Upwork search/feed pages.
 *
 * Verified DOM selectors (Upwork, March 2026):
 *   - Job cards:  section[data-test="job-tile"]
 *   - Job title:  a[data-test="job-title"]
 *   - Skills:     .air3-badge.air3-badge-highlight inside the card
 *
 * Exposes globally:
 *   scrapeJobCards()       → array of job card objects
 *   observeNewCards(cb)    → starts a MutationObserver, calls cb(newCards[])
 */

// ---- Internal helpers ----

var _feedScraperGetText = function (el) {
  if (!el) return '';
  return (el.textContent || '').trim();
};

var _feedParseDollarAmount = function (str) {
  if (!str) return null;
  var text = str.replace(/,/g, '').trim();
  // Range: $10 – $50  or  $10-$50
  var rangeMatch = text.match(/\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)/);
  if (rangeMatch) {
    return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  }
  // K/M suffix: $5K, $1.5M
  var singleMatch = text.match(/\$?([\d.]+)\s*([KkMm]?)\+?/);
  if (singleMatch) {
    var amt = parseFloat(singleMatch[1]);
    var suf = (singleMatch[2] || '').toLowerCase();
    if (suf === 'k') amt *= 1000;
    if (suf === 'm') amt *= 1000000;
    return amt;
  }
  return null;
};

var _feedParseProposalCount = function (str) {
  if (!str) return 0;
  var s = str.toLowerCase();
  var lessMatch = s.match(/less\s+than\s+(\d+)/);
  if (lessMatch) return parseInt(lessMatch[1], 10) - 1;
  var rangeMatch = s.match(/(\d+)\s*(to|-)\s*(\d+)/);
  if (rangeMatch) return parseInt(rangeMatch[3], 10);
  var plusMatch = s.match(/(\d+)\+/);
  if (plusMatch) return parseInt(plusMatch[1], 10);
  var numMatch = s.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 0;
};

/**
 * Extract job ID from data-ev-job-uid attribute or from the job URL.
 */
var _extractJobId = function (card, titleAnchor) {
  // Prefer data-ev-job-uid on the card or any ancestor
  var uid = card.getAttribute('data-ev-job-uid') || card.getAttribute('data-ev-section');
  if (uid) return uid;

  // Try on title link
  if (titleAnchor) {
    var uidOnLink = titleAnchor.getAttribute('data-ev-job-uid');
    if (uidOnLink) return uidOnLink;

    // Extract from the href: /jobs/~012abc  or  /jobs/012abc
    var href = titleAnchor.getAttribute('href') || '';
    var idMatch = href.match(/\/jobs\/~?([a-zA-Z0-9]+)/);
    if (idMatch) return idMatch[1];
  }

  // Walk up the DOM looking for data-ev-job-uid
  var ancestor = card.parentElement;
  var maxLevels = 5;
  while (ancestor && maxLevels-- > 0) {
    var ancestorUid = ancestor.getAttribute('data-ev-job-uid');
    if (ancestorUid) return ancestorUid;
    ancestor = ancestor.parentElement;
  }

  return '';
};

/**
 * Scrape a single job card element into a plain data object.
 * Never throws — returns null on fatal error.
 */
var _scrapeCard = function (card) {
  try {
    // Title + URL
    var titleAnchor = card.querySelector('a[data-test="job-title"]');
    if (!titleAnchor) {
      // Fallback: any prominent anchor that looks like a job link
      titleAnchor = card.querySelector('a.job-title, a[href*="/jobs/"]');
    }
    var title = titleAnchor ? _feedScraperGetText(titleAnchor) : '';
    var relativeUrl = titleAnchor ? (titleAnchor.getAttribute('href') || '') : '';
    var url = relativeUrl ? (relativeUrl.startsWith('http') ? relativeUrl : 'https://www.upwork.com' + relativeUrl) : '';

    // Job ID
    var id = _extractJobId(card, titleAnchor);

    // Description — multiple selectors in priority order
    var descEl = card.querySelector('.air3-line-clamp-wrapper p') ||
                 card.querySelector('.job-tile-description p') ||
                 card.querySelector('[data-test="job-description"] p') ||
                 card.querySelector('.job-tile-body p') ||
                 card.querySelector('p.mb-0');
    var description = descEl ? _feedScraperGetText(descEl) : '';

    // Budget — check fixed-price first, then hourly
    var budgetType = 'unknown';
    var budgetAmount = null;

    var fixedEl = card.querySelector('[data-test="is-fixed-price"] strong') ||
                  card.querySelector('[data-test="budget"] strong') ||
                  card.querySelector('[data-cy="fixed-price"] ~ strong');

    var hourlyEl = card.querySelector('[data-test="is-hourly"] strong') ||
                   card.querySelector('[data-cy="clock-hourly"] ~ strong');

    if (fixedEl) {
      budgetType = 'fixed';
      budgetAmount = _feedParseDollarAmount(_feedScraperGetText(fixedEl));
    } else if (hourlyEl) {
      budgetType = 'hourly';
      budgetAmount = _feedParseDollarAmount(_feedScraperGetText(hourlyEl));
    } else {
      // Fallback: look for budget text in card metadata area
      var cardText = card.textContent || '';
      if (/fixed.?price/i.test(cardText)) budgetType = 'fixed';
      else if (/hourly/i.test(cardText)) budgetType = 'hourly';

      var dollarMatch = cardText.match(/\$[\d,]+(?:\.\d+)?(?:\s*[-–]\s*\$[\d,]+(?:\.\d+)?)?/);
      if (dollarMatch) budgetAmount = _feedParseDollarAmount(dollarMatch[0]);
    }

    // Skills — span.air3-badge inside the card
    var skillEls = card.querySelectorAll('span.air3-badge.air3-badge-highlight, [data-test="token"] span');
    var skills = [];
    for (var i = 0; i < skillEls.length; i++) {
      var skillText = _feedScraperGetText(skillEls[i]);
      // Exclude "+N more" badges and empty strings
      if (skillText && !/^\+\s*\d+\s*more$/i.test(skillText)) {
        skills.push(skillText);
      }
    }

    // Client total spent
    var spentEl = card.querySelector('[data-test="total-spent"] strong') ||
                  card.querySelector('[data-qa="client-spend"]');
    var clientSpentRaw = spentEl ? _feedScraperGetText(spentEl) : '';
    var clientSpent = _feedParseDollarAmount(clientSpentRaw) || 0;

    // Proposal count
    // Upwork uses "pubilshed" (typo) in some attributes, so check both spellings
    var proposalsEl = card.querySelector('[data-test="proposals-tier"] strong') ||
                      card.querySelector('[data-test="proposals-tier"]') ||
                      card.querySelector('[data-test="proposal-tier"] strong');
    var proposalCount = proposalsEl ? _feedParseProposalCount(_feedScraperGetText(proposalsEl)) : 0;

    // Posted time text — Upwork uses typo "pubilshed" in data-test
    var postedEl = card.querySelector('[data-test="job-pubilshed-date"] span') ||
                   card.querySelector('[data-test="job-published-date"] span') ||
                   card.querySelector('.job-tile-header span[class*="posted"]') ||
                   card.querySelector('span[class*="posted"]');
    var postedText = postedEl ? _feedScraperGetText(postedEl) : '';

    // Fallback posted text: scan for "Posted X ago" in card text
    if (!postedText) {
      var postedMatch = (card.textContent || '').match(/Posted\s+[\w\s]+ago/i);
      if (postedMatch) postedText = postedMatch[0].trim();
    }

    return {
      id: id,
      title: title,
      url: url,
      description: description,
      budgetType: budgetType,
      budgetAmount: budgetAmount,
      skills: skills,
      clientSpent: clientSpent,
      proposalCount: proposalCount,
      postedText: postedText,
      element: card
    };
  } catch (err) {
    console.error('[FeedScraper] Error scraping card:', err);
    return null;
  }
};

/**
 * Find all job card elements currently in the DOM.
 */
var _findCardElements = function () {
  // Primary selector — verified against live Upwork DOM (March 2026)
  var cards = document.querySelectorAll('section[data-test="job-tile"]');
  if (cards.length > 0) return Array.prototype.slice.call(cards);

  // Fallback: article with job uid (logged-in feed)
  cards = document.querySelectorAll('article[data-ev-job-uid]');
  if (cards.length > 0) return Array.prototype.slice.call(cards);

  return [];
};

// Track which card elements have already been processed to avoid duplicates
var _seenCardElements = new WeakSet();

/**
 * Scrape all visible job cards from the feed.
 * Returns an array of job card data objects.
 */
function scrapeJobCards() {
  var cardEls = _findCardElements();
  var results = [];

  for (var i = 0; i < cardEls.length; i++) {
    var data = _scrapeCard(cardEls[i]);
    if (data) results.push(data);
  }

  console.log('[FeedScraper] Scraped', results.length, 'job cards');
  return results;
}

/**
 * Watch for new job cards added to the DOM (infinite scroll / SPA navigation).
 * Calls callback(newCards) whenever new cards are detected.
 * Returns the MutationObserver so the caller can disconnect it if needed.
 */
function observeNewCards(callback) {
  if (typeof callback !== 'function') return null;

  // Seed the WeakSet with already-present cards so we don't re-report them
  var existingEls = _findCardElements();
  for (var j = 0; j < existingEls.length; j++) {
    _seenCardElements.add(existingEls[j]);
  }

  var observer = new MutationObserver(function () {
    var currentEls = _findCardElements();
    var newCards = [];

    for (var i = 0; i < currentEls.length; i++) {
      if (!_seenCardElements.has(currentEls[i])) {
        _seenCardElements.add(currentEls[i]);
        var data = _scrapeCard(currentEls[i]);
        if (data) newCards.push(data);
      }
    }

    if (newCards.length > 0) {
      console.log('[FeedScraper] Observed', newCards.length, 'new job card(s)');
      callback(newCards);
    }
  });

  // Observe the whole body for subtree changes (SPA inserts cards anywhere)
  observer.observe(document.body, { childList: true, subtree: true });

  console.log('[FeedScraper] MutationObserver started for new cards');
  return observer;
}
