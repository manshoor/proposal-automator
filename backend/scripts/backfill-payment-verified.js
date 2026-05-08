/**
 * One-shot backfill script: set payment_verified on legacy proposals rows that have NULL.
 *
 * Uses client_total_spent as a proxy heuristic. The column may be stored as a human-
 * readable string such as "$10K+", "$1K+", "$200+". The SQL normalises it via:
 *
 *   REGEXP_REPLACE(value, 'K\+?$', '000', 'g')   -- "$10K+" → "$10000"
 *   REGEXP_REPLACE(result, '[^0-9.]', '', 'g')    -- strip non-numeric → "10000"
 *   CAST(... AS NUMERIC)
 *
 * This handles the vast majority of typical Upwork display values. Edge cases:
 *   - "$M" / "$1M+" style values: the K-substitution doesn't apply, so the remaining
 *     string after stripping non-numerics may be "1" or "0" — these will NOT meet the
 *     $1000 threshold and will remain NULL after this script. They are genuine high-
 *     spenders but cannot be auto-classified without additional parsing logic.
 *   - Empty string / non-numeric strings with no digits: CAST produces 0, treated as
 *     low spend. Combined with zero reviews they will be set to FALSE.
 *   - "$500+" style (between $100–$999): intentionally left NULL by this script — the
 *     middle-ground heuristic is too uncertain to guess.
 *
 * Usage:
 *   docker compose exec backend node scripts/backfill-payment-verified.js
 */

import pool from '../db/pool.js';

async function backfill() {
  console.log('[backfill-payment-verified] Starting...');

  // --- Pass 1: mark TRUE for high-confidence verified clients (spend >= $1000) ---
  const trueResult = await pool.query(`
    UPDATE proposals
    SET payment_verified = TRUE
    WHERE payment_verified IS NULL
      AND client_total_spent IS NOT NULL
      AND CAST(
            REGEXP_REPLACE(
              REGEXP_REPLACE(client_total_spent, 'K\\+?$', '000', 'g'),
              '[^0-9.]', '', 'g'
            ) AS NUMERIC
          ) >= 1000
  `);
  console.log(`[backfill-payment-verified] Set TRUE:  ${trueResult.rowCount} rows`);

  // --- Pass 2: mark FALSE for likely-unverified (low/no spend AND no reviews) ---
  const falseResult = await pool.query(`
    UPDATE proposals
    SET payment_verified = FALSE
    WHERE payment_verified IS NULL
      AND (
        client_total_spent IS NULL
        OR CAST(
             REGEXP_REPLACE(
               REGEXP_REPLACE(client_total_spent, 'K\\+?$', '000', 'g'),
               '[^0-9.]', '', 'g'
             ) AS NUMERIC
           ) < 100
      )
      AND (client_review_count IS NULL OR client_review_count = 0)
  `);
  console.log(`[backfill-payment-verified] Set FALSE: ${falseResult.rowCount} rows`);

  // Rows with spend $100–$999, OR rows with low spend but non-zero reviews, are left NULL.
  // Rows with "$M" / "$1M+" spend are also left NULL (K-normalisation does not handle M suffix).
  console.log('[backfill-payment-verified] Rows with ambiguous spend ($100–$999) or M-suffix values remain NULL — see script header for details.');
  console.log('[backfill-payment-verified] Done.');
}

backfill()
  .catch((err) => {
    console.error('[backfill-payment-verified] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
