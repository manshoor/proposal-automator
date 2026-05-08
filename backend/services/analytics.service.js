import * as analyticsRepo from '../repositories/analytics.repository.js';
import * as insightRepo from '../repositories/insight.repository.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis.js';

/**
 * Fetches and formats analytics data for proposals, skills, connects, and status.
 *
 * @param {string|null} userId
 * @returns {Promise<{summary, weeklyProposals, topSkills, statusBreakdown, connects, weeklyConnects}>}
 */
export async function getAnalytics(userId = null) {
  const cacheKey = 'analytics:' + (userId || 'global');
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const {
    summaryResult,
    weeklyResult,
    topSkillsResult,
    statusBreakdownResult,
    connectsResult,
    connectWeeklyResult,
  } = await analyticsRepo.getSummary(userId);

  const raw = summaryResult.rows[0];
  const summary = {
    total: parseInt(raw.total, 10),
    sent: parseInt(raw.sent, 10),
    hired: parseInt(raw.hired, 10),
    rejected: parseInt(raw.rejected, 10),
    pending: parseInt(raw.pending, 10),
    withdrawn: parseInt(raw.withdrawn, 10),
    winRate: parseFloat(raw.win_rate) || 0,
    avgHourlyRate: parseFloat(raw.avg_hourly_rate) || 0,
  };

  const weeklyProposals = weeklyResult.rows.map(r => ({
    week: r.week,
    count: parseInt(r.count, 10),
  }));

  const topSkills = topSkillsResult.rows.map(r => ({
    skill: r.skill,
    count: parseInt(r.count, 10),
  }));

  const statusBreakdown = statusBreakdownResult.rows.map(r => ({
    status: r.status,
    count: parseInt(r.count, 10),
  }));

  const cr = connectsResult.rows[0] || {};
  const connects = {
    totalConnects: parseInt(cr.total_connects, 10) || 0,
    weeklyConnects: parseInt(cr.weekly_connects, 10) || 0,
    connectsForHires: parseInt(cr.connects_for_hires, 10) || 0,
    totalEarnings: parseFloat(cr.total_earnings) || 0,
    totalConnectCostUsd: parseFloat(cr.total_connect_cost_usd) || 0,
    roiMultiplier: parseFloat(cr.roi_multiplier) || 0,
    connectsPerHire: cr.total_hired_count > 0
      ? Math.round(parseInt(cr.connects_for_hires, 10) / parseInt(cr.total_hired_count, 10))
      : 0,
  };

  const weeklyConnects = connectWeeklyResult.rows.map(r => ({
    week: r.week,
    connects: parseInt(r.connects, 10),
  }));

  const result = { summary, weeklyProposals, topSkills, statusBreakdown, connects, weeklyConnects };
  await cacheSet(cacheKey, JSON.stringify(result), 300);
  return result;
}

/**
 * Analyze proposal outcomes and generate learned patterns using LLM.
 */
export async function learnFromOutcomes(llmConfig, userId) {
  const { winners, losers, totalWinners, totalLosers } = await insightRepo.getOutcomeBuckets(userId, 15);
  const totalTracked = totalWinners + totalLosers;

  if (totalTracked < 5) {
    return { insights: [], message: `Need at least 5 tracked proposals. You have ${totalTracked}.` };
  }

  const summarize = (list) => list.map(p => ({
    title: p.job_title,
    skills: p.job_skills,
    budget: p.job_budget_amount,
    client_spent: p.client_total_spent,
    length: p.proposal_length || (p.proposal_text ? p.proposal_text.length : 0),
    opening: p.proposal_text ? p.proposal_text.substring(0, 230) : '',
    decline_reason: p.decline_reason || '',
  }));

  const { provider, apiKey } = await resolveLLMConfig(llmConfig, userId);

  const systemPrompt = `You are a proposal performance analyst. Analyze winning vs losing Upwork proposals and identify actionable patterns. Return ONLY valid JSON.`;

  const userPrompt = `WINNING PROPOSALS (${totalWinners} total, showing up to 15):
${JSON.stringify(summarize(winners), null, 2)}

LOSING PROPOSALS (${totalLosers} total, showing up to 15):
${JSON.stringify(summarize(losers), null, 2)}

STATS:
- Win rate: ${totalTracked > 0 ? Math.round((totalWinners / totalTracked) * 100) : 0}%
- Avg winning proposal length (sample): ${winners.length > 0 ? Math.round(winners.reduce((s, p) => s + (p.proposal_length || 0), 0) / winners.length) : 0} chars
- Avg losing proposal length (sample): ${losers.length > 0 ? Math.round(losers.reduce((s, p) => s + (p.proposal_length || 0), 0) / losers.length) : 0} chars
- Total tracked: ${totalTracked}

Return a JSON array of 5-7 learned rules:
[
  {
    "rule": "For [condition], [do this] because [evidence from data]",
    "confidence": 0.0-1.0,
    "category": "opening|length|tone|proof|targeting|timing"
  }
]

Rules must be specific, actionable, and based on actual patterns in this data.`;

  const raw = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 2048 });
  const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
  const rules = JSON.parse(cleaned);

  // Deactivate old insights, insert new ones
  await insightRepo.deactivateAll(userId);

  const inserted = [];
  for (const rule of rules) {
    const insight = await insightRepo.create({
      insight_text: rule.rule,
      confidence: rule.confidence || 0.5,
      category: rule.category || 'general',
      sample_size: proposals.length,
    }, userId);
    inserted.push(insight);
  }

  await cacheDel('analytics:' + userId);

  return { insights: inserted, message: `Generated ${inserted.length} insights from ${proposals.length} proposals.` };
}

/**
 * Get active insights for a user.
 */
export async function getInsights(userId) {
  return insightRepo.findAll(userId);
}

/**
 * Toggle an insight active/inactive.
 */
export async function updateInsight(id, data, userId) {
  return insightRepo.update(id, data, userId);
}
