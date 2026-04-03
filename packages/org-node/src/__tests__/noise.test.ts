import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before importing noise module
vi.mock('../config', () => ({
  config: {
    sumSensitivity: 500,
  },
}));

import { applyNoise } from '../noise';
import { LocalResult } from '../types';

describe('Noise Wrapper', () => {
  it('should return scalar type for scalar input', () => {
    const result: LocalResult = { type: 'scalar', value: 100 };
    const noisy = applyNoise(result, 1.0);
    expect(noisy.type).toBe('scalar');
    expect(typeof noisy.value).toBe('number');
    expect(Number.isFinite(noisy.value as number)).toBe(true);
  });

  it('should return avg type with sum and count', () => {
    const result: LocalResult = { type: 'avg', sum: 5000, count: 100 };
    const noisy = applyNoise(result, 1.0);
    expect(noisy.type).toBe('avg');
    expect(typeof noisy.sum).toBe('number');
    expect(typeof noisy.count).toBe('number');
    expect(Number.isFinite(noisy.sum as number)).toBe(true);
    expect(Number.isFinite(noisy.count as number)).toBe(true);
    // Count should be clamped to >= 0
    expect((noisy.count as number) >= 0).toBe(true);
  });

  it('should return grouped type with correct shape', () => {
    const result: LocalResult = {
      type: 'grouped',
      groups: [
        { groupKey: 'North', value: 100 },
        { groupKey: 'South', value: 200 },
      ],
    };
    const noisy = applyNoise(result, 1.0);
    expect(noisy.type).toBe('grouped');
    const groups = noisy.groups as Array<{ groupKey: string; value: number }>;
    expect(groups).toHaveLength(2);
    expect(groups[0].groupKey).toBe('North');
    expect(groups[1].groupKey).toBe('South');
    expect(Number.isFinite(groups[0].value)).toBe(true);
    expect(Number.isFinite(groups[1].value)).toBe(true);
  });

  it('should return grouped_avg type with correct shape', () => {
    const result: LocalResult = {
      type: 'grouped_avg',
      groups: [
        { groupKey: 'East', sum: 3000, count: 50 },
        { groupKey: 'West', sum: 4000, count: 80 },
      ],
    };
    const noisy = applyNoise(result, 1.0);
    expect(noisy.type).toBe('grouped_avg');
    const groups = noisy.groups as Array<{ groupKey: string; sum: number; count: number }>;
    expect(groups).toHaveLength(2);
    groups.forEach((g) => {
      expect(Number.isFinite(g.sum)).toBe(true);
      expect(Number.isFinite(g.count)).toBe(true);
      expect(g.count >= 0).toBe(true);
    });
  });

  it('should produce different noise across multiple calls (probabilistic)', () => {
    const result: LocalResult = { type: 'scalar', value: 1000 };
    const results = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const noisy = applyNoise(result, 1.0);
      results.add(noisy.value as number);
    }
    // With 10 random draws it's astronomically unlikely they're all the same
    expect(results.size).toBeGreaterThan(1);
  });

  it('should add noise proportional to epsilon (smaller epsilon = more noise)', () => {
    const result: LocalResult = { type: 'scalar', value: 1000 };
    let totalDevSmallEps = 0;
    let totalDevLargeEps = 0;
    const n = 100;

    for (let i = 0; i < n; i++) {
      const noisySmall = applyNoise(result, 0.1);
      const noisyLarge = applyNoise(result, 10.0);
      totalDevSmallEps += Math.abs((noisySmall.value as number) - 1000);
      totalDevLargeEps += Math.abs((noisyLarge.value as number) - 1000);
    }

    // On average, smaller epsilon => larger deviation
    expect(totalDevSmallEps / n).toBeGreaterThan(totalDevLargeEps / n);
  });
});
