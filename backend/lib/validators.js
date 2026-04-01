/**
 * Validates that all listed field names are present (non-empty) in body.
 * @param {string[]} fields
 * @param {Record<string, unknown>} body
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRequired(fields, body) {
  const errors = fields
    .filter((field) => {
      const value = body[field];
      return value === undefined || value === null || value === '';
    })
    .map((field) => `${field} is required`);

  return { valid: errors.length === 0, errors };
}

/**
 * Returns true if the string is a valid URL.
 * @param {string} url
 * @returns {boolean}
 */
export function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
