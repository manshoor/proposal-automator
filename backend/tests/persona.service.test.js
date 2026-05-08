import { describe, it, expect } from 'vitest';
import { classify, classifyNiche } from '../services/persona.service.js';

describe('persona.service.classify', () => {
  it('flags unverified low-spend client as risky', () => {
    const result = classify(
      { totalSpent: 100, paymentVerified: false, reviewCount: 0 },
      {}
    );
    expect(result.id).toBe('unverified-risky');
    expect(result.confidence).toBe('high');
  });

  it('flags zero-review tiny-spend client as risky', () => {
    const result = classify(
      { totalSpent: 50, paymentVerified: true, reviewCount: 0 },
      {}
    );
    expect(result.id).toBe('unverified-risky');
  });

  it('flags very low budget as low-budget-shopper', () => {
    const result = classify(
      { totalSpent: 10000, paymentVerified: true, hireRate: 50, reviewCount: 30 },
      { budget: { amount: 100 } }
    );
    expect(result.id).toBe('low-budget-shopper');
  });

  it('classifies high-spend US client as enterprise-us-high-spend', () => {
    const result = classify(
      { totalSpent: 50000, hireRate: 60, paymentVerified: true, reviewCount: 30, location: 'United States' },
      {}
    );
    expect(result.id).toBe('enterprise-us-high-spend');
    expect(result.confidence).toBe('high');
  });

  it('classifies mid-spend verified client as agency-mid-spend', () => {
    const result = classify(
      { totalSpent: 2000, hireRate: 40, paymentVerified: true, reviewCount: 15 },
      {}
    );
    expect(result.id).toBe('agency-mid-spend');
  });

  it('classifies new verified client as new-startup', () => {
    const result = classify(
      { totalSpent: 100, paymentVerified: true, reviewCount: 1, hireRate: 50 },
      {}
    );
    expect(result.id).toBe('new-startup');
  });

  it('handles missing client gracefully', () => {
    const result = classify(null, null);
    expect(result.id).toBeDefined();
    expect(['unverified-risky', 'new-startup', 'low-budget-shopper']).toContain(result.id);
  });
});

describe('persona.service.classifyNiche', () => {
  it('matches React jobs to web-frontend', () => {
    expect(classifyNiche({ skills: ['React', 'TypeScript'], title: 'Build a SPA' })).toBe('web-frontend');
  });

  it('matches Node.js jobs to web-backend', () => {
    expect(classifyNiche({ skills: ['Node.js', 'Express'], title: 'API development' })).toBe('web-backend');
  });

  it('matches React Native jobs to mobile', () => {
    expect(classifyNiche({ skills: ['React Native'], title: 'iOS app' })).toBe('mobile');
  });

  it('matches Shopify jobs to shopify niche', () => {
    expect(classifyNiche({ skills: ['Shopify', 'Liquid'], title: 'Custom theme' })).toBe('shopify');
  });

  it('matches by title when skills are empty', () => {
    expect(classifyNiche({ skills: [], title: 'WordPress developer needed' })).toBe('wordpress');
  });

  it('falls back to general for unmatched jobs', () => {
    expect(classifyNiche({ skills: ['Translation'], title: 'Translate a document' })).toBe('general');
  });

  it('handles missing input gracefully', () => {
    expect(classifyNiche({})).toBe('general');
    expect(classifyNiche(null)).toBe('general');
  });
});
