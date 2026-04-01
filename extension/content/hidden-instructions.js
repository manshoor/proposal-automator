/**
 * hidden-instructions.js
 * Detects hidden instructions embedded in Upwork job descriptions.
 * Relies on HIDDEN_INSTRUCTION_PATTERNS from constants.js (loaded first).
 */

/**
 * Extract the surrounding sentence from a block of text given a match index.
 * @param {string} text - Full text to search within
 * @param {number} matchIndex - Start index of the regex match
 * @param {number} matchLength - Length of the regex match
 * @returns {string} The sentence containing the match
 */
function extractSurroundingSentence(text, matchIndex, matchLength) {
  // Find sentence start: walk back to a sentence-ending punctuation or start of text
  let start = matchIndex;
  while (start > 0) {
    const ch = text[start - 1];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
      break;
    }
    start--;
  }

  // Find sentence end: walk forward to a sentence-ending punctuation or end of text
  let end = matchIndex + matchLength;
  while (end < text.length) {
    const ch = text[end];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
      end++; // include the punctuation
      break;
    }
    end++;
  }

  return text.slice(start, end).trim();
}

/**
 * Detect hidden instructions in a job description.
 * @param {string} descriptionText - The raw job description text
 * @returns {{ found: boolean, instructions: string[], rawMatches: string[] }}
 */
function detectHiddenInstructions(descriptionText) {
  if (!descriptionText || typeof descriptionText !== 'string') {
    return { found: false, instructions: [], rawMatches: [] };
  }

  const instructions = [];
  const rawMatches = [];

  for (const pattern of HIDDEN_INSTRUCTION_PATTERNS) {
    // Reset lastIndex so each call starts from the beginning
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(descriptionText)) !== null) {
      const rawMatch = match[0];

      // Avoid duplicates
      if (!rawMatches.includes(rawMatch)) {
        rawMatches.push(rawMatch);

        const sentence = extractSurroundingSentence(
          descriptionText,
          match.index,
          rawMatch.length
        );

        if (!instructions.includes(sentence)) {
          instructions.push(sentence);
        }
      }

      // Prevent infinite loops on zero-length matches
      if (match.index === pattern.lastIndex) {
        pattern.lastIndex++;
      }
    }

    // Always reset lastIndex after use (patterns have the 'g' flag)
    pattern.lastIndex = 0;
  }

  return {
    found: instructions.length > 0,
    instructions,
    rawMatches
  };
}
