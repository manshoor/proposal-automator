/**
 * feed-scraper.js
 * Scrapes job cards from Upwork search/feed pages.
 * Verified against live Upwork feed DOM (April 2026).
 *
 * Exposes globally:
 *   scrapeJobCards()       → array of job card objects
 *   observeNewCards(cb)    → starts a MutationObserver, calls cb(newCards[])
 */

var _feedGetText = function (el) {
  if (!el) return '';
  return (el.textContent || '').trim();
};

var _feedParseDollar = function (str) {
  if (!str) return null;
  var text = str.replace(/,/g, '').trim();
  var rangeMatch = text.match(/\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)/);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
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

var _feedParseProposals = function (str) {
  if (!str) return 0;
  var s = str.toLowerCase();
  var m = s.match(/less\s+than\s+(\d+)/);
  if (m) return parseInt(m[1], 10) - 1;
  var rm = s.match(/(\d+)\s*(to|-)\s*(\d+)/);
  if (rm) return parseInt(rm[3], 10);
  var pm = s.match(/(\d+)\+/);
  if (pm) return parseInt(pm[1], 10);
  var nm = s.match(/(\d+)/);
  if (nm) return parseInt(nm[1], 10);
  return 0;
};

/**
 * Find all job card elements in the feed.
 * Verified: cards are <section> with data-ev-sublocation="job_feed_tile"
 */
var _findFeedCards = function () {
  // Feed page (My Feed / Best Matches)
  var cards = document.querySelectorAll('section[data-ev-sublocation="job_feed_tile"]');
  if (cards.length > 0) return Array.from(cards);

  // Search results page (/nx/search/jobs/)
  cards = document.querySelectorAll('article[data-test="JobTile"]');
  if (cards.length > 0) return Array.from(cards);

  // Older feed format
  cards = document.querySelectorAll('section[data-test="job-tile"]');
  if (cards.length > 0) return Array.from(cards);

  cards = document.querySelectorAll('section.air3-card-section.air3-card-hover');
  if (cards.length > 0) return Array.from(cards);

  return [];
};

/**
 * Scrape a single job card element.
 */
var _scrapeOneCard = function (card) {
  try {
    // Title + URL — works on both feed and search pages
    var titleEl = card.querySelector('a[data-test="job-tile-title-link"]') ||
                  card.querySelector('h3.job-tile-title a') ||
                  card.querySelector('a[data-ev-label="link"]') ||
                  card.querySelector('a[href*="/jobs/"]');
    var title = titleEl ? _feedGetText(titleEl) : '';
    var relUrl = titleEl ? (titleEl.getAttribute('href') || '') : '';
    var url = relUrl ? (relUrl.startsWith('http') ? relUrl : 'https://www.upwork.com' + relUrl) : '';

    // Job ID
    var id = card.getAttribute('data-ev-opening_uid') || card.getAttribute('data-ev-job-uid') || '';
    if (!id && relUrl) {
      var idMatch = relUrl.match(/~(\d+)/);
      if (idMatch) id = idMatch[1];
    }

    // Description — feed uses [data-test="job-description-text"], search uses p inside [data-test="JobDescription"]
    var descEl = card.querySelector('[data-test="job-description-text"]') ||
                 card.querySelector('[data-test="JobDescription"] p') ||
                 card.querySelector('.air3-line-clamp span') ||
                 card.querySelector('.air3-line-clamp p');
    var description = descEl ? _feedGetText(descEl) : '';

    // Budget — try multiple selectors for feed vs search
    var budgetType = 'unknown';
    var budgetAmount = null;

    var jobTypeEl = card.querySelector('[data-test="job-type-label"]') ||
                    card.querySelector('[data-test="job-type"]');
    if (jobTypeEl) {
      var jt = _feedGetText(jobTypeEl).toLowerCase();
      if (jt.includes('fixed')) budgetType = 'fixed';
      else if (jt.includes('hourly')) budgetType = 'hourly';
    }

    var budgetEl = card.querySelector('[data-test="is-fixed-price"] strong.rr-mask') ||
                   card.querySelector('[data-test="is-fixed-price"] strong') ||
                   card.querySelector('[data-test="budget"]');
    if (budgetEl) budgetAmount = _feedParseDollar(_feedGetText(budgetEl));

    // Skills — feed uses a[data-test="attr-item"], search uses button[data-test="token"] span
    var skillEls = card.querySelectorAll('a[data-test="attr-item"], button[data-test="token"] span');
    var skills = [];
    for (var i = 0; i < skillEls.length; i++) {
      var st = _feedGetText(skillEls[i]);
      if (st && !st.match(/^\+\d+$/)) skills.push(st);
    }

    // Client spent — feed uses [data-test="client-spendings"], search uses [data-test="total-spent"]
    var spentEl = card.querySelector('[data-test="client-spendings"] [data-test="formatted-amount"]') ||
                  card.querySelector('[data-test="total-spent"] strong.rr-mask') ||
                  card.querySelector('[data-test="total-spent"] strong') ||
                  card.querySelector('[data-test="formatted-amount"]');
    var clientSpent = spentEl ? (_feedParseDollar(_feedGetText(spentEl)) || 0) : 0;

    // Client country — feed uses [data-test="client-country"], search uses [data-test="location"]
    var countryEl = card.querySelector('[data-test="client-country"]') ||
                    card.querySelector('[data-test="location"] span.rr-mask') ||
                    card.querySelector('[data-test="location"]');
    var clientLocation = countryEl ? _feedGetText(countryEl) : '';

    // Proposals — feed uses [data-test="proposals"], search uses [data-test="proposals-tier"]
    var proposalsEl = card.querySelector('[data-test="proposals"]') ||
                      card.querySelector('[data-test="proposals-tier"] strong') ||
                      card.querySelector('[data-test="proposals-tier"]');
    var proposalCount = proposalsEl ? _feedParseProposals(_feedGetText(proposalsEl)) : 0;
    var proposalText = proposalsEl ? _feedGetText(proposalsEl) : '';

    // Posted time — feed uses [data-test="posted-on"], search uses [data-test="job-pubilshed-date"]
    var postedEl = card.querySelector('[data-test="posted-on"]') ||
                   card.querySelector('[data-test="job-pubilshed-date"]');
    var postedText = postedEl ? _feedGetText(postedEl) : '';

    // Payment verified
    var payVerEl = card.querySelector('[data-test="payment-verification-status"]');
    var paymentVerified = payVerEl ? _feedGetText(payVerEl).toLowerCase().includes('verified') && !_feedGetText(payVerEl).toLowerCase().includes('unverified') : false;

    // Connect cost — Upwork's feed cards don't expose the exact number, so we
    // estimate from the `data-ev-*` attributes the tile carries. Heuristic:
    //   data-ev-bonus_connects="true" → 0 (bonus job, free to apply)
    //   data-ev-featured="true"       → 16 (premium tier; typical featured cost)
    //   otherwise                     → 6 (standard cost)
    // The exact value is still scraped on the job-detail page in scraper.js,
    // which sets connectCost from "Send a proposal for: X Connects" text.
    var bonusConnects = card.getAttribute('data-ev-bonus_connects') === 'true';
    var isFeatured    = card.getAttribute('data-ev-featured') === 'true';
    var connectCost = bonusConnects ? 0 : (isFeatured ? 16 : 6);
    var connectCostEstimated = true;

    return {
      id: id,
      title: title,
      url: url,
      description: description,
      budgetType: budgetType,
      budgetAmount: budgetAmount,
      skills: skills,
      clientSpent: clientSpent,
      clientLocation: clientLocation,
      proposalCount: proposalCount,
      proposalText: proposalText,
      postedText: postedText,
      paymentVerified: paymentVerified,
      connectCost: connectCost,
      connectCostEstimated: connectCostEstimated,
      isFeatured: isFeatured,
      isBonus: bonusConnects,
      element: card
    };
  } catch (err) {
    console.error('[FeedScraper] Error scraping card:', err);
    return null;
  }
};

/**
 * Scrape all job cards currently visible on the feed page.
 */
function scrapeJobCards() {
  var cardEls = _findFeedCards();
  var results = [];
  for (var i = 0; i < cardEls.length; i++) {
    var data = _scrapeOneCard(cardEls[i]);
    if (data && data.title) results.push(data);
  }
  console.log('[FeedScraper] Found', results.length, 'job cards');
  return results;
}

/**
 * Watch for new job cards added to the DOM (infinite scroll).
 * Returns the MutationObserver instance.
 */
function observeNewCards(callback) {
  var seen = new WeakSet();
  var existing = _findFeedCards();
  for (var i = 0; i < existing.length; i++) seen.add(existing[i]);

  var container = document.querySelector('[data-test="job-tile-list"]') ||
                  document.querySelector('main') ||
                  document.body;

  var observer = new MutationObserver(function () {
    var allCards = _findFeedCards();
    var newCards = [];
    for (var i = 0; i < allCards.length; i++) {
      if (!seen.has(allCards[i])) {
        seen.add(allCards[i]);
        var data = _scrapeOneCard(allCards[i]);
        if (data && data.title) newCards.push(data);
      }
    }
    if (newCards.length > 0) {
      console.log('[FeedScraper] New cards detected:', newCards.length);
      callback(newCards);
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  return observer;
}
