import * as repo from '../repositories/followup.repository.js';
import { resolveLLMConfig, callLLM } from './llm.service.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

// Five-minute grace window — proposals sent just now should not be rejected
// if the computed scheduledAt ends up a few seconds in the past due to clock drift.
const PAST_GRACE_MS = 5 * 60 * 1000;

/**
 * Convert a snake_case DB row to a camelCase object for API consumers.
 *
 * @param {object} row
 * @returns {object}
 */
function toApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    proposalId: row.proposal_id,
    userId: row.user_id,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    messageText: row.message_text,
    status: row.status,
    sequenceIndex: row.sequence_index,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Generate a follow-up message via the user's configured LLM.
 *
 * @param {object} params
 * @param {object} params.proposal   - DB proposal row (job_title, proposal_text)
 * @param {number} params.daysSince  - Days since proposal was sent
 * @param {string} params.userId
 * @param {object} [params.logger]
 * @returns {Promise<string>}
 */
export async function generateMessage({ proposal, daysSince, userId, logger }) {
  const { provider, apiKey } = await resolveLLMConfig({}, userId);

  const systemPrompt =
    'You write brief follow-up messages for Upwork freelancers checking in on submitted proposals. ' +
    'Tone: friendly, confident, NOT pushy or apologetic. No emoji. Max 80 words.';

  const opening = (proposal.proposal_text || '').slice(0, 230);
  const userPrompt =
    `Job title: ${proposal.job_title}\n` +
    `Original proposal opening: ${opening}\n` +
    `Days since proposal sent: ${daysSince}\n\n` +
    `Write a follow-up message that re-engages without sounding desperate. ` +
    `Reference the job specifically. End with a single soft question. ` +
    `Output ONLY the message text — no subject line, no signature.`;

  logger?.debug?.({ provider, proposalId: proposal.id }, 'Generating follow-up message via LLM');

  const text = await callLLM({ provider, apiKey, systemPrompt, userPrompt, maxTokens: 512 });
  return text.trim();
}

/**
 * Resolve the ISO scheduledAt timestamp from the validated input.
 *
 * @param {object} input   - Validated body (scheduledAt, intervalDays)
 * @param {object} proposal - DB proposal row (created_at)
 * @returns {string}        ISO timestamp string
 */
function resolveScheduledAt(input, proposal) {
  if (input.scheduledAt) {
    return input.scheduledAt;
  }

  const base = new Date(proposal.created_at);
  base.setDate(base.getDate() + input.intervalDays);
  return base.toISOString();
}

/**
 * Compute the number of days between the proposal creation date and now.
 * Used as the "days since sent" figure when generating a message.
 *
 * @param {Date|string} proposalCreatedAt
 * @param {number} [intervalDays] - When no scheduledAt is known, fall back to the requested interval.
 * @returns {number}
 */
function computeDaysSince(proposalCreatedAt, intervalDays) {
  if (intervalDays) return intervalDays;
  const ms = Date.now() - new Date(proposalCreatedAt).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Create a new follow-up for the given user.
 *
 * @param {object} input   - Validated createFollowUpSchema body
 * @param {string} userId
 * @param {object} [logger]
 * @returns {Promise<object>}
 */
export async function createFollowUp(input, userId, logger) {
  // 1. Ownership check + load proposal data
  const proposal = await repo.findProposalForUser(input.proposalId, userId);
  if (!proposal) {
    throw new NotFoundError('Proposal');
  }

  // 2. Resolve scheduled timestamp
  const scheduledAt = resolveScheduledAt(input, proposal);

  // Reject if scheduledAt is more than 5 minutes in the past
  const scheduledMs = new Date(scheduledAt).getTime();
  if (scheduledMs < Date.now() - PAST_GRACE_MS) {
    throw new ValidationError('scheduledAt must not be in the past');
  }

  // 3. Resolve message text
  let messageText;
  if (input.messageText) {
    messageText = input.messageText;
  } else if (input.autoGenerate) {
    const daysSince = computeDaysSince(proposal.created_at, input.intervalDays);
    messageText = await generateMessage({ proposal, daysSince, userId, logger });
  } else {
    // Schema refine already catches this, but guard defensively
    throw new ValidationError('Provide messageText or set autoGenerate=true');
  }

  // 4. Persist
  const row = await repo.create({
    proposal_id: input.proposalId,
    user_id: userId,
    scheduled_at: scheduledAt,
    message_text: messageText,
  });

  return toApi(row);
}

/**
 * List follow-ups for the authenticated user.
 *
 * @param {string} userId
 * @param {object} query   - Validated listQuerySchema query params
 * @returns {Promise<object[]>}
 */
export async function listForUser(userId, query) {
  const rows = await repo.findByUser(userId, {
    status: query.status,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    offset: query.offset ? parseInt(query.offset, 10) : undefined,
  });
  return rows.map(toApi);
}

/**
 * Retrieve a single follow-up by id, scoped to the user.
 *
 * @param {number|string} id
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getById(id, userId) {
  const row = await repo.findById(parseInt(id, 10), userId);
  if (!row) throw new NotFoundError('Follow-up');
  return toApi(row);
}

/**
 * Update mutable fields on a follow-up.
 * When setting status='sent' without an explicit sent_at, records NOW().
 *
 * @param {number|string} id
 * @param {object} input   - Validated updateFollowUpSchema body
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function updateFollowUp(id, input, userId) {
  const updateData = { ...input };

  // Normalise casing: schema gives camelCase, repo expects snake_case
  if (updateData.scheduledAt !== undefined) {
    updateData.scheduled_at = updateData.scheduledAt;
    delete updateData.scheduledAt;
  }
  if (updateData.messageText !== undefined) {
    updateData.message_text = updateData.messageText;
    delete updateData.messageText;
  }

  // Auto-populate sent_at when transitioning to 'sent'
  if (updateData.status === 'sent' && updateData.sent_at === undefined) {
    updateData.sent_at = new Date().toISOString();
  }

  const row = await repo.update(parseInt(id, 10), userId, updateData);
  if (!row) throw new NotFoundError('Follow-up');
  return toApi(row);
}

/**
 * Cancel a follow-up (status → 'cancelled').
 * The row remains readable; only 'scheduled' follow-ups can be cancelled.
 *
 * @param {number|string} id
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function cancelFollowUp(id, userId) {
  const row = await repo.cancel(parseInt(id, 10), userId);
  if (!row) {
    // Could be not found OR already not in 'scheduled' state.
    // Verify existence to give a precise error.
    const existing = await repo.findById(parseInt(id, 10), userId);
    if (!existing) throw new NotFoundError('Follow-up');
    throw new ValidationError(`Cannot cancel a follow-up with status '${existing.status}'`);
  }
}

/**
 * Schedule a sequence of follow-ups at increasing intervals for a single proposal.
 * Intervals are sorted ascending; each row is assigned a sequence_index matching
 * its position in that sorted order (0 = earliest).
 *
 * Errors on individual row creation are logged and skipped — the successfully
 * created rows are always returned. The only hard failure is a missing proposal.
 *
 * @param {object} input
 * @param {number}   input.proposalId
 * @param {number[]} input.intervals    - Days from proposal.created_at for each follow-up
 * @param {boolean}  input.autoGenerate - Always true for sequences; manual text not supported
 * @param {string} userId
 * @param {object} [logger]
 * @returns {Promise<object[]>}  Rows in interval order (sequence_index 0 first)
 */
export async function scheduleSequence({ proposalId, intervals, autoGenerate }, userId, logger) {
  // Ownership check — load proposal once to avoid N+1 inside each createFollowUp
  const proposal = await repo.findProposalForUser(proposalId, userId);
  if (!proposal) throw new NotFoundError('Proposal');

  // Sort ascending so sequence_index 0 is the earliest follow-up
  const sortedIntervals = [...intervals].sort((a, b) => a - b);

  // When autoGenerate=true, generate all messages in parallel (O(1) round-trips)
  let messages;
  if (autoGenerate) {
    messages = await Promise.all(
      sortedIntervals.map((intervalDays) =>
        generateMessage({
          proposal,
          daysSince: intervalDays,
          userId,
          logger,
        }).catch((err) => {
          logger?.error?.({ err, proposalId, intervalDays }, 'LLM generation failed for sequence step');
          return null; // placeholder; row creation will be skipped
        })
      )
    );
  } else {
    // autoGenerate=false is not supported for sequences per spec, but handle it
    // gracefully: each message is left empty (null) and rows will be skipped.
    messages = sortedIntervals.map(() => null);
  }

  // Insert each row; persist sequence_index; collect successes
  const created = [];
  for (let i = 0; i < sortedIntervals.length; i++) {
    const messageText = messages[i];
    if (!messageText) {
      logger?.warn?.({ proposalId, sequenceIndex: i }, 'Skipping sequence step — no message text');
      continue;
    }

    const intervalDays = sortedIntervals[i];
    const base = new Date(proposal.created_at);
    base.setDate(base.getDate() + intervalDays);
    const scheduledAt = base.toISOString();

    try {
      const row = await repo.create({
        proposal_id: proposalId,
        user_id: userId,
        scheduled_at: scheduledAt,
        message_text: messageText,
        sequence_index: i,
      });
      created.push(toApi(row));
    } catch (err) {
      logger?.error?.({ err, proposalId, sequenceIndex: i }, 'Failed to insert sequence row');
    }
  }

  return created;
}

/**
 * Re-generate the message text for an existing follow-up and persist it.
 *
 * @param {number|string} id
 * @param {string} userId
 * @param {object} [logger]
 * @returns {Promise<object>}
 */
export async function regenerateMessage(id, userId, logger) {
  const followup = await repo.findById(parseInt(id, 10), userId);
  if (!followup) throw new NotFoundError('Follow-up');

  const proposal = await repo.findProposalForUser(followup.proposal_id, userId);
  if (!proposal) throw new NotFoundError('Proposal');

  const daysSince = computeDaysSince(proposal.created_at, null);
  const messageText = await generateMessage({ proposal, daysSince, userId, logger });

  const updated = await repo.update(parseInt(id, 10), userId, { message_text: messageText });
  if (!updated) throw new NotFoundError('Follow-up');
  return toApi(updated);
}
