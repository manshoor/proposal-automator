import pool from '../db/pool.js';

export async function getSummary(userId = null) {
  const userFilter = userId ? 'WHERE user_id = $1' : '';
  const andUserFilter = userId ? 'AND user_id = $1' : '';
  const userParams = userId ? [userId] : [];

  const [summaryResult, weeklyResult, topSkillsResult, statusBreakdownResult, connectsResult, connectWeeklyResult] =
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
        ${userFilter}
      `, userParams),

      // Weekly proposal counts for the last 12 weeks
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS week,
          COUNT(*) AS count
        FROM proposals
        WHERE created_at >= NOW() - INTERVAL '12 weeks'
        ${andUserFilter}
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week ASC
      `, userParams),

      // Top 10 skills across all proposals
      pool.query(`
        SELECT skill, COUNT(*) AS count
        FROM proposals, UNNEST(job_skills) AS skill
        ${userFilter}
        GROUP BY skill
        ORDER BY count DESC
        LIMIT 10
      `, userParams),

      // Status breakdown
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM proposals
        ${userFilter}
        GROUP BY status
        ORDER BY count DESC
      `, userParams),

      // Connect tracking
      pool.query(`
        SELECT
          COALESCE(SUM(connect_cost), 0) AS total_connects,
          COALESCE(SUM(connect_cost) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0) AS weekly_connects,
          COALESCE(SUM(connect_cost) FILTER (WHERE status = 'hired'), 0) AS connects_for_hires,
          COUNT(*) FILTER (WHERE status = 'hired') AS total_hired_count,
          COALESCE(SUM(earnings), 0) AS total_earnings,
          ROUND(COALESCE(SUM(connect_cost), 0) * 0.30, 2) AS total_connect_cost_usd,
          CASE WHEN SUM(connect_cost) FILTER (WHERE status = 'hired' AND earnings IS NOT NULL) > 0
            THEN ROUND(SUM(earnings) FILTER (WHERE status = 'hired') / (SUM(connect_cost) FILTER (WHERE status = 'hired') * 0.30), 1)
            ELSE 0 END AS roi_multiplier
        FROM proposals
        ${userFilter}
      `, userParams),

      // Weekly connect spending
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS week,
          COALESCE(SUM(connect_cost), 0) AS connects
        FROM proposals
        WHERE created_at >= NOW() - INTERVAL '12 weeks'
        ${andUserFilter}
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week ASC
      `, userParams),
    ]);

  return { summaryResult, weeklyResult, topSkillsResult, statusBreakdownResult, connectsResult, connectWeeklyResult };
}
