/**
 * Banned-phrase matcher utilities.
 * Pure functions; phrases are loaded by the caller (typically the service layer) and passed in.
 *
 * Matching is case-insensitive and uses word boundaries when the phrase starts/ends
 * with a word character — this prevents false positives like matching "passion for"
 * inside "compassion for".
 */

export type Severity = 'block' | 'warn';

export interface BannedPhrase {
  phrase: string;
  severity?: Severity;
}

export interface BannedPhraseHit {
  phrase: string;
  severity: Severity;
  index: number | undefined;
}

/**
 * Build a case-insensitive regex for one banned phrase, with word boundaries
 * applied only at edges that are word characters. Phrases that start or end with
 * punctuation (e.g., "I'd…", "…me!") rely on the punctuation itself for separation.
 */
function buildPhraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const startBound = /^\w/.test(phrase) ? '\\b' : '';
  const endBound = /\w$/.test(phrase) ? '\\b' : '';
  return new RegExp(startBound + escaped + endBound, 'i');
}

/**
 * Find banned-phrase hits in a text. Word-boundary aware, case-insensitive.
 */
export function findBannedPhrases(
  text: string | null | undefined,
  phrases: BannedPhrase[] | null | undefined,
): BannedPhraseHit[] {
  if (!text || typeof text !== 'string') return [];
  if (!Array.isArray(phrases) || phrases.length === 0) return [];
  const hits: BannedPhraseHit[] = [];
  for (const p of phrases) {
    const needle = (p.phrase || '').trim();
    if (!needle) continue;
    try {
      const re = buildPhraseRegex(needle);
      const match = text.match(re);
      if (match) {
        hits.push({ phrase: p.phrase, severity: (p.severity ?? 'warn') as Severity, index: match.index });
      }
    } catch {
      // Malformed regex — skip this phrase rather than throwing
    }
  }
  return hits;
}

/**
 * Returns true if any hit has severity 'block'.
 */
export function hasBlocker(hits: { severity?: string }[] | null | undefined): boolean {
  return Array.isArray(hits) && hits.some((h) => h.severity === 'block');
}
