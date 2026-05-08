/**
 * Suggest a specific bid amount given job + profile + alignment + boost decision.
 * Deterministic — no LLM calls. All weights are tunable constants at the top.
 */

const ALIGNMENT_BUMP_THRESHOLD = 8;          // alignment.overall >= this → nudge rate up
const ALIGNMENT_PENALTY_THRESHOLD = 5;       // alignment.overall <= this → nudge rate down
const HIGH_SPEND_BUMP = 5000;                // client.totalSpent >= this → nudge rate up
const HIGH_COMPETITION = 30;                 // proposalCount >= this → nudge rate down
const RANGE_PERCENT = 0.15;                  // ±15% from suggested
const MAX_BUMP = 0.20;                       // never nudge >20% from profile rate
const NUDGE_PER_FACTOR = 0.05;               // each factor nudges 5%

// ---- Public types ----

export interface JobData {
  budget?: { type?: string; amount?: number };
  budgetType?: string;
  budgetAmount?: number;
  proposalCount?: number;
  client?: { totalSpent?: number };
}

export interface Profile {
  default_hourly_rate?: number | string;
}

export interface Alignment {
  overall?: number;
}

export interface BoostDecision {
  shouldBoost?: boolean;
}

export interface HourlyRecommendation {
  min: number;
  suggested: number;
  max: number;
  reason: string;
}

export interface Milestone {
  description: string;
  amount: number;
  reason: string;
}

export type Recommendation =
  | { hourly: HourlyRecommendation }
  | { milestones: Milestone[] | null }
  | null;

export function recommend(
  jobData: JobData | null | undefined,
  profile: Profile | null | undefined,
  alignment: Alignment | null | undefined,
  boostDecision: BoostDecision | null | undefined,
): Recommendation {
  const budgetType = jobData?.budget?.type || jobData?.budgetType || 'unknown';

  if (budgetType === 'hourly') {
    return { hourly: recommendHourly(jobData, profile, alignment, boostDecision) };
  }
  if (budgetType === 'fixed') {
    return { milestones: recommendMilestones(jobData, profile, alignment) };
  }
  // Unknown budget type — return null so callers can fall through gracefully.
  return null;
}

function recommendHourly(
  jobData: JobData | null | undefined,
  profile: Profile | null | undefined,
  alignment: Alignment | null | undefined,
  _boostDecision: BoostDecision | null | undefined,
): HourlyRecommendation {
  const baseRate = Number(profile?.default_hourly_rate) || 50;
  const reasons: string[] = [];
  let bumpFactor = 0;

  const overall = alignment?.overall;
  if (typeof overall === 'number' && overall >= ALIGNMENT_BUMP_THRESHOLD) {
    bumpFactor += NUDGE_PER_FACTOR;
    reasons.push(`high alignment (${overall.toFixed(1)}/10) — premium pricing justified`);
  }
  if (typeof overall === 'number' && overall <= ALIGNMENT_PENALTY_THRESHOLD) {
    bumpFactor -= NUDGE_PER_FACTOR;
    reasons.push(`low alignment (${overall.toFixed(1)}/10) — competitive pricing helps`);
  }
  const clientSpent = Number(jobData?.client?.totalSpent) || 0;
  if (clientSpent >= HIGH_SPEND_BUMP) {
    bumpFactor += NUDGE_PER_FACTOR;
    reasons.push(`high-spend client ($${(clientSpent / 1000).toFixed(0)}K+) — they pay for quality`);
  }
  const proposalCount = Number(jobData?.proposalCount) || 0;
  if (proposalCount >= HIGH_COMPETITION) {
    bumpFactor -= NUDGE_PER_FACTOR;
    reasons.push(`heavy competition (${proposalCount} proposals) — need to stand out on price`);
  }

  // Cap the bump
  bumpFactor = Math.max(-MAX_BUMP, Math.min(MAX_BUMP, bumpFactor));

  const suggested = Math.round(baseRate * (1 + bumpFactor));
  const min = Math.round(suggested * (1 - RANGE_PERCENT));
  const max = Math.round(suggested * (1 + RANGE_PERCENT));

  if (reasons.length === 0) {
    reasons.push(`Anchored on your profile rate ($${baseRate}/hr)`);
  }

  return { min, suggested, max, reason: reasons.join('; ') };
}

function recommendMilestones(
  jobData: JobData | null | undefined,
  _profile: Profile | null | undefined,
  _alignment: Alignment | null | undefined,
): Milestone[] | null {
  const totalAmount = Number(jobData?.budget?.amount) || Number(jobData?.budgetAmount) || 0;
  if (totalAmount === 0) return null;

  // Existing milestone-count rule (per the system prompt):
  // <$500: 2 milestones; $500–$1000: 3; >$1000: 3-4
  let count: 2 | 3 | 4;
  if (totalAmount < 500) count = 2;
  else if (totalAmount <= 1000) count = 3;
  else count = 4;

  // Distribute weights — front-load discovery/setup, back-load delivery
  // 2-milestone: 50/50
  // 3-milestone: 30/40/30
  // 4-milestone: 20/30/30/20
  const distributions: Record<2 | 3 | 4, number[]> = {
    2: [0.5, 0.5],
    3: [0.3, 0.4, 0.3],
    4: [0.2, 0.3, 0.3, 0.2],
  };
  const weights = distributions[count];

  const labels: Record<2 | 3 | 4, string[]> = {
    2: ['Discovery & implementation', 'Final delivery & polish'],
    3: ['Discovery & setup', 'Core implementation', 'Polish & handover'],
    4: ['Discovery & planning', 'Core implementation', 'Integration & QA', 'Polish & handover'],
  };

  return weights.map((w, i) => ({
    description: labels[count][i],
    amount: Math.round(totalAmount * w),
    reason:
      count === 2 ? 'Two-stage delivery (50/50)'
      : count === 3 ? 'Three-stage delivery (30/40/30 — heavy implementation phase)'
      : 'Four-stage delivery (20/30/30/20 — balanced with QA phase)',
  }));
}
