// @ts-nocheck — TODO: tighten types in a follow-up iter
/**
 * Boost-Connects ROI calculator.
 * Heuristic v1 — deterministic formula based on client + alignment signals.
 * Calibrate from outcome data once Phase 3 ingests view/reply events.
 *
 * Output: { recommendation: 'recommended' | 'neutral' | 'skip', reason, score, breakdown }
 */

const ROI_THRESHOLD_RECOMMEND = 1.5;
const ROI_THRESHOLD_NEUTRAL = 0.5;

/**
 * Calculate boost ROI for a given job + profile + alignment context.
 *
 * @param {object} jobData
 * @param {object} profile
 * @param {object} alignment   - From alignment.service.js: { overall: 0..10 }
 * @param {object} options     - { boostCost?: number (Connects, default 4) }
 * @returns {{ recommendation, reason, score, breakdown }}
 */
export function calc(jobData, profile, alignment, options = {}) {
  const boostCost = options.boostCost ?? 4;
  const client = jobData?.client || {};
  const clientSpend = num(client.totalSpent, 0);
  // null/undefined hireRate → use 0.3 as neutral default (unknown history).
  // A real 0% hire rate is a meaningful negative signal and must be preserved as-is.
  const hireRate = client.hireRate == null
    ? 0.3                              // unknown → neutral default
    : Number(client.hireRate) / 100;   // known (including 0%) → use exact value
  const proposalCount = num(jobData?.proposalCount, 0);
  const fit = num(alignment?.overall, 0) / 10;     // 0..1

  // Freshness proxy: lower as proposalCount climbs (no explicit timestamp available)
  const freshness = proposalCount === 0 ? 1.2 : Math.max(0.3, 1.5 - proposalCount * 0.05);

  // Spend factor: caps at 2.0 once client has spent $10K+
  const spendFactor = clamp(clientSpend / 5000, 0, 2.0);
  const numerator = spendFactor * hireRate * fit * freshness;
  const denominator = Math.max(1, proposalCount) * (boostCost / 4);
  const roi = numerator / denominator;

  // Hard rules first — these override the ROI score
  if (clientSpend < 100 && !client.paymentVerified) {
    return done('skip', 'Client is new and unverified — boosting Connects here is high-risk for low expected return.', roi, build());
  }
  if (alignment?.overall != null && alignment.overall < 5) {
    return done(
      'skip',
      `Profile-job alignment is low (${formatNum(alignment.overall)}/10). Boost won't help if you don't fit the job.`,
      roi,
      build(),
    );
  }
  if (proposalCount >= 50) {
    return done('skip', `Too much competition (${proposalCount} proposals). Boost rarely cuts through at this density.`, roi, build());
  }

  if (roi >= ROI_THRESHOLD_RECOMMEND) {
    return done(
      'recommended',
      `Strong client ($${formatSpend(clientSpend)} spent, ${Math.round(hireRate * 100)}% hire rate), ` +
        `good fit (${formatNum(alignment?.overall ?? 0)}/10), manageable competition (${proposalCount}). Boost looks worth it.`,
      roi,
      build(),
    );
  }
  if (roi >= ROI_THRESHOLD_NEUTRAL) {
    return done(
      'neutral',
      `Mixed signals (ROI ~${formatNum(roi, 2)}). Boost is a coin flip — save Connects for higher-confidence jobs.`,
      roi,
      build(),
    );
  }
  return done(
    'skip',
    `Low expected return (ROI ~${formatNum(roi, 2)}). ${proposalCount > 30 ? 'Heavy competition. ' : ''}` +
      `${clientSpend < 1000 ? 'Client spend is low.' : ''}`.trim(),
    roi,
    build(),
  );

  function build() {
    return {
      clientSpend,
      hireRate,
      proposalCount,
      fit: roundTo(fit, 2),
      freshness: roundTo(freshness, 2),
      boostCost,
      threshold_recommend: ROI_THRESHOLD_RECOMMEND,
      threshold_neutral: ROI_THRESHOLD_NEUTRAL,
    };
  }
}

function done(recommendation, reason, score, breakdown) {
  return {
    recommendation,
    reason,
    score: roundTo(score, 2),
    breakdown,
  };
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function roundTo(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function formatNum(n, decimals = 1) {
  if (n == null || !Number.isFinite(Number(n))) return '?';
  return Number(n).toFixed(decimals);
}

function formatSpend(s) {
  if (s >= 10000) return `${Math.round(s / 1000)}K`;
  if (s >= 1000) return `${(s / 1000).toFixed(1)}K`;
  return String(s);
}