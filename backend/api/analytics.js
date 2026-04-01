import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [summaryResult, weeklyResult, topSkillsResult, statusBreakdownResult] =
      await Promise.all([
        // Summary aggregates
        pool.query(`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'sent') AS sent,
            COUNT(*) FILTER (WHERE status = 'hired') AS hired,
            COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'withdrawn') AS withdrawn,
            ROUND(
              CASE
                WHEN COUNT(*) FILTER (WHERE status IN ('hired', 'rejected')) = 0 THEN 0
                ELSE (COUNT(*) FILTER (WHERE status = 'hired') * 100.0)
                     / COUNT(*) FILTER (WHERE status IN ('hired', 'rejected'))
              END,
              2
            ) AS win_rate,
            ROUND(AVG(hourly_rate) FILTER (WHERE hourly_rate IS NOT NULL), 2) AS avg_hourly_rate
          FROM proposals
        `),

        // Weekly proposal counts for the last 12 weeks
        pool.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS week,
            COUNT(*) AS count
          FROM proposals
          WHERE created_at >= NOW() - INTERVAL '12 weeks'
          GROUP BY DATE_TRUNC('week', created_at)
          ORDER BY week ASC
        `),

        // Top 10 skills across all proposals
        pool.query(`
          SELECT skill, COUNT(*) AS count
          FROM proposals, UNNEST(job_skills) AS skill
          GROUP BY skill
          ORDER BY count DESC
          LIMIT 10
        `),

        // Status breakdown
        pool.query(`
          SELECT status, COUNT(*) AS count
          FROM proposals
          GROUP BY status
          ORDER BY count DESC
        `),
      ]);

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

    const weeklyProposals = weeklyResult.rows.map((r) => ({
      week: r.week,
      count: parseInt(r.count, 10),
    }));

    const topSkills = topSkillsResult.rows.map((r) => ({
      skill: r.skill,
      count: parseInt(r.count, 10),
    }));

    const statusBreakdown = statusBreakdownResult.rows.map((r) => ({
      status: r.status,
      count: parseInt(r.count, 10),
    }));

    return res.json({ summary, weeklyProposals, topSkills, statusBreakdown });
  } catch (err) {
    console.error('GET /api/analytics error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
