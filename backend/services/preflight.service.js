/**
 * Pre-flight checklist — 8 deterministic gates the proposal must pass before submission.
 * Run after generation; results inform the popup blocker UI.
 *
 * Output: { gates: Array<{id, name, passed, message, severity}>, allPassed, blockerCount, blockedSubmit }
 */

const MAX_WORDS = 180;
const MIN_ALIGNMENT = 7;
const MIN_HOOK_SCORE = 70;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'with', 'from', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'i', 'you', 'we', 'they', 'it', 'this', 'that', 'these', 'those', 'my', 'your', 'our', 'their',
  'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'need', 'want', 'looking',
  'as', 'if', 'but', 'so', 'than', 'then', 'when', 'while', 'where', 'what', 'which', 'who', 'how',
  'about', 'into', 'out', 'up', 'down', 'over', 'under', 'more', 'most', 'some', 'any', 'all', 'each',
  'project', 'work', 'job', 'help', 'also', 'very', 'just', 'only', 'really',
]);

/**
 * @param {object} args
 * @param {string} args.proposalText
 * @param {object} args.jobData
 * @param {object} args.hookValidation       - From hook-validator.service.js
 * @param {object} args.alignment            - From alignment.service.js
 * @param {object} args.boostDecision        - From boost-roi.service.js
 * @param {Array}  [args.projectsIncluded]   - Portfolio projects injected into the prompt
 * @returns {{ gates, allPassed, blockerCount, blockedSubmit }}
 */
export function runPreflight({
  proposalText,
  jobData,
  hookValidation,
  alignment,
  boostDecision,
  projectsIncluded,
}) {
  const text = proposalText || '';
  const lower = text.toLowerCase();
  const gates = [];

  // Gate 1 — hook score
  // severity='block' only when hookValidation is present but score is genuinely low.
  // severity='warn' when hookValidation is absent (data missing — don't hard-block on absence).
  const hookPassed = hookValidation != null && hookValidation.score >= MIN_HOOK_SCORE;
  const hookSeverity = hookValidation == null ? 'warn' : 'block';
  gates.push(gate(
    'hook-ok',
    'Hook score',
    hookPassed,
    hookValidation != null
      ? `Score ${hookValidation.score}/100 (need ≥${MIN_HOOK_SCORE})`
      : 'Hook validation missing',
    hookSeverity,
  ));

  // Gate 2 — banned-free (block-severity)
  const hasBannedBlock = !!(hookValidation?.blockers?.some?.(b =>
    (b.type === 'banned-phrase' && b.severity === 'block')
    || b.type === 'generic-opener'
  ));
  gates.push(gate(
    'banned-free',
    'No banned phrases or generic openers',
    !hasBannedBlock,
    hasBannedBlock ? 'Banned phrase or generic opener detected in opening' : 'Clean',
    'block',
  ));

  // Gate 3 — has CTA question
  const hasQuestion = text.includes('?');
  gates.push(gate(
    'cta-question',
    'Ends with a question',
    hasQuestion,
    hasQuestion ? 'Question detected' : 'No question mark — winners end with a pointed Q',
    'warn',
  ));

  // Gate 4 — mentions portfolio (only if any was supplied)
  const portfolioOptional = !Array.isArray(projectsIncluded) || projectsIncluded.length === 0;
  let portfolioPassed = portfolioOptional;
  let portfolioMsg = portfolioOptional ? 'No portfolio supplied (skipped)' : 'No portfolio referenced in proposal';
  if (!portfolioOptional) {
    const referenced = projectsIncluded.some(p => p?.name && lower.includes(String(p.name).toLowerCase()));
    if (referenced) {
      portfolioPassed = true;
      portfolioMsg = 'Portfolio referenced';
    }
  }
  gates.push(gate('portfolio-mention', 'Mentions portfolio', portfolioPassed, portfolioMsg, 'warn'));

  // Gate 5 — length
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  gates.push(gate(
    'length',
    `Length ≤${MAX_WORDS} words`,
    wordCount <= MAX_WORDS,
    `${wordCount} words${wordCount > MAX_WORDS ? ` (over ${MAX_WORDS})` : ''}`,
    'warn',
  ));

  // Gate 6 — keyword mirror
  const topKeywords = topKeywordsFrom(jobData);
  const top3 = topKeywords.slice(0, 3);
  const mirroredCount = top3.filter(k => lower.includes(k.toLowerCase())).length;
  gates.push(gate(
    'keyword-mirror',
    'Mirrors client keywords',
    mirroredCount >= 1 || top3.length === 0,
    top3.length === 0
      ? 'No keywords extracted'
      : `${mirroredCount} of top 3 mirrored (${top3.join(', ')})`,
    'warn',
  ));

  // Gate 7 — alignment
  const align = Number(alignment?.overall || 0);
  gates.push(gate(
    'alignment',
    `Alignment ≥${MIN_ALIGNMENT}/10`,
    align >= MIN_ALIGNMENT,
    `${align.toFixed(1)}/10${align < MIN_ALIGNMENT ? ' — profile may not match this job' : ''}`,
    'warn',
  ));

  // Gate 8 — boost decision made
  const boostMade = !!(boostDecision && boostDecision.recommendation);
  gates.push(gate(
    'boost-decision',
    'Boost decision made',
    boostMade,
    boostMade
      ? `Recommendation: ${boostDecision.recommendation}`
      : 'No boost recommendation generated',
    'warn',
  ));

  const blockers = gates.filter(g => !g.passed && g.severity === 'block');
  const allPassed = gates.every(g => g.passed);

  return {
    gates,
    allPassed,
    blockerCount: blockers.length,
    blockedSubmit: blockers.length > 0,
  };
}

function gate(id, name, passed, message, severity) {
  return { id, name, passed, message, severity };
}

function topKeywordsFrom(jobData) {
  const desc = `${jobData?.description || ''} ${jobData?.title || ''}`.toLowerCase();
  const words = desc.match(/\b[a-z][a-z0-9-]{3,}\b/g) || [];
  const counts = new Map();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
}
