/**
 * vetting.js
 * Comprehensive client vetting with red flag detection.
 * Relies on ALLOWED_LOCATIONS and VETTING_THRESHOLDS from constants.js.
 */

function getCompetitionLevel(count) {
  if (count < 5) return 'low';
  if (count <= 15) return 'medium';
  return 'high';
}

function deriveRecentSentiment(recentReviews) {
  if (!recentReviews || recentReviews.length === 0) return 'none';

  var negativeWords = /\b(bad|poor|terrible|awful|disappointing|slow|rude|unprofessional|scam|fraud|dishonest|late|incomplete|worst|waste|avoid|never again|horrible|unresponsive)\b/i;
  var positiveWords = /\b(great|excellent|good|awesome|fantastic|professional|quick|responsive|reliable|perfect|highly recommend|amazing|outstanding|superb|pleasure)\b/i;

  var positiveCount = 0;
  var negativeCount = 0;

  for (var i = 0; i < recentReviews.length; i++) {
    if (negativeWords.test(recentReviews[i])) negativeCount++;
    if (positiveWords.test(recentReviews[i])) positiveCount++;
  }

  if (negativeCount > positiveCount) return 'negative';
  if (positiveCount > 0 && negativeCount === 0) return 'positive';
  if (positiveCount > 0) return 'mixed';
  return 'neutral';
}

/**
 * Detect red flags from job + client data.
 * Returns array of { severity: 'high'|'medium'|'low', flag: string, detail: string }
 */
function detectRedFlags(clientInfo, jobData) {
  var flags = [];

  // --- Payment not verified ---
  if (clientInfo.paymentVerified === false) {
    flags.push({
      severity: 'high',
      flag: 'Payment Unverified',
      detail: 'Client has not verified their payment method — high risk of non-payment'
    });
  }

  // --- Brand new account ---
  if (clientInfo.memberSince) {
    var memberDate = new Date(clientInfo.memberSince);
    var now = new Date();
    var monthsOld = (now.getFullYear() - memberDate.getFullYear()) * 12 + (now.getMonth() - memberDate.getMonth());
    if (monthsOld < 3) {
      flags.push({
        severity: 'medium',
        flag: 'New Account',
        detail: 'Client joined less than 3 months ago — limited track record'
      });
    }
  }

  // --- Zero spend history ---
  if (!clientInfo.totalSpent || clientInfo.totalSpent === 0) {
    flags.push({
      severity: 'medium',
      flag: 'No Spending History',
      detail: 'Client has never paid a freelancer on Upwork'
    });
  }

  // --- Very low avg hourly rate (cheap client) ---
  if (clientInfo.avgHourlyRate && clientInfo.avgHourlyRate < 5) {
    flags.push({
      severity: 'medium',
      flag: 'Very Low Pay Rate',
      detail: 'Client pays avg $' + clientInfo.avgHourlyRate.toFixed(2) + '/hr — significantly below market'
    });
  }

  // --- Zero hire rate ---
  if (clientInfo.hireRate === 0 && clientInfo.hireCount === 0 && clientInfo.totalSpent > 0) {
    flags.push({
      severity: 'medium',
      flag: 'Posts But Never Hires',
      detail: 'Client has spent money but current hire rate is 0%'
    });
  }

  // --- Negative review sentiment ---
  if (clientInfo.recentReviews && clientInfo.recentReviews.length > 0) {
    var sentiment = deriveRecentSentiment(clientInfo.recentReviews);
    if (sentiment === 'negative') {
      flags.push({
        severity: 'high',
        flag: 'Negative Reviews',
        detail: 'Recent freelancer reviews are predominantly negative'
      });
    }
  }

  // --- Job description too short/vague ---
  if (jobData && jobData.description) {
    var wordCount = jobData.description.trim().split(/\s+/).length;
    if (wordCount < 30) {
      flags.push({
        severity: 'low',
        flag: 'Vague Description',
        detail: 'Job description is only ' + wordCount + ' words — may lack clear requirements'
      });
    }
  }

  // --- Unrealistic budget for scope ---
  if (jobData && jobData.budget) {
    var budget = jobData.budget;
    var desc = jobData.description || '';
    var descWords = desc.trim().split(/\s+/).length;

    // If description is detailed (100+ words) but budget is tiny (<$50), flag it
    if (budget.type === 'fixed' && budget.amount && budget.amount < 50 && descWords > 100) {
      flags.push({
        severity: 'medium',
        flag: 'Budget vs Scope Mismatch',
        detail: 'Detailed requirements ($' + budget.amount + ' budget for ' + descWords + '-word description)'
      });
    }
  }

  // --- Extremely high competition ---
  if (clientInfo.proposalCount && clientInfo.proposalCount >= 50) {
    flags.push({
      severity: 'low',
      flag: 'Saturated Job',
      detail: clientInfo.proposalCount + '+ proposals already submitted — very competitive'
    });
  }

  return flags;
}

/**
 * Vet an Upwork client. Returns vetting results + red flags.
 */
function vetClient(clientInfo, jobData) {
  var ci = clientInfo || {};
  var location = ci.location || '';
  var totalSpent = ci.totalSpent || 0;
  var hireRate = ci.hireRate || 0;
  var hireCount = ci.hireCount || 0;
  var reviewCount = ci.reviewCount || 0;
  var recentReviews = ci.recentReviews || [];
  var proposalCount = ci.proposalCount || 0;

  // ---- Location check ----
  var locationNormalized = location.trim();
  var isAllowedLocation = ALLOWED_LOCATIONS.some(function (allowed) {
    return locationNormalized.toLowerCase().includes(allowed.toLowerCase());
  });
  var locationCheck = {
    status: isAllowedLocation ? 'good' : 'warning',
    location: locationNormalized || 'Unknown',
    message: isAllowedLocation
      ? 'Target location: ' + locationNormalized
      : locationNormalized
        ? 'Outside target: ' + locationNormalized
        : 'Location not available'
  };

  // ---- Spending check ----
  var spendingStatus, spendingMessage;
  if (totalSpent < 100) {
    spendingStatus = 'none';
    spendingMessage = 'No spending history (<$100)';
  } else if (totalSpent < VETTING_THRESHOLDS.minSpent) {
    spendingStatus = 'low';
    spendingMessage = 'Low spending ($' + totalSpent.toLocaleString() + ')';
  } else {
    spendingStatus = 'good';
    spendingMessage = 'Good spending ($' + totalSpent.toLocaleString() + ')';
  }
  var spendingCheck = { status: spendingStatus, totalSpent: totalSpent, message: spendingMessage };

  // ---- Hire rate check ----
  var hireRateStatus, hireRateMessage;
  if (hireRate > 0) {
    if (hireRate < 10) {
      hireRateStatus = 'none';
      hireRateMessage = 'Very low hire rate (' + hireRate + '%)';
    } else if (hireRate < VETTING_THRESHOLDS.minHireRate) {
      hireRateStatus = 'low';
      hireRateMessage = 'Below-average hire rate (' + hireRate + '%)';
    } else {
      hireRateStatus = 'good';
      hireRateMessage = 'Good hire rate (' + hireRate + '%)';
    }
  } else if (hireCount > 0) {
    if (hireCount >= 5) {
      hireRateStatus = 'good';
      hireRateMessage = hireCount + ' hires on Upwork';
    } else if (hireCount >= 2) {
      hireRateStatus = 'low';
      hireRateMessage = 'Only ' + hireCount + ' hires';
    } else {
      hireRateStatus = 'few';
      hireRateMessage = 'Only ' + hireCount + ' hire';
    }
  } else {
    hireRateStatus = 'none';
    hireRateMessage = 'No hire history';
  }
  var hireRateCheck = { status: hireRateStatus, hireRate: hireRate, message: hireRateMessage };

  // ---- Reviews check ----
  var recentSentiment = deriveRecentSentiment(recentReviews);
  var reviewsStatus, reviewsMessage;
  if (reviewCount === 0) {
    reviewsStatus = 'none';
    reviewsMessage = 'No reviews yet';
  } else if (reviewCount < VETTING_THRESHOLDS.minReviews) {
    reviewsStatus = 'few';
    reviewsMessage = 'Few reviews (' + reviewCount + ')';
  } else {
    reviewsStatus = 'good';
    reviewsMessage = reviewCount + ' reviews (' + recentSentiment + ' sentiment)';
  }
  var reviewsCheck = { status: reviewsStatus, count: reviewCount, recentSentiment: recentSentiment, message: reviewsMessage };

  // ---- Proposal competition ----
  var competitionLevel = getCompetitionLevel(proposalCount);
  var competitionMessages = {
    low: 'Low competition — ' + proposalCount + ' proposals',
    medium: 'Medium competition — ' + proposalCount + ' proposals',
    high: 'High competition — ' + proposalCount + '+ proposals'
  };
  var proposalCompetition = {
    level: competitionLevel,
    count: proposalCount,
    message: competitionMessages[competitionLevel]
  };

  // ---- Red Flags ----
  var redFlags = detectRedFlags(ci, jobData);
  var highFlags = redFlags.filter(function (f) { return f.severity === 'high'; });
  var medFlags = redFlags.filter(function (f) { return f.severity === 'medium'; });

  // ---- Overall rating (now includes red flags) ----
  var hasLocationWarning = locationCheck.status === 'warning';
  var hasCriticalWeakness = spendingStatus === 'none' || hireRateStatus === 'none';

  var overall;
  if (highFlags.length > 0) {
    overall = 'red';
  } else if (hasLocationWarning && hasCriticalWeakness) {
    overall = 'red';
  } else if (medFlags.length >= 2) {
    overall = 'red';
  } else if (
    hasLocationWarning || hasCriticalWeakness ||
    spendingStatus === 'low' || hireRateStatus === 'low' ||
    reviewsStatus === 'none' || reviewsStatus === 'few' ||
    medFlags.length > 0
  ) {
    overall = 'yellow';
  } else {
    overall = 'green';
  }

  return {
    overall: overall,
    locationCheck: locationCheck,
    spendingCheck: spendingCheck,
    hireRateCheck: hireRateCheck,
    reviewsCheck: reviewsCheck,
    proposalCompetition: proposalCompetition,
    redFlags: redFlags
  };
}
