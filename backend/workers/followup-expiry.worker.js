import pool from '../db/pool.js';
import { logger } from '../lib/logger.js';

const INTERVAL_MS = 30 * 60 * 1000;  // 30 minutes
const STALE_THRESHOLD_DAYS = 7;

async function expireStaleFollowUps() {
  try {
    const { rowCount } = await pool.query(
      `UPDATE proposal_followups
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'scheduled'
         AND scheduled_at < NOW() - INTERVAL '${STALE_THRESHOLD_DAYS} days'`
    );
    if (rowCount > 0) {
      logger.info({ rowCount, thresholdDays: STALE_THRESHOLD_DAYS },
        '[followup-expiry] marked stale follow-ups expired');
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[followup-expiry] sweep failed (non-fatal)');
  }
}

let _intervalId = null;

export function startFollowUpExpiryWorker() {
  if (_intervalId) return;
  // Run once at startup so a newly-restarted server immediately catches up
  expireStaleFollowUps();
  _intervalId = setInterval(expireStaleFollowUps, INTERVAL_MS);
  logger.info({ intervalMinutes: INTERVAL_MS / 60000 },
    '[followup-expiry] worker started');
}

export function stopFollowUpExpiryWorker() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}
