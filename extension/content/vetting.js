/**
 * vetting.js
 * Vets an Upwork client based on their profile data.
 * Relies on ALLOWED_LOCATIONS and VETTING_THRESHOLDS from constants.js (loaded first).
 */

/**
 * Map a numeric proposal count to a competition level string.
 * @param {number} count
 * @returns {'low'|'medium'|'high'}
 */
function getCompetitionLevel(count) {
  if (count < 5) return 'low';
  if (count <= 15) return 'medium';
  return 'high';
}

/**
 * Derive a simple sentiment label from recent review texts.
 * @param {string[]} recentReviews
 * @returns {'positive'|'mixed'|'negative'|'none'}
 */
function deriveRecentSentiment(recentReviews) {
  if (!recentReviews || recentReviews.length === 0) return 'none';

  const negativeWords = /\b(bad|poor|terrible|awful|disappointing|slow|rude|unprofessional|scam|fraud|dishonest|late|incomplete)\b/i;
  const positiveWords = /\b(great|excellent|good|awesome|fantastic|professional|quick|responsive|reliable|perfect|highly recommend)\b/i;

  let positiveCount = 0;
  let negativeCount = 0;

  for (const review of recentReviews) {
    if (negativeWords.test(review)) negativeCount++;
    if (positiveWords.test(review)) positiveCount++;
  }

  if (negativeCount > positiveCount) return 'negative';
  if (positiveCount > 0) return 'positive';
  return 'mixed';
}

/**
 * Vet an Upwork client.
 * @param {{
 *   location?: string,
 *   totalSpent?: number,
 *   hireRate?: number,
 *   reviewCount?: number,
 *   recentReviews?: string[],
 *   proposalCount?: number
 * }} clientInfo
 * @returns {{
 *   overall: 'green'|'yellow'|'red',
 *   locationCheck: { status: string, location: string, message: string },
 *   spendingCheck: { status: string, totalSpent: number, message: string },
 *   hireRateCheck: { status: string, hireRate: number, message: string },
 *   reviewsCheck: { status: string, count: number, recentSentiment: string, message: string },
 *   proposalCompetition: { level: string, count: number, message: string }
 * }}
 */
function vetClient(clientInfo) {
  const {
    location = '',
    totalSpent = 0,
    hireRate = 0,
    reviewCount = 0,
    recentReviews = [],
    proposalCount = 0
  } = clientInfo || {};

  // ---- Location check (warning only — NOT blocking) ----
  const locationNormalized = (location || '').trim();
  const isAllowedLocation = ALLOWED_LOCATIONS.some(
    (allowed) => locationNormalized.toLowerCase().includes(allowed.toLowerCase())
  );
  const locationCheck = {
    status: isAllowedLocation ? 'good' : 'warning',
    location: locationNormalized || 'Unknown',
    message: isAllowedLocation
      ? `Client is in a target location: ${locationNormalized}`
      : locationNormalized
        ? `Client location "${locationNormalized}" is outside target countries`
        : 'Client location is not available'
  };

  // ---- Spending check ----
  let spendingStatus;
  let spendingMessage;
  if (totalSpent < 100) {
    spendingStatus = 'none';
    spendingMessage = 'No significant spending history (<$100)';
  } else if (totalSpent < VETTING_THRESHOLDS.minSpent) {
    spendingStatus = 'low';
    spendingMessage = `Low spending history ($${totalSpent.toLocaleString()})`;
  } else {
    spendingStatus = 'good';
    spendingMessage = `Good spending history ($${totalSpent.toLocaleString()})`;
  }
  const spendingCheck = {
    status: spendingStatus,
    totalSpent,
    message: spendingMessage
  };

  // ---- Hire rate check ----
  // Use hireCount as fallback when hireRate % is not available
  var hireCount = clientInfo.hireCount || 0;
  let hireRateStatus;
  let hireRateMessage;
  if (hireRate > 0) {
    // We have a percentage
    if (hireRate < 10) {
      hireRateStatus = 'none';
      hireRateMessage = `Very low hire rate (${hireRate}%)`;
    } else if (hireRate < VETTING_THRESHOLDS.minHireRate) {
      hireRateStatus = 'low';
      hireRateMessage = `Below-average hire rate (${hireRate}%)`;
    } else {
      hireRateStatus = 'good';
      hireRateMessage = `Good hire rate (${hireRate}%)`;
    }
  } else if (hireCount > 0) {
    // Fallback: use hire count
    if (hireCount >= 5) {
      hireRateStatus = 'good';
      hireRateMessage = `${hireCount} hires on Upwork`;
    } else if (hireCount >= 2) {
      hireRateStatus = 'low';
      hireRateMessage = `Only ${hireCount} hires on Upwork`;
    } else {
      hireRateStatus = 'few';
      hireRateMessage = `Only ${hireCount} hire on Upwork`;
    }
  } else {
    hireRateStatus = 'none';
    hireRateMessage = 'No hire history';
  }
  const hireRateCheck = {
    status: hireRateStatus,
    hireRate,
    message: hireRateMessage
  };

  // ---- Reviews check ----
  const recentSentiment = deriveRecentSentiment(recentReviews);
  let reviewsStatus;
  let reviewsMessage;
  if (reviewCount === 0) {
    reviewsStatus = 'none';
    reviewsMessage = 'No reviews yet';
  } else if (reviewCount < VETTING_THRESHOLDS.minReviews) {
    reviewsStatus = 'few';
    reviewsMessage = `Few reviews (${reviewCount})`;
  } else {
    reviewsStatus = 'good';
    reviewsMessage = `${reviewCount} reviews (${recentSentiment} sentiment)`;
  }
  const reviewsCheck = {
    status: reviewsStatus,
    count: reviewCount,
    recentSentiment,
    message: reviewsMessage
  };

  // ---- Proposal competition ----
  const competitionLevel = getCompetitionLevel(proposalCount);
  const competitionMessages = {
    low: `Low competition — only ${proposalCount} proposals`,
    medium: `Medium competition — ${proposalCount} proposals`,
    high: `High competition — ${proposalCount} proposals submitted`
  };
  const proposalCompetition = {
    level: competitionLevel,
    count: proposalCount,
    message: competitionMessages[competitionLevel]
  };

  // ---- Overall rating ----
  // Red: location warning AND (spending=none OR hireRate=none)
  // Yellow: any single warning/low/few (but not triggering red)
  // Green: all pass
  const hasLocationWarning = locationCheck.status === 'warning';
  const hasCriticalWeakness =
    spendingStatus === 'none' || hireRateStatus === 'none';

  let overall;
  if (hasLocationWarning && hasCriticalWeakness) {
    overall = 'red';
  } else if (
    hasLocationWarning ||
    spendingStatus === 'none' ||
    spendingStatus === 'low' ||
    hireRateStatus === 'none' ||
    hireRateStatus === 'low' ||
    reviewsStatus === 'none' ||
    reviewsStatus === 'few'
  ) {
    overall = 'yellow';
  } else {
    overall = 'green';
  }

  return {
    overall,
    locationCheck,
    spendingCheck,
    hireRateCheck,
    reviewsCheck,
    proposalCompetition
  };
}
