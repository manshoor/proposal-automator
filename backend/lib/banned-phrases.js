/**
 * Banned-phrase matcher utilities.
 * Pure functions; phrases are loaded by the caller (typically the service layer) and passed in.
 */

/**
 * Find banned-phrase hits in a text. Case-insensitive substring match.
 *
 * @param {string} text
 * @param {Array<{phrase: string, severity: 'block'|'warn'}>} phrases
 * @returns {Array<{phrase: string, severity: 'block'|'warn', index: number}>}
 */
export function findBannedPhrases(text, phrases) {
  if (!text || typeof text !== 'string') return [];
  if (!Array.isArray(phrases) || phrases.length === 0) return [];
  const haystack = text.toLowerCase();
  const hits = [];
  for (const p of phrases) {
    const needle = (p.phrase || '').toLowerCase().trim();
    if (!needle) continue;
    const idx = haystack.indexOf(needle);
    if (idx >= 0) {
      hits.push({ phrase: p.phrase, severity: p.severity || 'warn', index: idx });
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
