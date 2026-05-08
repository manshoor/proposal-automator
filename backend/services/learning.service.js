import * as outcomeRepo from '../repositories/outcome.repository.js';
import * as patternsRepo from '../repositories/user-patterns.repository.js';
import * as personaService from './persona.service.js';

const WIN_EVENTS = new Set(['replied', 'interview', 'hired']);
const VIEW_EVENTS = new Set(['viewed', 'message_thread_opened']);
const MIN_CONFIDENCE_SAMPLE = 5;

/**
 * Recompute pattern aggregates for one user across all 3 dimensions.
 * Bucket every proposal in the last `daysBack` days by (hook_style, persona, niche),
 * count outcomes per bucket, persist to user_patterns.
 *
 * @param {string} userId
 * @param {object} [options] - { daysBack?: number, logger? }
 * @returns {Promise<{ byHookStyle, byPersona, byNiche, totals }>}
 */
export async function recomputePatterns(userId, { daysBack = 90, logger = null } = {}) {
  const rows = await outcomeRepo.listOutcomeRowsForUser(userId, daysBack);

  const buckets = {
    hook_style: new Map(),
    persona: new Map(),
    niche: new Map(),
  };
  let totals = { sampleSize: rows.length, winCount: 0, viewCount: 0 };

  for (const row of rows) {
    const eventTypes = Array.isArray(row.event_types) ? row.event_types : [];
    const hasWin = eventTypes.some((t) => WIN_EVENTS.has(t));
    const hasView = eventTypes.some((t) => VIEW_EVENTS.has(t)) || hasWin;
    if (hasWin) totals.winCount += 1;
    if (hasView) totals.viewCount += 1;

    addToBucket(buckets.hook_style, row.hook_style || 'unspecified', hasWin, hasView);

    const persona = personaService.classify(
      {
        totalSpent: row.client_total_spent,
        hireRate: row.client_hire_rate,
        reviewCount: row.client_review_count,
        location: row.client_location,
        paymentVerified: undefined,
      },
      { skills: [] },
    );
    addToBucket(buckets.persona, persona.id, hasWin, hasView);

    const niche = personaService.classifyNiche({ skills: row.job_skills, title: '' });
    addToBucket(buckets.niche, niche, hasWin, hasView);
  }

  // Persist
  await Promise.all([
    patternsRepo.replaceForDimension(userId, 'hook_style', toBucketArray(buckets.hook_style)),
    patternsRepo.replaceForDimension(userId, 'persona',    toBucketArray(buckets.persona)),
    patternsRepo.replaceForDimension(userId, 'niche',      toBucketArray(buckets.niche)),
  ]);

  logger?.info?.({
    userId,
    sampleSize: totals.sampleSize,
    winCount: totals.winCount,
    viewCount: totals.viewCount,
  }, 'Patterns recomputed');

  return {
    byHookStyle: toBucketArray(buckets.hook_style).sort(byResponseRate),
    byPersona:   toBucketArray(buckets.persona).sort(byResponseRate),
    byNiche:     toBucketArray(buckets.niche).sort(byResponseRate),
    totals,
    minConfidenceSample: MIN_CONFIDENCE_SAMPLE,
  };
}

/**
 * Read aggregates from the persisted user_patterns table without recomputing.
 * Used for fast reads (dashboard, generation calibration).
 */
export async function readPatterns(userId) {
  const all = await patternsRepo.findForUser(userId);
  const by = { hook_style: [], persona: [], niche: [] };
  for (const row of all) {
    by[row.dimension]?.push({
      key: row.key,
      sampleSize: row.sample_size,
      winCount: row.win_count,
      viewCount: row.view_count,
      responseRate: Number(row.response_rate),
      viewRate: Number(row.view_rate),
      confident: row.sample_size >= MIN_CONFIDENCE_SAMPLE,
    });
  }
  return {
    byHookStyle: by.hook_style.sort(byResponseRate),
    byPersona: by.persona.sort(byResponseRate),
    byNiche: by.niche.sort(byResponseRate),
    minConfidenceSample: MIN_CONFIDENCE_SAMPLE,
  };
}

/**
 * Pick the recommended hook_style for the user given a current persona+niche context.
 * Falls back to null when there's no confident bucket — caller should use defaults.
 */
export async function recommendHookStyle(userId, { persona, niche } = {}) {
  // Strategy: check niche-specific top, then persona-specific top, then global hook_style top.
  // (V1 implementation — single-dimension lookup. Multi-dimensional joint recommendation is a future enhancement.)
  const candidates = await Promise.all([
    patternsRepo.findTopKey(userId, 'hook_style', MIN_CONFIDENCE_SAMPLE),
  ]);
  const top = candidates.find(Boolean);
  if (!top) return null;
  return {
    hookStyle: top.key,
    sampleSize: top.sample_size,
    responseRate: Number(top.response_rate),
    confidence: top.sample_size >= MIN_CONFIDENCE_SAMPLE ? 'confident' : 'low',
    contextPersona: persona || null,
    contextNiche: niche || null,
  };
}

// ---- helpers ----

function addToBucket(map, key, hasWin, hasView) {
  if (!key) return;
  const cur = map.get(key) || { sampleSize: 0, winCount: 0, viewCount: 0 };
  cur.sampleSize += 1;
  if (hasWin) cur.winCount += 1;
  if (hasView) cur.viewCount += 1;
  map.set(key, cur);
}

function toBucketArray(map) {
  return [...map.entries()].map(([key, v]) => ({ key, ...v }));
}

function byResponseRate(a, b) {
  const diff = (b.responseRate ?? (b.winCount / Math.max(1, b.sampleSize)))
             - (a.responseRate ?? (a.winCount / Math.max(1, a.sampleSize)));
  if (diff !== 0) return diff;
  return (b.sampleSize || 0) - (a.sampleSize || 0);
}
