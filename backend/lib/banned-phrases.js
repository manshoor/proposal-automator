/**
 * Banned-phrase matcher utilities.
 * Pure functions; phrases are loaded by the caller (typically the service layer) and passed in.
 *
 * Matching is case-insensitive and uses word boundaries when the phrase starts/ends
 * with a word character — this prevents false positives like matching "passion for"
 * inside "compassion for".
 */

/**
 * Build a case-insensitive regex for one banned phrase, with word boundaries
 * applied only at edges that are word characters. Phrases that start or end with
 * punctuation (e.g., "I'd…", "…me!") rely on the punctuation itself for separation.
 */
function buildPhraseRegex(phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const startBound = /^\w/.test(phrase) ? '\\b' : '';
  const endBound = /\w$/.test(phrase) ? '\\b' : '';
  return new RegExp(startBound + escaped + endBound, 'i');
}

/**
 * Find banned-phrase hits in a text. Word-boundary aware, case-insensitive.
 *
 * @param {string} text
 * @param {Array<{phrase: string, severity: 'block'|'warn'}>} phrases
 * @returns {Array<{phrase: string, severity: 'block'|'warn', index: number}>}
 */
export function findBannedPhrases(text, phrases) {
  if (!text || typeof text !== 'string') return [];
  if (!Array.isArray(phrases) || phrases.length === 0) return [];
  const hits = [];
  for (const p of phrases) {
    const needle = (p.phrase || '').trim();
    if (!needle) continue;
    try {
      const re = buildPhraseRegex(needle);
      const match = text.match(re);
      if (match) {
        hits.push({ phrase: p.phrase, severity: p.severity || 'warn', index: match.index });
      }
    } catch {
      // Malformed regex — skip this phrase rather than throwing
    }
  }
  return hits;
}

/**
 * @param {Array<{severity: string}>} hits
 * @returns {boolean} true if any hit has severity 'block'
 */
export function hasBlocker(hits) {
  return Array.isArray(hits) && hits.some(h => h.severity === 'block');
}
