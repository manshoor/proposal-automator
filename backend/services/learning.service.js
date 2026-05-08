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

    // NOTE: paymentVerified is passed as undefined because it isn't stored on the proposals
    // table — it comes from the original scraped jobData and is not persisted. Historical
    // recompute therefore can't determine it. To fix: add a `payment_verified BOOLEAN` column
    // to the proposals table in a future migration and persist the value during proposal creation.
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
 * Uses a cascading single-dimension lookup:
 *
 *   1. If `persona` is provided and has enough coverage: find the best hook_style
 *      from proposals classified to that persona.
 *   2. Else if `niche` is provided and has enough coverage: same for niche slice.
 *   3. Else fall back to the global hook_style aggregate (original V1 behaviour).
 *   4. If nothing confident found: return null — caller uses defaults.
 *
 * This avoids a true joint (hook_style × persona × niche) which requires ≥100 outcomes
 * per joint bucket to be reliable. Single-dimension cascading is "good enough" until
 * per-user data volume grows large enough to justify a pre-aggregated joint table.
 *
 * @param {string} userId
 * @param {{ persona?: string, niche?: string }} [context]
 * @returns {Promise<{hookStyle, sampleSize, responseRate, confidence, contextDim, contextKey, contextPersona, contextNiche}|null>}
 */
export async function recommendHookStyle(userId, { persona, niche } = {}) {
  // Attempt 1: persona-specific lookup
  if (persona) {
    const result = await findBestHookStyleForContext(userId, 'persona', persona);
    if (result) {
      return {
        hookStyle: result.key,
        sampleSize: result.sample_size,
        responseRate: Number(result.response_rate),
        confidence: 'confident',
        contextDim: 'persona',
        contextKey: persona,
        contextPersona: persona,
        contextNiche: niche || null,
      };
    }
  }

  // Attempt 2: niche-specific lookup
  if (niche) {
    const result = await findBestHookStyleForContext(userId, 'niche', niche);
    if (result) {
      return {
        hookStyle: result.key,
        sampleSize: result.sample_size,
        responseRate: Number(result.response_rate),
        confidence: 'confident',
        contextDim: 'niche',
        contextKey: niche,
        contextPersona: persona || null,
        contextNiche: niche,
      };
    }
  }

  // Attempt 3: global hook_style aggregate (original V1 behaviour)
  const top = await patternsRepo.findTopKey(userId, 'hook_style', MIN_CONFIDENCE_SAMPLE);
  if (!top) return null;
  return {
    hookStyle: top.key,
    sampleSize: top.sample_size,
    responseRate: Number(top.response_rate),
    confidence: top.sample_size >= MIN_CONFIDENCE_SAMPLE ? 'confident' : 'low',
    contextDim: 'global',
    contextKey: null,
    contextPersona: persona || null,
    contextNiche: niche || null,
  };
}

/**
 * Inner helper: compute the best hook_style for proposals that match a given
 * context dimension + key. Walks raw outcome rows and re-classifies each one
 * using the persona/niche classifier so we can filter without a joint table.
 *
 * Returns null if:
 *   - The context key has no coverage in the pre-aggregated patterns (fast exit).
 *   - After filtering to the context slice, fewer than MIN_CONFIDENCE_SAMPLE proposals
 *     remain per hook_style bucket.
 *
 * Scalability note: fetches all raw proposal signal rows for the user (last 90 days)
 * and classifies each in-process. Acceptable up to ~500 proposals per user.
 *
 * @param {string} userId
 * @param {'persona'|'niche'} contextDim
 * @param {string} contextKey
 * @returns {Promise<{key, sample_size, response_rate}|null>}
 */
async function findBestHookStyleForContext(userId, contextDim, contextKey) {
  // Fast-exit: if the user hasn't accumulated enough outcomes for this context key
  // in the pre-aggregated patterns table, skip the expensive raw-row pass.
  const hasCoverage = await patternsRepo.hasContextCoverage(userId, contextDim, contextKey, MIN_CONFIDENCE_SAMPLE);
  if (!hasCoverage) return null;

  // Fetch raw per-proposal rows (hook_style + client signals + outcome flags).
  const rawRows = await patternsRepo.fetchRawProposalSignals(userId, 90);
  if (!rawRows.length) return null;

  // Filter to rows that classify to contextKey, accumulate hook_style win counts.
  const hookBuckets = new Map(); // hook_style → { sampleSize, winCount }

  for (const row of rawRows) {
    let classifiedKey;
    if (contextDim === 'persona') {
      const p = personaService.classify(
        {
          totalSpent: row.client_total_spent,
          hireRate: row.client_hire_rate,
          reviewCount: row.client_review_count,
          location: row.client_location,
          // payment_verified is not persisted on proposals (see recomputePatterns comment)
          paymentVerified: undefined,
        },
        { skills: [] },
      );
      classifiedKey = p.id;
    } else {
      classifiedKey = personaService.classifyNiche({ skills: row.job_skills, title: '' });
    }

    if (classifiedKey !== contextKey) continue;

    const style = row.hook_style;
    const cur = hookBuckets.get(style) || { sampleSize: 0, winCount: 0 };
    cur.sampleSize += 1;
    if (row.has_win) cur.winCount += 1;
    hookBuckets.set(style, cur);
  }

  if (!hookBuckets.size) return null;

  // Find the best hook_style bucket with enough sample size.
  let best = null;
  for (const [style, counts] of hookBuckets) {
    if (counts.sampleSize < MIN_CONFIDENCE_SAMPLE) continue;
    const rate = counts.winCount / counts.sampleSize;
    if (!best || rate > best.response_rate || (rate === best.response_rate && counts.sampleSize > best.sample_size)) {
      best = { key: style, sample_size: counts.sampleSize, response_rate: rate };
    }
  }

  return best;
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
