/**
 * scraper.js
 * Scrapes Upwork job detail pages AND proposal submission pages.
 * Handles two different DOM structures:
 *   1. Job detail page (/jobs/~..., /freelance-jobs/apply/...)
 *   2. Proposal page (/nx/proposals/job/.../apply/)
 *
 * NEVER throws — always returns a data object (possibly with empty fields).
 */

var _cachedJobData = null;
var _cachedUrl = null;

function waitForAny(selectors, timeout) {
  if (timeout === undefined) timeout = 8000;
  return new Promise(function (resolve) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) { resolve(el); return; }
    }
    var observer = new MutationObserver(function () {
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el) { observer.disconnect(); resolve(el); return; }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { observer.disconnect(); resolve(null); }, timeout);
  });
}

function queryFirst(selectors) {
  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    if (el) return el;
  }
  return null;
}

function getText(el) {
  if (!el) return '';
  return (el.textContent || '').trim();
}

function getInnerText(el) {
  if (!el) return '';
  return (el.innerText || el.textContent || '').trim();
}

function parseDollarAmount(str) {
  if (!str) return { min: null, max: null, amount: null };
  var text = str.replace(/,/g, '').trim();
  var rangeMatch = text.match(/\$?([\d.]+)\s*[-–]\s*\$?([\d.]+)/);
  if (rangeMatch) {
    var rmin = parseFloat(rangeMatch[1]);
    var rmax = parseFloat(rangeMatch[2]);
    return { min: rmin, max: rmax, amount: (rmin + rmax) / 2 };
  }
  var singleMatch = text.match(/\$?([\d.]+)\s*([KkMm]?)\+?/);
  if (singleMatch) {
    var amt = parseFloat(singleMatch[1]);
    var suf = (singleMatch[2] || '').toLowerCase();
    if (suf === 'k') amt *= 1000;
    if (suf === 'm') amt *= 1000000;
    return { min: null, max: null, amount: amt };
  }
  return { min: null, max: null, amount: null };
}

function parsePercent(str) {
  if (!str) return 0;
  var m = str.match(/([\d.]+)\s*%/);
  return m ? parseFloat(m[1]) : 0;
}

function parseProposalCount(str) {
  if (!str) return 0;
  var s = str.toLowerCase();
  if (/less\s+than\s+(\d+)/.test(s)) return parseInt(s.match(/less\s+than\s+(\d+)/)[1], 10) - 1;
  var rm = s.match(/(\d+)\s*(to|-)\s*(\d+)/);
  if (rm) return parseInt(rm[3], 10);
  var pm = s.match(/(\d+)\+/);
  if (pm) return parseInt(pm[1], 10);
  var nm = s.match(/(\d+)/);
  if (nm) return parseInt(nm[1], 10);
  return 0;
}

// ---- Detect page type ----

function isProposalPage() {
  return /\/proposals\/job\/.*\/apply/i.test(window.location.pathname);
}

// ---- Title extraction ----

function scrapeTitle() {
  // Proposal page: h3.h5 inside .fe-job-details
  var feJobDetails = document.querySelector('.fe-job-details');
  if (feJobDetails) {
    var h3 = feJobDetails.querySelector('h3');
    if (h3) {
      var t = getText(h3);
      if (t.length > 3) return t;
    }
  }

  // Job detail page: h4 > span.flex-1 inside .job-details-card
  var jobCard = document.querySelector('.job-details-card');
  if (jobCard) {
    var spanEl = jobCard.querySelector('h4 > span.flex-1');
    if (spanEl) { var t2 = getText(spanEl); if (t2) return t2; }
    var h4 = jobCard.querySelector('h4');
    if (h4) { var t3 = getText(h4); if (t3.length > 3) return t3; }
  }

  // Non-logged-in: h1
  var allH1s = document.querySelectorAll('h1');
  for (var i = 0; i < allH1s.length; i++) {
    var txt = getText(allH1s[i]);
    if (txt.length > 5 && !txt.match(/^(upwork|home|sign up|log in|menu|submit a proposal)$/i)) {
      return txt;
    }
  }

  // Fallback: page <title>
  var pageTitle = document.title || '';
  if (pageTitle.includes(' - ') && pageTitle.includes('Upwork')) {
    return pageTitle.split(' - ')[0].trim();
  }

  // Fallback: URL slug
  var urlMatch = window.location.pathname.match(/\/(?:freelance-jobs\/apply|jobs)\/([^_~\/]+)/);
  if (urlMatch) return urlMatch[1].replace(/-/g, ' ').trim();

  return '';
}

// ---- Description extraction ----

function scrapeDescription() {
  // Proposal page: .description.text-body-sm inside .fe-job-details
  var feJobDetails = document.querySelector('.fe-job-details');
  if (feJobDetails) {
    var descDiv = feJobDetails.querySelector('.description.text-body-sm');
    if (descDiv) {
      var desc = getInnerText(descDiv);
      if (desc.length > 10) return desc;
    }
  }

  // Job detail page: [data-test="Description"]
  var descEl = document.querySelector('[data-test="Description"]');
  if (descEl) {
    var desc2 = getInnerText(descEl);
    if (desc2.length > 10) return desc2;
  }

  // Fallback: div.break.mt-2
  var breakEl = document.querySelector('div.break.mt-2');
  if (breakEl) return getInnerText(breakEl);

  return '';
}

// ---- Budget extraction ----

function scrapeBudget() {
  // Proposal page: ul.fe-ui-job-features li with data-cy="fixed-price" or budget text
  var featureList = document.querySelector('ul.fe-ui-job-features');
  if (featureList) {
    var lis = featureList.querySelectorAll('li');
    for (var i = 0; i < lis.length; i++) {
      var li = lis[i];
      var strongEl = li.querySelector('strong');
      var smallEl = li.querySelector('small');
      var strongText = strongEl ? getText(strongEl) : '';
      var smallText = smallEl ? getText(smallEl).toLowerCase() : '';

      if (smallText.includes('fixed') || li.querySelector('[data-cy="fixed-price"]')) {
        var p = parseDollarAmount(strongText);
        return { type: 'fixed', min: p.min, max: p.max, amount: p.amount };
      }
      if (smallText.includes('hourly') || li.querySelector('[data-cy="clock-hourly"]')) {
        var p2 = parseDollarAmount(strongText);
        return { type: 'hourly', min: p2.min, max: p2.max, amount: p2.amount };
      }
    }
  }

  // Job detail page: ul.features li with .description
  var featureLis = document.querySelectorAll('ul.features li');
  for (var j = 0; j < featureLis.length; j++) {
    var li2 = featureLis[j];
    var descEl = li2.querySelector('.description');
    var descText = descEl ? getText(descEl).toLowerCase() : '';
    var strong2 = li2.querySelector('strong');
    var strong2Text = strong2 ? getText(strong2) : '';

    if (descText.includes('fixed') || li2.querySelector('[data-cy="fixed-price"]')) {
      var p3 = parseDollarAmount(strong2Text);
      return { type: 'fixed', min: p3.min, max: p3.max, amount: p3.amount };
    }
    if (descText.includes('hourly') || li2.querySelector('[data-cy="clock-hourly"]')) {
      var p4 = parseDollarAmount(strong2Text);
      return { type: 'hourly', min: p4.min, max: p4.max, amount: p4.amount };
    }
  }

  // Fallback: scan sections
  var sections = document.querySelectorAll('section.air3-card-section');
  for (var k = 0; k < sections.length; k++) {
    var text = sections[k].textContent || '';
    if (text.includes('Duration') || text.includes('Experience Level')) {
      var type = 'unknown';
      if (/\bHourly\b/i.test(text)) type = 'hourly';
      if (/\bFixed-price\b/i.test(text) || /\bFixed\b/i.test(text)) type = 'fixed';
      var dm = text.match(/\$([\d,.]+)/);
      if (dm) {
        var pa = parseDollarAmount('$' + dm[1]);
        return { type: type, min: pa.min, max: pa.max, amount: pa.amount };
      }
      return { type: type, min: null, max: null, amount: null };
    }
  }

  return { type: 'unknown', min: null, max: null, amount: null };
}

// ---- Skills extraction ----

function scrapeSkills() {
  // Proposal page: .air3-token elements inside job details
  var feJobDetails = document.querySelector('.fe-job-details');
  if (feJobDetails) {
    var tokens = feJobDetails.querySelectorAll('.air3-token');
    if (tokens.length > 0) {
      return Array.from(tokens).map(function (el) { return getText(el); }).filter(Boolean);
    }
  }

  // Job detail page: .air3-badge.air3-badge-highlight inside Skills section
  var sections = document.querySelectorAll('section.air3-card-section, section[class*="air3-card-section"]');
  for (var i = 0; i < sections.length; i++) {
    var text = sections[i].textContent || '';
    if (text.includes('Skills and Expertise')) {
      var badges = sections[i].querySelectorAll('.air3-badge.air3-badge-highlight');
      var skills = [];
      for (var j = 0; j < badges.length; j++) {
        var s = getText(badges[j]);
        if (s && !s.match(/^\+\s*\d+\s*more$/i)) skills.push(s);
      }
      return skills;
    }
  }

  return [];
}

// ---- Proposal count ----

function scrapeProposalCount() {
  var caItems = document.querySelectorAll('.ca-item');
  for (var i = 0; i < caItems.length; i++) {
    var titleEl = caItems[i].querySelector('.title');
    if (titleEl && getText(titleEl).match(/proposals/i)) {
      var valueEl = caItems[i].querySelector('.value');
      if (valueEl) return parseProposalCount(getText(valueEl));
    }
  }
  var pageText = document.body.innerText || '';
  var m = pageText.match(/Proposals:\s*\n?\s*(Less than \d+|\d+\s*to\s*\d+|\d+\+?)/i);
  if (m) return parseProposalCount(m[1]);
  return 0;
}

function scrapeProposalCountText() {
  var caItems = document.querySelectorAll('.ca-item');
  for (var i = 0; i < caItems.length; i++) {
    var titleEl = caItems[i].querySelector('.title');
    if (titleEl && getText(titleEl).match(/proposals/i)) {
      var valueEl = caItems[i].querySelector('.value');
      if (valueEl) return getText(valueEl);
    }
  }
  var pageText = document.body.innerText || '';
  var m = pageText.match(/Proposals:\s*\n?\s*(Less than \d+|\d+\s*to\s*\d+|\d+\+?)/i);
  if (m) return m[1].trim();
  return '';
}

// ---- Client info (only available on job detail page) ----

function scrapeClientInfo() {
  var info = {
    location: '',
    totalSpent: 0,
    avgHourlyRate: null,
    hireRate: 0,
    hireCount: 0,
    reviewCount: 0,
    memberSince: '',
    recentReviews: [],
    paymentVerified: false
  };

  // Location: [data-qa="client-location"] > strong
  var locEl = document.querySelector('[data-qa="client-location"] > strong');
  if (locEl) info.location = getText(locEl);
  if (!info.location) {
    var locFull = document.querySelector('[data-qa="client-location"]');
    if (locFull) {
      var s = locFull.querySelector('strong');
      info.location = s ? getText(s) : (locFull.textContent || '').split('\n')[0].trim();
    }
  }

  // Total spent: [data-qa="client-spend"]
  var spentEl = document.querySelector('[data-qa="client-spend"]');
  if (spentEl) {
    var spentParsed = parseDollarAmount(getText(spentEl));
    info.totalSpent = spentParsed.amount || 0;
  }

  // Avg hourly rate
  var avgEl = document.querySelector('[data-qa="client-hourly-rate"]');
  if (avgEl) {
    var avgParsed = parseDollarAmount(getText(avgEl));
    info.avgHourlyRate = avgParsed.amount;
  }

  // Hires
  var hiresEl = document.querySelector('[data-qa="client-hires"]');
  if (hiresEl) {
    var hm = getText(hiresEl).match(/(\d+)\s*hires?/i);
    if (hm) info.hireCount = parseInt(hm[1], 10);
  }

  // Hire rate from job posting stats
  var statsEl = document.querySelector('[data-qa="client-job-posting-stats"]');
  if (statsEl) {
    var hrm = getText(statsEl).match(/([\d.]+)%\s+hire\s+rate/i);
    if (hrm) info.hireRate = parseFloat(hrm[1]);
  }
  if (!info.hireRate) {
    var pt = document.body.innerText || '';
    var hrm2 = pt.match(/([\d.]+)%\s+hire\s+rate/i);
    if (hrm2) info.hireRate = parseFloat(hrm2[1]);
  }

  // Review count from rating section
  var ratingEl = document.querySelector('[data-testid="buyer-rating"]');
  if (ratingEl) {
    var rrm = getText(ratingEl).match(/of\s+(\d+)\s+reviews?/i);
    if (rrm) info.reviewCount = parseInt(rrm[1], 10);
  }
  if (!info.reviewCount) {
    var pt2 = document.body.innerText || '';
    var rrm2 = pt2.match(/([\d.]+)\s+of\s+(\d+)\s+reviews?/i);
    if (rrm2) info.reviewCount = parseInt(rrm2[2], 10);
  }

  // Member since
  var msEl = document.querySelector('[data-qa="client-contract-date"]');
  if (msEl) info.memberSince = getText(msEl).replace(/Member since\s*/i, '').trim();

  // Payment verified
  info.paymentVerified = !!document.querySelector('.payment-verified');

  return info;
}

// ---- Main scrape function ----

async function scrapeJobPage() {
  try {
    var currentUrl = window.location.href;

    if (_cachedJobData && _cachedUrl === currentUrl) {
      return _cachedJobData;
    }

    // Wait for page to render — different indicators for different pages
    await waitForAny([
      '[data-test="Description"]',       // job detail page
      '.fe-job-details',                  // proposal page
      '.fe-proposal-job-terms',           // proposal page terms section
      '[data-qa="client-location"]',      // job detail page
      '.job-details-card'                 // job detail page
    ], 8000);

    await new Promise(function (r) { setTimeout(r, 1500); });

    var onProposalPage = isProposalPage();
    console.log('[Upwork Scraper] Page type:', onProposalPage ? 'PROPOSAL' : 'JOB DETAIL');

    var title = scrapeTitle();
    var description = scrapeDescription();
    var budget = scrapeBudget();
    var skills = scrapeSkills();
    var client = scrapeClientInfo();
    var proposalCount = scrapeProposalCount();
    var proposalCountText = scrapeProposalCountText();

    var jobData = {
      title: title,
      description: description,
      budget: budget,
      skills: skills,
      client: client,
      proposalCount: proposalCount,
      proposalCountText: proposalCountText,
      url: currentUrl,
      isProposalPage: onProposalPage
    };

    _cachedJobData = jobData;
    _cachedUrl = currentUrl;

    console.log('[Upwork Scraper] Scraped data:', JSON.stringify(jobData, null, 2));
    return jobData;

  } catch (err) {
    console.error('[Upwork Scraper] Error:', err);
    return {
      title: '', description: '',
      budget: { type: 'unknown', min: null, max: null, amount: null },
      skills: [],
      client: { location: '', totalSpent: 0, avgHourlyRate: null, hireRate: 0,
                hireCount: 0, reviewCount: 0, memberSince: '', recentReviews: [],
                paymentVerified: false },
      proposalCount: 0, proposalCountText: '', url: window.location.href,
      isProposalPage: false
    };
  }
}

function clearScraperCache() {
  _cachedJobData = null;
  _cachedUrl = null;
}
