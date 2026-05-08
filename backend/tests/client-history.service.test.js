import { describe, it, expect } from 'vitest';
import { computeClientIdentityHash } from '../services/client-history.service.ts';

describe('client-history.service.computeClientIdentityHash', () => {
  it('produces a deterministic 32-char hash', () => {
    const job = { client: { location: 'United States', totalSpent: 5000, paymentVerified: true } };
    const a = computeClientIdentityHash(job);
    const b = computeClientIdentityHash(job);
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });

  it('buckets close spend amounts into the same hash', () => {
    const job1 = { client: { location: 'us', totalSpent: 5000, paymentVerified: true } };
    const job2 = { client: { location: 'us', totalSpent: 5500, paymentVerified: true } };
    const job3 = { client: { location: 'us', totalSpent: 19999, paymentVerified: true } };
    expect(computeClientIdentityHash(job1)).toBe(computeClientIdentityHash(job2));
    expect(computeClientIdentityHash(job1)).toBe(computeClientIdentityHash(job3));
  });

  it('produces different hashes when spend crosses a bucket boundary', () => {
    // <5k vs <20k bucket boundary at 5000
    const a = computeClientIdentityHash({ client: { location: 'us', totalSpent: 4999, paymentVerified: true } });
    const b = computeClientIdentityHash({ client: { location: 'us', totalSpent: 5000, paymentVerified: true } });
    expect(a).not.toBe(b);
  });

  it('is case-insensitive on location', () => {
    const a = computeClientIdentityHash({ client: { location: 'United States', totalSpent: 100, paymentVerified: false } });
    const b = computeClientIdentityHash({ client: { location: 'UNITED STATES', totalSpent: 100, paymentVerified: false } });
    const c = computeClientIdentityHash({ client: { location: '  united states  ', totalSpent: 100, paymentVerified: false } });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('distinguishes verified vs unverified payment', () => {
    const verified = computeClientIdentityHash({ client: { location: 'us', totalSpent: 1000, paymentVerified: true } });
    const unverified = computeClientIdentityHash({ client: { location: 'us', totalSpent: 1000, paymentVerified: false } });
    expect(verified).not.toBe(unverified);
  });

  it('handles missing client gracefully', () => {
    const result = computeClientIdentityHash({});
    expect(result).toHaveLength(32);
  });
});
