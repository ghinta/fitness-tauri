import { describe, expect, it } from 'vitest';

import {
  createInitialDomainData,
  DEFAULT_EXERCISES,
  DEFAULT_EXERCISE_SLOTS,
  DEFAULT_WORKOUT_TEMPLATES,
} from './seeds';
import { validateDomainData } from './validation';

describe('initial domain seeds', () => {
  it('defines Training A and B with six ordered slots each', () => {
    expect(DEFAULT_WORKOUT_TEMPLATES.map(({ name }) => name)).toEqual([
      'Training A',
      'Training B',
    ]);
    for (const template of DEFAULT_WORKOUT_TEMPLATES) {
      expect(
        DEFAULT_EXERCISE_SLOTS.filter(
          ({ templateId }) => templateId === template.id,
        ).map(({ order }) => order),
      ).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('contains every documented primary exercise and alternative', () => {
    expect(DEFAULT_EXERCISES.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'Kniebeuge',
        'Beinpresse',
        'Liegestütze',
        'Bankdrücken',
        'Brustpresse',
        'Langhantelrudern',
        'Rudermaschine',
        'Beinbeuger',
        'Rumänisches Kreuzheben',
        'Hängendes Beinheben',
        'Unterarmstütz',
        'Bauchmaschine',
        'Kreuzheben',
        'Rückenstrecker',
        'Klimmzüge',
        'Latzug',
        'Schulterdrücken',
        'Schulterpresse',
        'Bulgarische Kniebeuge',
        'Trizepsdrücken am Kabelzug',
        'Dips',
        'Bizepscurls',
        'Hammercurls',
      ]),
    );
  });

  it('is internally valid and uses stable UUIDs', () => {
    expect(validateDomainData(createInitialDomainData())).toEqual([]);
  });

  it('returns independently mutable copies for persistence seeding', () => {
    const first = createInitialDomainData();
    const second = createInitialDomainData();
    first.exercises[0]!.name = 'Geändert';
    first.exerciseSlots[0]!.alternativeExerciseIds.push(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
    );
    expect(second.exercises[0]!.name).toBe('Kniebeuge');
    expect(second.exerciseSlots[0]!.alternativeExerciseIds).toHaveLength(1);
  });
});
