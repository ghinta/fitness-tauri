import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';

import type {
  Exercise,
  ExerciseResult,
  WorkoutSession,
} from '../domain/entities';
import { createInitialDomainData } from '../domain/seeds';
import {
  FitnessDatabase,
  SEED_VERSION_META_KEY,
  openFitnessDatabase,
} from './database';
import { StorageError } from './errors';
import { createRepositories, type Repositories } from './repositories';

let sequence = 0;
let database: FitnessDatabase;
let repositories: Repositories;

beforeEach(async () => {
  database = await openFitnessDatabase(
    new FitnessDatabase(`fitness-pwa-test-${sequence++}`),
  );
  repositories = createRepositories(database);
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe('FitnessDatabase', () => {
  it('seeds Training A, Training B and metadata only when first created', async () => {
    const templates = await repositories.templates.list();
    const exercises = await repositories.exercises.list();
    const seedVersion = await database.meta.get(SEED_VERSION_META_KEY);

    expect(templates.map(({ name }) => name)).toEqual([
      'Training A',
      'Training B',
    ]);
    expect(exercises.length).toBeGreaterThan(10);
    expect(seedVersion?.value).toBe(2);

    database.close();
    await database.open();
    expect(await database.workoutTemplates.count()).toBe(2);
  });

  it('defines the documented indexes for every version 2 store', () => {
    expect(indexNames(database, 'exercises')).toEqual([
      'active',
      'movementCategory',
    ]);
    expect(indexNames(database, 'workoutTemplates')).toEqual(['active']);
    expect(indexNames(database, 'exerciseSlots')).toEqual([
      'templateId',
      '[templateId+order]',
    ]);
    expect(indexNames(database, 'workoutSessions')).toEqual([
      'status',
      'startedAt',
      'workoutTemplateId',
    ]);
    expect(indexNames(database, 'exerciseResults')).toEqual([
      'workoutSessionId',
      'exerciseId',
      '[exerciseId+createdAt]',
      'exerciseSlotId',
    ]);
    expect(indexNames(database, 'meta')).toEqual([]);
  });

  it('migrates version 1 data without replacing existing records', async () => {
    const name = `fitness-pwa-v1-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      exercises: 'id, active, movementCategory',
      workoutTemplates: 'id, active',
      exerciseSlots: 'id, templateId, [templateId+order]',
      workoutSessions: 'id, status, startedAt, workoutTemplateId',
      exerciseResults:
        'id, workoutSessionId, exerciseId, [exerciseId+createdAt], exerciseSlotId',
      meta: 'key',
    });
    await legacy.open();
    const seed = createInitialDomainData();
    const existingExercise = { ...seed.exercises[0]!, name: 'Meine Kniebeuge' };
    await legacy
      .table('exercises')
      .bulkAdd([existingExercise, ...seed.exercises.slice(1, 19)]);
    await legacy.table('workoutTemplates').bulkAdd(seed.workoutTemplates);
    await legacy
      .table('exerciseSlots')
      .bulkAdd(seed.exerciseSlots.filter(({ order }) => order <= 5));
    await legacy.table('meta').add({ key: SEED_VERSION_META_KEY, value: 1 });
    legacy.close();

    const migrated = await openFitnessDatabase(new FitnessDatabase(name));
    expect((await migrated.exercises.get(existingExercise.id))?.name).toBe(
      'Meine Kniebeuge',
    );
    expect(
      await migrated.exerciseSlots.filter(({ order }) => order === 6).count(),
    ).toBe(2);
    expect((await migrated.meta.get(SEED_VERSION_META_KEY))?.value).toBe(2);
    migrated.close();
    await Dexie.delete(name);
  });
});

describe('workout repository', () => {
  it('atomically permits only one active session', async () => {
    const first = await sessionFixture('session-1');
    const second = await sessionFixture('session-2');

    const outcomes = await Promise.allSettled([
      repositories.workouts.startSession(first),
      repositories.workouts.startSession(second),
    ]);

    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(await database.workoutSessions.count()).toBe(1);
  });

  it('rejects incomplete or unsupported exercise selections', async () => {
    const session = await sessionFixture('session-selection');
    session.exerciseSelections = {};

    await expect(
      repositories.workouts.startSession(session),
    ).rejects.toMatchObject({
      code: 'integrity',
    });
    expect(await database.workoutSessions.count()).toBe(0);
  });

  it('allows at most one set of each type per session and slot', async () => {
    const session = await sessionFixture('session-results');
    await repositories.workouts.startSession(session);
    const first = await resultFixture(session, 'result-1', 'working');
    const duplicate = { ...first, id: 'result-2' };

    await repositories.workouts.saveResult(first);
    await expect(
      repositories.workouts.saveResult(duplicate),
    ).rejects.toMatchObject({
      code: 'constraint',
    });
    expect(await repositories.workouts.listSessionResults(session.id)).toEqual([
      first,
    ]);
  });

  it('prevents deactivating an exercise selected by the active session', async () => {
    const session = await sessionFixture('session-active-exercise');
    await repositories.workouts.startSession(session);
    const exerciseId = required(Object.values(session.exerciseSelections)[0]);
    const exercise = required(await repositories.exercises.get(exerciseId));

    await expect(
      repositories.exercises.put({ ...exercise, active: false }),
    ).rejects.toMatchObject({ code: 'constraint' });
    expect((await repositories.exercises.get(exerciseId))?.active).toBe(true);
  });

  it('rolls back both the final result and completion when the result conflicts', async () => {
    const session = await sessionFixture('session-completion');
    await repositories.workouts.startSession(session);
    const result = await resultFixture(session, 'result-existing', 'working');
    await repositories.workouts.saveResult(result);

    await expect(
      repositories.workouts.completeSession(
        session.id,
        '2026-07-19T11:00:00.000Z',
        { ...result, id: 'result-conflict' },
      ),
    ).rejects.toMatchObject({ code: 'constraint' });

    expect((await repositories.workouts.getSession(session.id))?.status).toBe(
      'active',
    );
    expect(await database.exerciseResults.count()).toBe(1);
  });

  it('saves a final result and completion in one transaction', async () => {
    const session = await sessionFixture('session-complete');
    await repositories.workouts.startSession(session);
    const result = await resultFixture(session, 'result-final', 'working');

    await repositories.workouts.completeSession(
      session.id,
      '2026-07-19T11:00:00.000Z',
      result,
    );

    expect(await repositories.workouts.getSession(session.id)).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-19T11:00:00.000Z',
    });
    expect(await database.exerciseResults.get(result.id)).toEqual(result);
  });
});

describe('configuration repository', () => {
  it('reorders two slots in one transaction', async () => {
    const template = required((await repositories.templates.list())[0]);
    const slots = await repositories.templates.listSlots(template.id);
    const first = required(slots[0]);
    const second = required(slots[1]);

    await repositories.templates.putSlots([
      { ...first, order: second.order },
      { ...second, order: first.order },
    ]);

    expect(
      (await repositories.templates.listSlots(template.id))
        .slice(0, 2)
        .map(({ id }) => id),
    ).toEqual([second.id, first.id]);
  });
});

describe('snapshot repository', () => {
  it('reads every durable store consistently', async () => {
    const snapshot = await repositories.snapshots.read();

    expect(snapshot.exercises).not.toHaveLength(0);
    expect(snapshot.workoutTemplates).toHaveLength(2);
    expect(snapshot.exerciseSlots).toHaveLength(12);
    expect(snapshot.workoutSessions).toEqual([]);
    expect(snapshot.exerciseResults).toEqual([]);
    expect(snapshot.meta).toContainEqual({
      key: SEED_VERSION_META_KEY,
      value: 2,
    });
  });

  it('rejects invalid replacement data without changing existing data', async () => {
    const before = await repositories.snapshots.read();
    const invalid = structuredClone(before);
    invalid.exerciseSlots[0] = {
      ...required(invalid.exerciseSlots[0]),
      templateId: 'missing-template',
    };

    await expect(
      repositories.snapshots.replace(invalid),
    ).rejects.toBeInstanceOf(StorageError);
    expect(await repositories.snapshots.read()).toEqual(before);
  });

  it('replaces all stores atomically with a valid snapshot', async () => {
    const snapshot = await repositories.snapshots.read();
    snapshot.exercises[0] = {
      ...required(snapshot.exercises[0]),
      name: 'Geänderte Übung',
    };

    await repositories.snapshots.replace(snapshot);

    expect((await repositories.snapshots.read()).exercises[0]?.name).toBe(
      'Geänderte Übung',
    );
  });

  it('rolls back cleared stores when an IndexedDB write fails', async () => {
    const before = await repositories.snapshots.read();
    const invalid = structuredClone(before);
    invalid.exercises.push({
      ...required(invalid.exercises[0]),
      id: undefined,
      name: 'Ungültiger Schlüssel',
    } as unknown as Exercise);

    await expect(repositories.snapshots.replace(invalid)).rejects.toMatchObject(
      {
        code: 'transaction',
      },
    );
    expect(await repositories.snapshots.read()).toEqual(before);
  });
});

async function sessionFixture(id: string): Promise<WorkoutSession> {
  const template = required((await repositories.templates.list())[0]);
  const slots = await repositories.templates.listSlots(template.id);
  return {
    id,
    workoutTemplateId: template.id,
    templateNameSnapshot: template.name,
    exerciseSelections: Object.fromEntries(
      slots.map((slot) => [slot.id, slot.primaryExerciseId]),
    ),
    status: 'active',
    startedAt: '2026-07-19T10:00:00.000Z',
    completedAt: null,
    notes: '',
  };
}

async function resultFixture(
  session: WorkoutSession,
  id: string,
  setType: ExerciseResult['setType'],
): Promise<ExerciseResult> {
  const template = required(
    await repositories.templates.get(session.workoutTemplateId),
  );
  const slot = required(
    (await repositories.templates.listSlots(template.id))[0],
  );
  const exerciseId = required(session.exerciseSelections[slot.id]);
  const exercise = required(await repositories.exercises.get(exerciseId));
  return {
    id,
    workoutSessionId: session.id,
    exerciseSlotId: slot.id,
    exerciseId,
    exerciseNameSnapshot: exercise.name,
    setType,
    weightKg: exercise.equipmentType === 'bodyweight' ? null : 50,
    durationSeconds: 75,
    notes: '',
    createdAt: '2026-07-19T10:30:00.000Z',
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Test fixture is missing seeded data.');
  }
  return value;
}

function indexNames(
  currentDatabase: FitnessDatabase,
  tableName: string,
): string[] {
  return currentDatabase
    .table(tableName)
    .schema.indexes.map(({ name }) => name);
}
