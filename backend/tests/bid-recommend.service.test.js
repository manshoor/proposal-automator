import { describe, it, expect } from 'vitest';
import { recommend } from '../services/bid-recommend.service.js';

describe('bid-recommend.service.recommend', () => {
  const profile = { default_hourly_rate: 50 };

  describe('hourly jobs', () => {
    const baseJob = { budget: { type: 'hourly' }, client: { totalSpent: 1000 }, proposalCount: 10 };

    it('anchors on profile rate when no signals are strong', () => {
      const result = recommend(baseJob, profile, { overall: 6 }, null);
      expect(result.hourly).toBeDefined();
      expect(result.hourly.suggested).toBe(50);
      // Math.round on 50 * 0.85 = 42.5 → 43; 50 * 1.15 → 57 (FP imprecision)
      expect(result.hourly.min).toBe(43);
      expect(result.hourly.max).toBe(57);
    });

    it('nudges up on high alignment', () => {
      const result = recommend(baseJob, profile, { overall: 9 }, null);
      expect(result.hourly.suggested).toBeGreaterThan(50);
      expect(result.hourly.reason).toMatch(/high alignment/i);
    });

    it('nudges up further on high-spend client', () => {
      const result = recommend(
        { ...baseJob, client: { totalSpent: 10000 } },
        profile,
        { overall: 9 },
        null
      );
      expect(result.hourly.suggested).toBeGreaterThanOrEqual(55);
      expect(result.hourly.reason).toMatch(/high-spend/i);
    });

    it('nudges down on heavy competition', () => {
      const result = recommend(
        { ...baseJob, proposalCount: 50 },
        profile,
        { overall: 5 },
        null
      );
      expect(result.hourly.suggested).toBeLessThan(50);
      expect(result.hourly.reason).toMatch(/competition/i);
    });

    it('caps the bump at +/- 20%', () => {
      const result = recommend(
        { ...baseJob, client: { totalSpent: 100000 } },
        profile,
        { overall: 10 },
        null
      );
      // Base $50 * 1.20 = $60 max
      expect(result.hourly.suggested).toBeLessThanOrEqual(60);
    });

    it('falls back to default rate of $50 when profile is empty', () => {
      const result = recommend(baseJob, {}, { overall: 6 }, null);
      expect(result.hourly.suggested).toBe(50);
    });
  });

  describe('fixed-price jobs', () => {
    it('returns 2 milestones for sub-$500 budgets', () => {
      const result = recommend(
        { budget: { type: 'fixed', amount: 400 } },
        profile,
        { overall: 7 },
        null
      );
      expect(result.milestones).toHaveLength(2);
      expect(result.milestones[0].amount + result.milestones[1].amount).toBe(400);
    });

    it('returns 3 milestones for $500-$1000 budgets', () => {
      const result = recommend(
        { budget: { type: 'fixed', amount: 750 } },
        profile,
        { overall: 7 },
        null
      );
      expect(result.milestones).toHaveLength(3);
      const sum = result.milestones.reduce((s, m) => s + m.amount, 0);
      // Allow rounding tolerance of $1
      expect(Math.abs(sum - 750)).toBeLessThanOrEqual(1);
    });

    it('returns 4 milestones for >$1000 budgets', () => {
      const result = recommend(
        { budget: { type: 'fixed', amount: 2000 } },
        profile,
        { overall: 7 },
        null
      );
      expect(result.milestones).toHaveLength(4);
    });

    it('returns null milestones when budget amount is 0', () => {
      const result = recommend(
        { budget: { type: 'fixed', amount: 0 } },
        profile,
        { overall: 7 },
        null
      );
      expect(result.milestones).toBeNull();
    });
  });

  it('returns null for unknown budget type', () => {
    const result = recommend(
      { budget: { type: 'unknown' } },
      profile,
      { overall: 7 },
      null
    );
    expect(result).toBeNull();
  });
});
