export const TARGET_DURATION_MIN_SECONDS = 60;
export const TARGET_DURATION_MAX_SECONDS = 90;
export const WEIGHT_INCREASE_FACTOR = 1.025;

export type DurationBand = 'below-target' | 'target' | 'above-target';
export type RecommendationAction = 'retain' | 'increase';

export interface WeightRecommendation {
  action: RecommendationAction;
  durationBand: DurationBand;
  currentWeightKg: number | null;
  suggestedWeightKg: number | null;
  increasePercent: 0 | 2.5;
}

function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (text.includes('e-')) {
    return Number(text.split('e-')[1]);
  }
  return text.split('.')[1]?.length ?? 0;
}

/** Rounds to the nearest increment. Exact ties are rounded upwards. */
export function roundToIncrementHalfUp(
  value: number,
  increment: number,
): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      'Das Gewicht muss eine endliche, nicht negative Zahl sein.',
    );
  }
  if (!Number.isFinite(increment) || increment <= 0) {
    throw new RangeError('Die Gewichtssteigerung muss größer als null sein.');
  }

  const precision = Math.min(
    Math.max(decimalPlaces(value), decimalPlaces(increment)),
    10,
  );
  const factor = 10 ** precision;
  const valueUnits = Math.round(value * factor);
  const incrementUnits = Math.round(increment * factor);
  const roundedUnits =
    Math.floor(valueUnits / incrementUnits + 0.5) * incrementUnits;

  return roundedUnits / factor;
}

export function getDurationBand(durationSeconds: number): DurationBand {
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError(
      'Die Dauer muss eine positive ganze Sekundenzahl sein.',
    );
  }
  if (durationSeconds < TARGET_DURATION_MIN_SECONDS) return 'below-target';
  if (durationSeconds <= TARGET_DURATION_MAX_SECONDS) return 'target';
  return 'above-target';
}

/**
 * Calculates an advisory next-weight recommendation without mutating its input.
 * For bodyweight results without external load, an increase is recommended but
 * no numeric load can be calculated.
 */
export function recommendNextWeight(
  weightKg: number | null,
  durationSeconds: number,
  incrementKg: number,
): WeightRecommendation {
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0)) {
    throw new RangeError(
      'Das Gewicht muss null oder eine nicht negative Zahl sein.',
    );
  }
  if (!Number.isFinite(incrementKg) || incrementKg <= 0) {
    throw new RangeError('Die Gewichtssteigerung muss größer als null sein.');
  }

  const durationBand = getDurationBand(durationSeconds);
  if (durationBand !== 'above-target') {
    return {
      action: 'retain',
      durationBand,
      currentWeightKg: weightKg,
      suggestedWeightKg: weightKg,
      increasePercent: 0,
    };
  }

  return {
    action: 'increase',
    durationBand,
    currentWeightKg: weightKg,
    suggestedWeightKg:
      weightKg === null
        ? null
        : roundToIncrementHalfUp(
            weightKg * WEIGHT_INCREASE_FACTOR,
            incrementKg,
          ),
    increasePercent: 2.5,
  };
}
