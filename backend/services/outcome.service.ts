// @ts-nocheck — TODO: tighten types in a follow-up iter
import * as outcomeRepo from '../repositories/outcome.repository.js';
import pool from '../db/pool.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

/**
 * Ingest a batch of outcome events. Each event is matched to a proposal by
 * proposalId / jobUrl / jobTitle. Unmatched events are dropped (logged).
 *
 * @param {Array} events  - Validated outcomeEventSchema array
 * @param {string} userId
 * @param {object|null} logger
 * @returns {Promise<{accepted: number, dropped: number, results: Array}>}
 */
export async function ingestEvents(events, userId, logger = null) {
  let accepted = 0;
  let dropped = 0;
  const results = [];

  for (const e of events) {
    let proposalId = e.proposalId || null;
    if (!proposalId) {
      const match = await outcomeRepo.findProposalByJobIdentity(userId, {
        jobUrl: e.jobUrl,
        jobTitle: e.jobTitle,
      });
      proposalId = match?.id || null;
    }

    if (!proposalId) {
      dropped += 1;
      results.push({ accepted: false, reason: 'no-matching-proposal', event: e });
      logger?.debug?.({ event: e }, 'Dropping outcome event with no matching proposal');
      continue;
    }

    try {
      const row = await outcomeRepo.create({
        proposalId,
        userId,
        eventType: e.eventType,
        source: e.source || 'manual',
        occurredAt: e.occurredAt || new Date().toISOString(),
        metadata: e.metadata || {},
      });
      accepted += 1;
      results.push({ accepted: true, id: row.id, proposalId, eventType: e.eventType });
    } catch (err) {
      dropped += 1;
      results.push({ accepted: false, reason: 'insert-failed', error: err.message, event: e });
      logger?.warn?.({ err: err?.message, event: e }, 'Failed to insert outcome event');
    }
  }

  return { accepted, dropped, results };
}

/**
 * Manually mark a proposal with a status change. Convenience for the dashboard.
 */
export async function manualMark(proposalId, eventType, userId, logger = null) {
  const result = await ingestEvents(
    [{ proposalId, eventType, source: 'manual', occurredAt: new Date().toISOString() }],
    userId,
    logger,
  );
  if (result.accepted === 0) {
    throw new NotFoundError('Proposal');
  }
  return result.results[0];
}

/**
 * Read the user's outcome_tracking_enabled flag.
 */
export async function getTrackingEnabled(userId) {
  const { rows } = await pool.query(
    'SELECT outcome_tracking_enabled FROM users WHERE id = $1',
    [userId]
  );
  return !!(rows[0] && rows[0].outcome_tracking_enabled);
}

/**
 * Update the user's outcome_tracking_enabled flag.
 */
export async function setTrackingEnabled(userId, enabled) {
  if (typeof enabled !== 'boolean') {
    throw new ValidationError('enabled must be a boolean');
  }
  await pool.query(
    'UPDATE users SET outcome_tracking_enabled = $1, updated_at = NOW() WHERE id = $2',
    [enabled, userId]
  );
  return { enabled };
}

export async function listForProposal(proposalId, userId) {
  return outcomeRepo.findByProposal(proposalId, userId);
}