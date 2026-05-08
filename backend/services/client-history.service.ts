import crypto from 'crypto';
import pool from '../db/pool.js';

// ---- Public types ----

export interface ClientFields {
  location?: string;
  totalSpent?: number | string;
  paymentVerified?: boolean;
}

export interface JobDataForHash {
  client?: ClientFields;
}

export interface PastProposal {
  id: number;
  jobTitle: string;
  status: string;
  sentAt: Date | string;
  daysSince: number;
  outcomes: string[];
}

export interface ClientHistory {
  hash: string | null;
  pastProposals: PastProposal[];
}

interface ProposalHistoryRow {
  id: number;
  job_title: string;
  status: string;
  created_at: Date | string;
  outcome_events: string[] | null;
}

/**
 * Deterministic client identity hash.
 * Inputs: location + total-spent bucket + payment-verified flag.
 * Coarse on purpose — false positives only surface OTHER proposals from the
 * same user, no privacy concern.
 */
export function computeClientIdentityHash(jobData: JobDataForHash | null | undefined): string {
  const client = jobData?.client || {};
  const location = String(client.location || '').trim().toLowerCase();
  const totalSpent = Number(client.totalSpent) || 0;
  // Bucket spend into ranges so $5000 and $5500 hash to the same bucket
  const spendBucket =
    totalSpent < 100 ? '<100' :
    totalSpent < 1000 ? '<1k' :
    totalSpent < 5000 ? '<5k' :
    totalSpent < 20000 ? '<20k' :
    totalSpent < 100000 ? '<100k' : '>=100k';
  const paymentVerified = client.paymentVerified ? 'pv' : 'pu';
  const composite = `${location}|${spendBucket}|${paymentVerified}`;
  return crypto.createHash('sha256').update(composite).digest('hex').slice(0, 32);
}

export async function lookupHistory(
  jobData: JobDataForHash | null | undefined,
  userId: string,
): Promise<ClientHistory> {
  const hash = computeClientIdentityHash(jobData);
  if (!hash) return { hash: null, pastProposals: [] };

  // Fetch past proposals from same user with same hash, plus any outcomes.
  // pool.query is wrapped in db/pool.js so its return type is widened to any —
  // cast the rows back to the expected shape here.
  const result = await pool.query(
    `SELECT p.id, p.job_title, p.status, p.created_at,
            COALESCE(json_agg(DISTINCT po.event_type) FILTER (WHERE po.event_type IS NOT NULL), '[]'::json) AS outcome_events
     FROM proposals p
     LEFT JOIN proposal_outcomes po ON po.proposal_id = p.id
     WHERE p.user_id = $1 AND p.client_identity_hash = $2
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT 10`,
    [userId, hash]
  );
  const rows = result.rows as ProposalHistoryRow[];

  const now = Date.now();
  return {
    hash,
    pastProposals: rows.map((r: ProposalHistoryRow) => ({
      id: r.id,
      jobTitle: r.job_title,
      status: r.status,
      sentAt: r.created_at,
      daysSince: Math.floor((now - new Date(r.created_at).getTime()) / (24 * 60 * 60 * 1000)),
      outcomes: Array.isArray(r.outcome_events) ? r.outcome_events : [],
    })),
  };
}
