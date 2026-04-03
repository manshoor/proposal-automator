import * as analyticsRepo from '../repositories/analytics.repository.js';
import { cacheGet, cacheSet } from '../lib/redis.js';

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
