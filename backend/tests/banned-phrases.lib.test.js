import { describe, it, expect } from 'vitest';
import { findBannedPhrases, hasBlocker } from '../lib/banned-phrases.ts';

describe('lib/banned-phrases.findBannedPhrases', () => {
  const phrases = [
    { phrase: 'I am the best', severity: 'block' },
    { phrase: 'passion for', severity: 'warn' },
  ];

  it('matches case-insensitively', () => {
    const hits = findBannedPhrases('Hello, I AM THE BEST candidate.', phrases);
    expect(hits).toHaveLength(1);
    expect(hits[0].phrase).toBe('I am the best');
    expect(hits[0].severity).toBe('block');
  });

  it('respects word boundaries — does NOT match within a longer word', () => {
    // "compassion for" should not trigger "passion for"
    const hits = findBannedPhrases('I have a great compassion for animals.', phrases);
    expect(hits).toHaveLength(0);
  });

  it('matches when surrounded by whitespace and punctuation', () => {
    const hits = findBannedPhrases('I have passion for your project!', phrases);
    expect(hits).toHaveLength(1);
    expect(hits[0].phrase).toBe('passion for');
  });

  it('returns multiple hits across phrases', () => {
    const hits = findBannedPhrases('I am the best, with passion for the work', phrases);
    expect(hits).toHaveLength(2);
  });

  it('returns empty array on empty / non-string text', () => {
    expect(findBannedPhrases('', phrases)).toEqual([]);
    expect(findBannedPhrases(null, phrases)).toEqual([]);
    expect(findBannedPhrases(undefined, phrases)).toEqual([]);
  });

  it('returns empty array when phrase list is empty', () => {
    expect(findBannedPhrases('any text', [])).toEqual([]);
    expect(findBannedPhrases('any text', null)).toEqual([]);
  });

  it('skips empty phrase strings instead of matching everywhere', () => {
    const hits = findBannedPhrases('any text', [{ phrase: '', severity: 'block' }]);
    expect(hits).toEqual([]);
  });

  it('survives malformed regex characters in phrases', () => {
    const wonky = [{ phrase: 'C++ developer', severity: 'warn' }];
    // Should not throw; '.replace' escapes the special chars.
    expect(() => findBannedPhrases('looking for a C++ developer', wonky)).not.toThrow();
    const hits = findBannedPhrases('looking for a C++ developer', wonky);
    expect(hits).toHaveLength(1);
  });
});

describe('lib/banned-phrases.hasBlocker', () => {
  it('returns true when any hit has severity "block"', () => {
    expect(hasBlocker([{ severity: 'warn' }, { severity: 'block' }])).toBe(true);
  });

  it('returns false when only warn-level hits', () => {
    expect(hasBlocker([{ severity: 'warn' }, { severity: 'warn' }])).toBe(false);
  });

  it('returns false on empty / non-array input', () => {
    expect(hasBlocker([])).toBe(false);
    expect(hasBlocker(null)).toBe(false);
    expect(hasBlocker(undefined)).toBe(false);
  });
});
