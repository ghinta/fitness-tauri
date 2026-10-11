import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FitnessDatabase,
  createRepositories,
  openFitnessDatabase,
} from '../storage';
import { FitnessService } from './fitness-service';

describe('fitness service', () => {
  let database: FitnessDatabase;
  let service: FitnessService;
  let idCounter: number;

  beforeEach(async () => {
    database = await openFitnessDatabase(
      new FitnessDatabase(`fitness-service-${crypto.randomUUID()}`),
    );
    idCounter = 100;
    service = new FitnessService(
      createRepositories(database),
      () => new Date(`2026-07-19T12:${String(idCounter).slice(-2)}:00.000Z`),
      () => `90000000-0000-4000-8000-${String(idCounter++).padStart(12, '0')}`,
    );
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('starts with session-local alternatives and resumes persisted progress', async () => {
    const plan = (await service.listPlans())[0]!;
    const selections = Object.fromEntries(
      plan.slots.map(({ slot, exercises }, index) => [
        slot.id,
        index === 1 ? exercises[1]!.id : slot.primaryExerciseId,
      ]),
    );
    const session = await service.startWorkout(plan.template.id, selections);
    const first = plan.slots[0]!;

    await service.saveSet(session, first.slot, {
      setType: 'working',
      weightKg: 50,
      durationSeconds: 91,
      notes: 'kontrolliert',
    });

    const resumed = await service.getActiveWorkout();
    expect(resumed?.session.exerciseSelections[plan.slots[1]!.slot.id]).toBe(
      plan.slots[1]!.exercises[1]!.id,
    );
    expect(resumed?.results).toHaveLength(1);
    await expect(service.completeWorkout(session.id)).rejects.toThrow(
      'Arbeitssatz',
    );
  });

  it('records optional warmups, bodyweight without load, and completes all slots', async () => {
    const plan = (await service.listPlans())[0]!;
    const selections = Object.fromEntries(
      plan.slots.map(({ slot }) => [slot.id, slot.primaryExerciseId]),
    );
    const session = await service.startWorkout(plan.template.id, selections);
    await service.saveSet(session, plan.slots[0]!.slot, {
      setType: 'warmup',
      weightKg: 20,
      durationSeconds: 30,
      notes: '',
    });
    for (const { slot, exercises } of plan.slots) {
      await service.saveSet(session, slot, {
        setType: 'working',
        weightKg: exercises[0]!.equipmentType === 'bodyweight' ? null : 50,
        durationSeconds: 75,
        notes: '',
      });
    }

    await service.completeWorkout(session.id);

    const history = await service.listHistory();
    expect(await service.getActiveWorkout()).toBeUndefined();
    expect(history).toHaveLength(1);
    expect(history[0]!.results).toHaveLength(7);
  });

  it('updates an existing exercise increment without rewriting its identity', async () => {
    const exercise = (await service.repositories.exercises.list(true))[0]!;

    await service.updateExercise(exercise, {
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      weightIncrementKg: 1.25,
      active: exercise.active,
    });

    expect(
      (await service.repositories.exercises.get(exercise.id))
        ?.weightIncrementKg,
    ).toBe(1.25);
  });

  it('changes only the current slot selection unless it is explicitly made the default', async () => {
    const plan = (await service.listPlans())[0]!;
    const session = await service.startWorkout(plan.template.id);
    const slot = plan.slots[1]!;
    const alternative = slot.exercises[1]!;

    await service.selectExercise(session, slot.slot, alternative.id, false);
    expect(
      (await service.getActiveWorkout())?.session.exerciseSelections[
        slot.slot.id
      ],
    ).toBe(alternative.id);
    expect(
      (await service.getPlan(plan.template.id)).slots[1]!.slot
        .primaryExerciseId,
    ).toBe(slot.slot.primaryExerciseId);

    await service.selectExercise(
      (await service.getActiveWorkout())!.session,
      slot.slot,
      alternative.id,
      true,
    );
    expect(
      (await service.getPlan(plan.template.id)).slots[1]!.slot
        .primaryExerciseId,
    ).toBe(alternative.id);
  });

  it('derives a persisted timer duration from timestamps and clears it when saved', async () => {
    let time = new Date('2026-07-19T12:00:00.000Z');
    const timedService = new FitnessService(
      service.repositories,
      () => time,
      () => crypto.randomUUID(),
    );
    const plan = (await timedService.listPlans())[0]!;
    const session = await timedService.startWorkout(plan.template.id);

    await timedService.startTimer(
      session,
      plan.slots[0]!.slot,
      'working',
      50,
      '',
    );
    expect(
      (await timedService.getActiveWorkout())?.session.setTimer?.stoppedAt,
    ).toBeNull();
    time = new Date('2026-07-19T12:01:35.000Z');
    const active = (await timedService.getActiveWorkout())!;
    await expect(timedService.stopTimer(active.session)).resolves.toBe(95);
    const stopped = (await timedService.getActiveWorkout())!;
    expect(stopped.session.setTimer?.durationSeconds).toBe(95);

    await timedService.saveSet(stopped.session, plan.slots[0]!.slot, {
      setType: 'working',
      weightKg: 50,
      durationSeconds: 94,
      notes: '',
    });
    expect(
      (await timedService.getActiveWorkout())?.session.setTimer,
    ).toBeNull();
  });
});
