import { describe, expect, it } from 'vitest';

import {
  getDurationBand,
  recommendNextWeight,
  roundToIncrementHalfUp,
} from './recommendation';

describe('getDurationBand', () => {
  it.each([
    [59, 'below-target'],
    [60, 'target'],
    [90, 'target'],
    [91, 'above-target'],
  ] as const)('classifies %i seconds as %s', (seconds, expected) => {
    expect(getDurationBand(seconds)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid duration %s', (value) => {
    expect(() => getDurationBand(value)).toThrow(RangeError);
  });
});

describe('roundToIncrementHalfUp', () => {
  it('rounds an exact tie upwards', () => {
    expect(roundToIncrementHalfUp(102.5, 5)).toBe(105);
  });

  it('handles decimal equipment increments without floating point residue', () => {
    expect(roundToIncrementHalfUp(51.25, 2.5)).toBe(52.5);
    expect(roundToIncrementHalfUp(10.125, 0.25)).toBe(10.25);
  });

  it('rejects invalid values and increments', () => {
    expect(() => roundToIncrementHalfUp(-1, 2.5)).toThrow(RangeError);
    expect(() => roundToIncrementHalfUp(10, 0)).toThrow(RangeError);
  });
});

describe('recommendNextWeight', () => {
  it('retains the load at and below 90 seconds without suggesting a reduction', () => {
    expect(recommendNextWeight(100, 59, 2.5)).toMatchObject({
      action: 'retain',
      suggestedWeightKg: 100,
      increasePercent: 0,
    });
    expect(recommendNextWeight(100, 90, 2.5)).toMatchObject({
      action: 'retain',
      suggestedWeightKg: 100,
    });
  });

  it('adds 2.5 percent above 90 seconds and rounds half-up to the increment', () => {
    expect(recommendNextWeight(100, 91, 5)).toEqual({
      action: 'increase',
      durationBand: 'above-target',
      currentWeightKg: 100,
      suggestedWeightKg: 105,
      increasePercent: 2.5,
    });
  });

  it('recommends an increase without inventing a load for bodyweight results', () => {
    expect(recommendNextWeight(null, 91, 2.5)).toMatchObject({
      action: 'increase',
      currentWeightKg: null,
      suggestedWeightKg: null,
    });
  });

  it('does not mutate a result used as input', () => {
    const result = { weightKg: 80, durationSeconds: 91 };
    recommendNextWeight(result.weightKg, result.durationSeconds, 2.5);
    expect(result).toEqual({ weightKg: 80, durationSeconds: 91 });
  });
});
