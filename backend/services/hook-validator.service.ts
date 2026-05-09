// @ts-nocheck — TODO: tighten types in a follow-up iter
import { findBannedPhrases, hasBlocker } from '../lib/banned-phrases.js';
import * as bannedPhrasesRepo from '../repositories/banned-phrases.repository.js';

const HOOK_LENGTH = 230;

const GENERIC_OPENERS = [
  /^hi[,!\s]+i['']?m\s/i,
  /^hello[,!\s]+i['']?m\s/i,
  /^hi[,!\s]+my\s+name\s+is/i,
  /^hello[,!\s]+my\s+name\s+is/i,
  /^greetings/i,
  /^to\s+whom\s+it\s+may\s+concern/i,
];

const STOPWORDS = new Set([
  'the','a','an','and','or','of','to','for','in','on','at','with','from','by',
  'is','are','was','were','be','been','being','have','has','had','do','does','did',
  'i','you','we','they','it','this','that','these','those','my','your','our','their',
  'will','would','could','should','can','may','might','must','need','want','looking',
  'as','if','but','so','than','then','when','while','where','what','which','who','how',
  'about','into','out','up','down','over','under','more','most','some','any','all','each',
  'project','work','job','help','also','very','just','only','really',
]);

/**
 * Validate the first 230 chars of a generated proposal opening.
 *
 * @param {string} proposalText
 * @param {object|null} jobAnalysis  - { painPoint, criticalRequirements, openingHook }
 * @param {object} jobData           - { title, description, skills }
 * @param {string|null} userId
 * @returns {Promise<{score, hookText, issues, blockers, hasBlocker, failureSummary}>}
 */
export async function validateHook(proposalText, jobAnalysis, jobData, userId) {
  const hook = (proposalText || '').slice(0, HOOK_LENGTH);
  const trimmedHook = hook.trim();
  const lowerHook = trimmedHook.toLowerCase();
  const issues = [];
  const blockers = [];

  // 1. Banned-phrase check
  const phrases = await bannedPhrasesRepo.findActiveForUser(userId).catch(() => []);
  const hits = findBannedPhrases(hook, phrases);
  for (const h of hits) {
    const item = { type: 'banned-phrase', phrase: h.phrase, severity: h.severity, message: `Contains banned phrase: "${h.phrase}"` };
    if (h.severity === 'block') blockers.push(item);
    else issues.push(item);
  }

  // 2. Generic opener check
  if (GENERIC_OPENERS.some((re) => re.test(trimmedHook))) {
    blockers.push({
      type: 'generic-opener',
      severity: 'block',
      message: "Opens with a generic self-introduction. Lead with the client's problem or your concrete proof instead.",
    });
  }

  // 3. Job-specifics check (pain point, critical requirements, skills)
  const specifics = collectJobSpecifics(jobAnalysis, jobData);
  const referencedSpecific = specifics.some((s) => lowerHook.includes(s.toLowerCase()));
  if (specifics.length > 0 && !referencedSpecific) {
    issues.push({
      type: 'no-job-specifics',
      severity: 'warn',
      message: "First 230 chars don't reference any specific job term (technology, deliverable, or the client's problem).",
    });
  }

  // 4. Keyword-mirror check
  const topKeywords = topKeywordsFrom(jobData);
  const mirroredCount = topKeywords.filter((k) => lowerHook.includes(k.toLowerCase())).length;
  if (topKeywords.length >= 3 && mirroredCount === 0) {
    issues.push({
      type: 'no-keyword-mirror',
      severity: 'warn',
      message: "Hook doesn't mirror any of the client's top keywords. Mirroring their language signals understanding.",
    });
  }

  // 5. Generic close in the hook
  if (/(looking forward|hope to hear|thank you|kind regards|best regards)/i.test(trimmedHook.slice(-80))) {
    issues.push({
      type: 'generic-close',
      severity: 'warn',
      message: 'Hook closes with a generic line. Stronger hooks tease a question or concrete result.',
    });
  }

  // 6. Length signal — too short means the opening lacks substance
  if (trimmedHook.length < 80) {
    issues.push({
      type: 'hook-too-short',
      severity: 'warn',
      message: 'Hook is unusually short. Aim for ~150–230 chars to use the full preview window.',
    });
  }

  // Score: 100 base, -25 per blocker, -10 per issue, floor 0
  let score = 100;
  score -= blockers.length * 25;
  score -= issues.length * 10;
  if (score < 0) score = 0;

  return {
    score,
    hookText: hook,
    issues,
    blockers,
    hasBlocker: blockers.length > 0 || hasBlocker(hits),
    failureSummary: buildFailureSummary(blockers, issues),
  };
}

function collectJobSpecifics(jobAnalysis, jobData) {
  const out = [];
  if (jobAnalysis?.painPoint) out.push(jobAnalysis.painPoint);
  if (Array.isArray(jobAnalysis?.criticalRequirements)) {
    jobAnalysis.criticalRequirements.forEach((r) => out.push(r));
  }
  if (Array.isArray(jobData?.skills)) {
    jobData.skills.slice(0, 5).forEach((s) => out.push(s));
  }
  return out.filter((s) => typeof s === 'string' && s.length >= 3);
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

function buildFailureSummary(blockers, issues) {
  if (blockers.length === 0 && issues.length === 0) return null;
  const lines = [];
  if (blockers.length > 0) {
    lines.push('Blockers (must fix):');
    blockers.forEach((b) => lines.push(`- ${b.message || b.phrase || b.type}`));
  }
  if (issues.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Issues to improve:');
    issues.forEach((i) => lines.push(`- ${i.message || i.phrase || i.type}`));
  }
  return lines.join('\n');
}