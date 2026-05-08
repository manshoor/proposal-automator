import { describe, it, expect } from 'vitest';
import { isRateNegotiationContext } from '../prompts/message.ts';

describe('isRateNegotiationContext', () => {
  it('detects clear rate-negotiation language', () => {
    expect(isRateNegotiationContext('Your rate is too expensive')).toBe(true);
    expect(isRateNegotiationContext('Can we negotiate a lower budget?')).toBe(true);
    expect(isRateNegotiationContext('Is there any discount available?')).toBe(true);
    expect(isRateNegotiationContext("I can't afford that price")).toBe(true);
    expect(isRateNegotiationContext('Are you flexible on rate?')).toBe(true);
    expect(isRateNegotiationContext('Could you come down on the price?')).toBe(true);
  });

  it('returns false for unrelated messages', () => {
    expect(isRateNegotiationContext('When can you start?')).toBe(false);
    expect(isRateNegotiationContext('Sounds great, let us proceed')).toBe(false);
    expect(isRateNegotiationContext('Please send your portfolio')).toBe(false);
  });

  it('returns false for empty / null / non-string input', () => {
    expect(isRateNegotiationContext('')).toBe(false);
    expect(isRateNegotiationContext(null)).toBe(false);
    expect(isRateNegotiationContext(undefined)).toBe(false);
    expect(isRateNegotiationContext(42)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isRateNegotiationContext('YOUR RATE IS HIGH')).toBe(true);
    expect(isRateNegotiationContext('Your Budget is too high')).toBe(true);
  });
});
