/**
 * One-shot backfill: populate proposals.client_identity_hash for legacy rows
 * (rows created before migration 019). The hash inputs are
 *   location + total-spent bucket + payment-verified flag
 * matching computeClientIdentityHash() in client-history.service.js.
 *
 * client_total_spent is stored as a human-readable string like "$10K+", "$1M+",
 * "$200+". This script normalises it the same way backfill-payment-verified.js
 * does, then derives a numeric value to feed into the hash function.
 *
 * Rows where the hash cannot be computed (NULL/empty inputs) are left NULL —
 * they will never match anything anyway, so leaving them out is correct.
 *
 * Usage:
 *   docker compose exec backend node scripts/backfill-client-identity.js
 */

import pool from '../db/pool.js';
import { computeClientIdentityHash } from '../services/client-history.service.js';

function parseTotalSpent(raw) {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  // "$1M+" → "1000000", "$10K+" → "10000", strip non-numeric
  let normalised = s.replace(/[Mm]\+?$/, '000000');
  normalised = normalised.replace(/[Kk]\+?$/, '000');
  normalised = normalised.replace(/[^0-9.]/g, '');
  const n = parseFloat(normalised);
  return Number.isFinite(n) ? n : 0;
}

async function backfill() {
  console.log('[backfill-client-identity] Starting...');

  const { rows } = await pool.query(
    `SELECT id, client_location, client_total_spent, payment_verified
     FROM proposals
     WHERE client_identity_hash IS NULL`
  );

  console.log(`[backfill-client-identity] Found ${rows.length} rows to backfill`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const location = (row.client_location || '').trim();
    if (!location) {
      skipped++;
      continue;
    }

    const totalSpent = parseTotalSpent(row.client_total_spent);
    const hash = computeClientIdentityHash({
      client: {
        location,
        totalSpent,
        paymentVerified: !!row.payment_verified,
      },
    });

    await pool.query(
      `UPDATE proposals SET client_identity_hash = $1 WHERE id = $2`,
      [hash, row.id]
    );
    updated++;
  }

  console.log(`[backfill-client-identity] Updated: ${updated} rows`);
  console.log(`[backfill-client-identity] Skipped (no location): ${skipped} rows`);
  console.log('[backfill-client-identity] Done.');
}

backfill()
  .catch((err) => {
    console.error('[backfill-client-identity] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
