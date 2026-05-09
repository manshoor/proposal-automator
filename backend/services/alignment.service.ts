// @ts-nocheck — TODO: tighten types in a follow-up iter
/**
 * Profile-job alignment scoring.
 * Deterministic — same input always produces same output. No LLM calls.
 *
 * Output: { skillOverlap (0..1), titleMatch (0..1), rateFit, overall (0..10), breakdown }
 */

const STOPWORDS_TITLE = new Set([
  'developer', 'engineer', 'specialist', 'expert', 'professional', 'consultant',
  'a', 'an', 'the', 'and', 'or', 'of', 'with', 'for', 'in', 'at', 'by', 'to', 'from',
]);

/**
 * Score the fit between the freelancer profile and the job posting.
 *
 * @param {object} profile  - { title, skills[], default_hourly_rate, ... }
 * @param {object} job      - { title, description, skills[], budget?, budgetType?, ... }
 * @returns {{ skillOverlap, titleMatch, rateFit, overall, breakdown }}
 */
export function score(profile, job) {
  const profileSkills = normalizeSkills(profile?.skills);
  const jobSkills = normalizeSkills(job?.skills);
  const skillOverlap = jaccard(profileSkills, jobSkills);

  const titleMatch = scoreTitleMatch(profile?.title || '', job?.title || '', job?.description || '');
  const rateFit = scoreRateFit(profile, job);

  // Numeric translation of rateFit for the weighted average
  const rateFitNumeric = ({ right: 1.0, low: 0.5, high: 0.3, unknown: 0.6 })[rateFit] ?? 0.6;

  // Weighted average: skills 50%, title 30%, rate 20% — produces 0..1
  const weighted = skillOverlap * 0.5 + titleMatch * 0.3 + rateFitNumeric * 0.2;

  const sharedSkills = [...new Set(profileSkills.filter(s => jobSkills.includes(s)))];

  return {
    skillOverlap: roundTo(skillOverlap, 2),
    titleMatch: roundTo(titleMatch, 2),
    rateFit,
    overall: roundTo(weighted * 10, 1),  // 0..10
    breakdown: {
      profileSkills,
      jobSkills,
      sharedSkills,
      profileRate: profile?.default_hourly_rate ?? null,
      jobBudgetSummary: summarizeBudget(job),
    },
  };
}

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.map(s => String(s).toLowerCase().trim()).filter(Boolean);
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function scoreTitleMatch(profileTitle, jobTitle, jobDescription) {
  const titleWords = profileTitle.toLowerCase().match(/\b[a-z][a-z0-9-]{2,}\b/g) || [];
  const significant = titleWords.filter(w => !STOPWORDS_TITLE.has(w));
  if (significant.length === 0) return 0;
  const haystack = (jobTitle + ' ' + jobDescription).toLowerCase();
  const matches = significant.filter(w => haystack.includes(w));
  return matches.length / significant.length;
}

function scoreRateFit(profile, job) {
  const rate = Number(profile?.default_hourly_rate);
  if (!Number.isFinite(rate) || rate <= 0) return 'unknown';

  const budget = job?.budget || {};
  const type = budget.type || job?.budgetType;

  if (type === 'hourly') {
    const min = num(budget.min ?? job?.budgetMin);
    const max = num(budget.max ?? job?.budgetMax);
    if (!min && !max) return 'unknown';
    const lo = min || max * 0.6;
    const hi = max || min * 1.6;
    if (rate < lo * 0.7) return 'low';
    if (rate > hi * 1.4) return 'high';
    return 'right';
  }

  if (type === 'fixed') {
    const total = num(budget.amount ?? job?.budgetAmount ?? budget.max ?? job?.budgetMax);
    if (!total) return 'unknown';
    const impliedHours = total / rate;
    if (impliedHours < 5) return 'high';      // your rate is too high; can't fit any meaningful work
    if (impliedHours > 200) return 'low';     // your rate is too low; project would take forever at this rate
    return 'right';
  }

  return 'unknown';
}

function summarizeBudget(job) {
  const budget = job?.budget || {};
  const type = budget.type || job?.budgetType || 'unknown';
  const amount = budget.amount || job?.budgetAmount;
  const min = budget.min || job?.budgetMin;
  const max = budget.max || job?.budgetMax;
  if (type === 'fixed' && amount) return `Fixed $${amount}`;
  if (type === 'fixed' && min && max) return `Fixed $${min}-$${max}`;
  if (type === 'hourly' && min && max) return `Hourly $${min}-$${max}/hr`;
  return 'Budget unclear';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function roundTo(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}