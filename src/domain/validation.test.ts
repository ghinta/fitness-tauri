import { describe, expect, it } from 'vitest';

import type {
  DomainData,
  Exercise,
  ExerciseResult,
  WorkoutSession,
} from './entities';
import { createInitialDomainData } from './seeds';
import {
  DomainValidationError,
  isIsoUtcDate,
  isUuid,
  normalizeName,
  parseDomainData,
  validateDomainData,
  validateExercise,
  validateExerciseResult,
  validateUniqueExerciseNames,
  validateWorkoutSession,
} from './validation';

const now = '2026-07-19T12:00:00.000Z';
const later = '2026-07-19T13:00:00.000Z';

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Eigene Übung',
    muscleGroup: 'Beine',
    movementCategory: 'kniedominant',
    equipmentType: 'free-weight',
    weightIncrementKg: 2.5,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sessionFor(
  data: DomainData,
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession {
  const template = data.workoutTemplates[0]!;
  const slots = data.exerciseSlots.filter(
    ({ templateId, active }) => templateId === template.id && active,
  );
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    workoutTemplateId: template.id,
    templateNameSnapshot: template.name,
    status: 'active',
    startedAt: now,
    completedAt: null,
    notes: '',
    exerciseSelections: Object.fromEntries(
      slots.map((slot) => [slot.id, slot.primaryExerciseId]),
    ),
    ...overrides,
  };
}

function resultFor(
  data: DomainData,
  session: WorkoutSession,
  overrides: Partial<ExerciseResult> = {},
): ExerciseResult {
  const [slotId, exerciseId] = Object.entries(session.exerciseSelections)[0]!;
  const selected = data.exercises.find(({ id }) => id === exerciseId)!;
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    workoutSessionId: session.id,
    exerciseSlotId: slotId,
    exerciseId,
    exerciseNameSnapshot: selected.name,
    setType: 'working',
    weightKg: selected.equipmentType === 'bodyweight' ? null : 50,
    durationSeconds: 75,
    notes: '',
    createdAt: later,
    ...overrides,
  };
}

describe('validation primitives', () => {
  it('validates UUIDs and ISO UTC dates strictly', () => {
    expect(isUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true);
    expect(isUuid('not-an-id')).toBe(false);
    expect(isIsoUtcDate(now)).toBe(true);
    expect(isIsoUtcDate('2026-07-19')).toBe(false);
    expect(isIsoUtcDate('2026-02-30T00:00:00.000Z')).toBe(false);
  });

  it('normalizes surrounding, repeated whitespace and case', () => {
    expect(normalizeName('  RUMÄNISCHES   Kreuzheben ')).toBe(
      'rumänisches kreuzheben',
    );
  });

  it('accepts a valid custom exercise and rejects invalid increments', () => {
    expect(validateExercise(exercise())).toEqual([]);
    expect(
      validateExercise(exercise({ weightIncrementKg: 0 })).map(
        ({ path }) => path,
      ),
    ).toContain('exercise.weightIncrementKg');
    expect(
      validateExercise(exercise({ weightIncrementKg: 1001 })).map(
        ({ path }) => path,
      ),
    ).toContain('exercise.weightIncrementKg');
  });

  it('enforces normalized exercise-name uniqueness', () => {
    expect(
      validateUniqueExerciseNames([
        exercise({ name: ' Beinpresse' }),
        exercise({ name: 'BEINPRESSE ' }),
      ]),
    ).toEqual([
      expect.objectContaining({
        code: 'duplicate-name',
        path: 'exercises[1].name',
      }),
    ]);
  });
});

describe('result and session validation', () => {
  it('allows null or non-negative weight and positive whole seconds', () => {
    const data = createInitialDomainData();
    const session = sessionFor(data);
    expect(validateExerciseResult(resultFor(data, session))).toEqual([]);
    expect(
      validateExerciseResult(
        resultFor(data, session, { weightKg: 0, durationSeconds: 1 }),
      ),
    ).toEqual([]);
    expect(
      validateExerciseResult(
        resultFor(data, session, { weightKg: -1, durationSeconds: 1.5 }),
      ),
    ).toHaveLength(2);
    expect(
      validateExerciseResult(
        resultFor(data, session, {
          weightKg: 100_001,
          durationSeconds: 86_401,
        }),
      ),
    ).toHaveLength(2);
  });

  it('allows an active session only without a completion time', () => {
    const data = createInitialDomainData();
    expect(validateWorkoutSession(sessionFor(data))).toEqual([]);
    expect(
      validateWorkoutSession(sessionFor(data, { completedAt: later })),
    ).toEqual([
      expect.objectContaining({
        code: 'invariant',
        path: 'workoutSession.completedAt',
      }),
    ]);
  });

  it('requires a completed session to end at or after its start', () => {
    const data = createInitialDomainData();
    expect(
      validateWorkoutSession(
        sessionFor(data, {
          status: 'completed',
          completedAt: '2026-07-19T11:00:00.000Z',
        }),
      ).map(({ code }) => code),
    ).toContain('invariant');
  });
});

describe('domain graph validation', () => {
  it('accepts an active session with persisted selections and warm-up and working sets', () => {
    const data = createInitialDomainData();
    const session = sessionFor(data);
    data.workoutSessions.push(session);
    data.exerciseResults.push(
      resultFor(data, session, {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        setType: 'warmup',
      }),
      resultFor(data, session),
    );
    expect(validateDomainData(data)).toEqual([]);
  });

  it('allows bodyweight results without external weight', () => {
    const data = createInitialDomainData();
    const session = sessionFor(data);
    const bodyweightSlot = data.exerciseSlots.find((slot) =>
      [slot.primaryExerciseId, ...slot.alternativeExerciseIds].some(
        (id) =>
          data.exercises.find((candidate) => candidate.id === id)
            ?.equipmentType === 'bodyweight',
      ),
    )!;
    const bodyweightExercise = [
      bodyweightSlot.primaryExerciseId,
      ...bodyweightSlot.alternativeExerciseIds,
    ]
      .map((id) => data.exercises.find((candidate) => candidate.id === id)!)
      .find(({ equipmentType }) => equipmentType === 'bodyweight')!;
    session.exerciseSelections[bodyweightSlot.id] = bodyweightExercise.id;
    data.workoutSessions.push(session);
    data.exerciseResults.push(
      resultFor(data, session, {
        exerciseSlotId: bodyweightSlot.id,
        exerciseId: bodyweightExercise.id,
        exerciseNameSnapshot: bodyweightExercise.name,
        weightKg: null,
      }),
    );
    expect(validateDomainData(data)).toEqual([]);
  });

  it('rejects null weight for a non-bodyweight exercise', () => {
    const data = createInitialDomainData();
    const session = sessionFor(data);
    data.workoutSessions.push(session);
    data.exerciseResults.push(resultFor(data, session, { weightKg: null }));
    expect(validateDomainData(data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'exerciseResults[0].weightKg',
          code: 'invariant',
        }),
      ]),
    );
  });

  it('rejects duplicate IDs, dangling references and multiple active sessions', () => {
    const data = createInitialDomainData();
    const first = sessionFor(data);
    const second = sessionFor(data, {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      workoutTemplateId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });
    data.exercises.push({ ...data.exercises[0]! });
    data.workoutSessions.push(first, second);
    const issues = validateDomainData(data);
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'duplicate-id',
        'dangling-reference',
        'invariant',
      ]),
    );
  });

  it('requires one valid selection for every active template slot', () => {
    const data = createInitialDomainData();
    const session = sessionFor(data);
    delete session.exerciseSelections[
      Object.keys(session.exerciseSelections)[0]!
    ];
    data.workoutSessions.push(session);
    expect(validateDomainData(data).map(({ message }) => message)).toEqual(
      expect.arrayContaining([expect.stringContaining('fehlt')]),
    );
  });

  it('rejects duplicate set types per session and slot', () => {
    const data = createInitialDomainData();
    const session = sessionFor(data);
    data.workoutSessions.push(session);
    data.exerciseResults.push(
      resultFor(data, session),
      resultFor(data, session, {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    );
    expect(validateDomainData(data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invariant',
          path: 'exerciseResults[1].setType',
        }),
      ]),
    );
  });

  it('requires exactly one working set per selection when completed', () => {
    const data = createInitialDomainData();
    data.workoutSessions.push(
      sessionFor(data, { status: 'completed', completedAt: later }),
    );
    expect(
      validateDomainData(data).some(
        ({ code, message }) =>
          code === 'invariant' && message.includes('Arbeitssatz'),
      ),
    ).toBe(true);
  });

  it('keeps completed session selections valid after a slot is deactivated', () => {
    const data = createInitialDomainData();
    const session = sessionFor(data);
    const selectedEntries = Object.entries(session.exerciseSelections);
    session.status = 'completed';
    session.completedAt = later;
    data.workoutSessions.push(session);
    selectedEntries.forEach(([slotId, selectedExerciseId], index) => {
      const selected = data.exercises.find(
        ({ id }) => id === selectedExerciseId,
      )!;
      data.exerciseResults.push(
        resultFor(data, session, {
          id: `40000000-0000-4000-8000-00000000000${index + 1}`,
          exerciseSlotId: slotId,
          exerciseId: selectedExerciseId,
          exerciseNameSnapshot: selected.name,
          weightKg: selected.equipmentType === 'bodyweight' ? null : 50,
        }),
      );
    });
    data.exerciseSlots.find(({ id }) => id === selectedEntries[0]![0])!.active =
      false;
    expect(validateDomainData(data)).toEqual([]);
  });

  it('rejects results dated before their workout began', () => {
    const data = createInitialDomainData();
    const session = sessionFor(data);
    data.workoutSessions.push(session);
    data.exerciseResults.push(
      resultFor(data, session, { createdAt: '2026-07-19T11:00:00.000Z' }),
    );
    expect(validateDomainData(data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'exerciseResults[0].createdAt',
          code: 'invariant',
        }),
      ]),
    );
  });
});

describe('parseDomainData', () => {
  it('returns a fully validated domain graph', () => {
    const data = createInitialDomainData();
    expect(parseDomainData(data)).toBe(data);
  });

  it('reports missing collections without changing data', () => {
    expect(() => parseDomainData({ exercises: [] })).toThrow(
      DomainValidationError,
    );
  });

  it('reports malformed collection entries instead of throwing a native error', () => {
    const data = createInitialDomainData() as unknown as {
      exercises: unknown[];
    };
    data.exercises = [{ name: null }];
    expect(() => parseDomainData(data)).toThrow(DomainValidationError);
  });

  it('rejects collections above the documented safety limits', () => {
    const data = createInitialDomainData();
    data.exercises = Array.from({ length: 501 }, (_, index) =>
      exercise({
        id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        name: `Eigene Übung ${index}`,
      }),
    );
    expect(validateDomainData(data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'exercises', code: 'invalid-value' }),
      ]),
    );
  });
});
