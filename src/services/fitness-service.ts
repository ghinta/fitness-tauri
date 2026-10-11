import {
  DomainValidationError,
  normalizeName,
  validateExercise,
  validateExerciseResult,
  validateWorkoutTemplate,
  type EquipmentType,
  type Exercise,
  type ExerciseResult,
  type ExerciseImage,
  type ExerciseSlot,
  type SetType,
  type WorkoutSession,
  type WorkoutTemplate,
} from '../domain';
import type { Repositories } from '../storage';

export interface TemplatePlan {
  template: WorkoutTemplate;
  slots: Array<{
    slot: ExerciseSlot;
    exercises: Exercise[];
  }>;
}

export interface ActiveWorkout {
  session: WorkoutSession;
  plan: TemplatePlan;
  results: ExerciseResult[];
}

export interface HistorySession {
  session: WorkoutSession;
  results: ExerciseResult[];
}

export interface SetInput {
  setType: SetType;
  weightKg: number | null;
  durationSeconds: number;
  notes: string;
}

export interface ExerciseInput {
  name: string;
  muscleGroup: string;
  movementCategory: string;
  equipmentType: EquipmentType;
  weightIncrementKg: number;
}

export class FitnessService {
  constructor(
    readonly repositories: Repositories,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async listPlans(includeInactive = false): Promise<TemplatePlan[]> {
    const templates = await this.repositories.templates.list(includeInactive);
    return Promise.all(templates.map((template) => this.getPlan(template.id)));
  }

  async getPlan(templateId: string): Promise<TemplatePlan> {
    const template = await this.repositories.templates.get(templateId);
    if (!template) throw new Error('Der Trainingsplan wurde nicht gefunden.');
    const [slots, allExercises] = await Promise.all([
      this.repositories.templates.listSlots(templateId, true),
      this.repositories.exercises.list(true),
    ]);
    const exercisesById = new Map(
      allExercises.map((exercise) => [exercise.id, exercise]),
    );
    return {
      template,
      slots: slots
        .sort((left, right) => left.order - right.order)
        .map((slot) => ({
          slot,
          exercises: [slot.primaryExerciseId, ...slot.alternativeExerciseIds]
            .map((id) => exercisesById.get(id))
            .filter((exercise): exercise is Exercise => exercise !== undefined),
        })),
    };
  }

  async startWorkout(
    templateId: string,
    selections: Record<string, string> = {},
  ): Promise<WorkoutSession> {
    const plan = await this.getPlan(templateId);
    if (!plan.template.active) {
      throw new Error('Dieser Trainingsplan ist deaktiviert.');
    }
    const activeSlots = plan.slots.filter(({ slot }) => slot.active);
    for (const { slot, exercises } of activeSlots) {
      const selection = selections[slot.id] ?? slot.primaryExerciseId;
      if (!exercises.some(({ id, active }) => id === selection && active)) {
        throw new Error(`Bitte wähle eine aktive Übung für „${slot.label}“.`);
      }
    }
    const session: WorkoutSession = {
      id: this.createId(),
      workoutTemplateId: plan.template.id,
      templateNameSnapshot: plan.template.name,
      exerciseSelections: Object.fromEntries(
        activeSlots.map(({ slot }) => [
          slot.id,
          selections[slot.id] ?? slot.primaryExerciseId,
        ]),
      ),
      status: 'active',
      startedAt: this.now().toISOString(),
      completedAt: null,
      notes: '',
      setTimer: null,
    };
    await this.repositories.workouts.startSession(session);
    return session;
  }

  async selectExercise(
    session: WorkoutSession,
    slot: ExerciseSlot,
    exerciseId: string,
    useAsDefault: boolean,
  ): Promise<void> {
    await this.repositories.workouts.selectExercise(
      session.id,
      slot.id,
      exerciseId,
      useAsDefault,
    );
  }

  async startTimer(
    session: WorkoutSession,
    slot: ExerciseSlot,
    setType: SetType,
    weightKg: number | null,
    notes: string,
  ): Promise<void> {
    if (session.setTimer)
      throw new Error(
        'Es ist bereits ein Timer aktiv oder noch nicht gespeichert.',
      );
    await this.repositories.workouts.startTimer(session.id, {
      exerciseSlotId: slot.id,
      setType,
      startedAt: this.now().toISOString(),
      stoppedAt: null,
      durationSeconds: null,
      weightKg,
      notes: notes.trim(),
    });
  }

  async stopTimer(session: WorkoutSession): Promise<number> {
    const timer = session.setTimer;
    if (!timer || timer.stoppedAt !== null)
      throw new Error('Es läuft kein Timer.');
    const stoppedAt = this.now();
    const durationSeconds = Math.max(
      1,
      Math.min(
        86_400,
        Math.round((stoppedAt.getTime() - Date.parse(timer.startedAt)) / 1000),
      ),
    );
    await this.repositories.workouts.stopTimer(
      session.id,
      stoppedAt.toISOString(),
      durationSeconds,
    );
    return durationSeconds;
  }

  async getActiveWorkout(): Promise<ActiveWorkout | undefined> {
    const session = await this.repositories.workouts.getActiveSession();
    if (!session) return undefined;
    const [plan, results] = await Promise.all([
      this.getPlan(session.workoutTemplateId),
      this.repositories.workouts.listSessionResults(session.id),
    ]);
    return { session, plan, results };
  }

  async saveSet(
    session: WorkoutSession,
    slot: ExerciseSlot,
    input: SetInput,
  ): Promise<ExerciseResult> {
    const exerciseId = session.exerciseSelections[slot.id];
    const exercise = exerciseId
      ? await this.repositories.exercises.get(exerciseId)
      : undefined;
    if (!exercise) throw new Error('Die ausgewählte Übung existiert nicht.');
    const result: ExerciseResult = {
      id: this.createId(),
      workoutSessionId: session.id,
      exerciseSlotId: slot.id,
      exerciseId: exercise.id,
      exerciseNameSnapshot: exercise.name,
      setType: input.setType,
      weightKg:
        exercise.equipmentType === 'bodyweight'
          ? input.weightKg
          : input.weightKg,
      durationSeconds: input.durationSeconds,
      notes: input.notes.trim(),
      createdAt: this.now().toISOString(),
    };
    const issues = validateExerciseResult(result);
    if (result.weightKg === null && exercise.equipmentType !== 'bodyweight') {
      issues.push({
        path: 'exerciseResult.weightKg',
        code: 'invariant',
        message: 'Für diese Übung ist ein Gewicht erforderlich.',
      });
    }
    if (issues.length > 0) throw new DomainValidationError(issues);
    await this.repositories.workouts.saveResult(result);
    return result;
  }

  async completeWorkout(sessionId: string): Promise<void> {
    const session = await this.repositories.workouts.getSession(sessionId);
    if (!session || session.status !== 'active') {
      throw new Error('Das aktive Training wurde nicht gefunden.');
    }
    const [plan, results] = await Promise.all([
      this.getPlan(session.workoutTemplateId),
      this.repositories.workouts.listSessionResults(sessionId),
    ]);
    const completedSlots = new Set(
      results
        .filter(({ setType }) => setType === 'working')
        .map(({ exerciseSlotId }) => exerciseSlotId),
    );
    const missing = plan.slots.filter(
      ({ slot }) => slot.active && !completedSlots.has(slot.id),
    );
    if (missing.length > 0) {
      throw new Error('Für jede Übung ist ein Arbeitssatz erforderlich.');
    }
    await this.repositories.workouts.completeSession(
      sessionId,
      this.now().toISOString(),
    );
  }

  discardWorkout(sessionId: string): Promise<void> {
    return this.repositories.workouts.discardSession(sessionId);
  }

  async listHistory(): Promise<HistorySession[]> {
    const sessions = await this.repositories.workouts.listSessions();
    const completed = sessions.filter(({ status }) => status === 'completed');
    return Promise.all(
      completed.map(async (session) => ({
        session,
        results: await this.repositories.workouts.listSessionResults(
          session.id,
        ),
      })),
    );
  }

  async previousWorkingResults(exerciseId: string): Promise<ExerciseResult[]> {
    return (
      await this.repositories.history.listExerciseResults(exerciseId)
    ).filter(({ setType }) => setType === 'working');
  }

  async createExercise(input: ExerciseInput): Promise<Exercise> {
    const exercises = await this.repositories.exercises.list(true);
    if (
      exercises.some(
        ({ name }) => normalizeName(name) === normalizeName(input.name),
      )
    ) {
      throw new Error('Eine Übung mit diesem Namen existiert bereits.');
    }
    const timestamp = this.now().toISOString();
    const exercise: Exercise = {
      id: this.createId(),
      name: input.name.trim().replace(/\s+/g, ' '),
      muscleGroup: input.muscleGroup.trim(),
      movementCategory: input.movementCategory.trim(),
      equipmentType: input.equipmentType,
      weightIncrementKg: input.weightIncrementKg,
      image: null,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const issues = validateExercise(exercise);
    if (issues.length > 0) throw new DomainValidationError(issues);
    await this.repositories.exercises.put(exercise);
    return exercise;
  }

  async updateExerciseImage(
    exercise: Exercise,
    image: ExerciseImage | null,
  ): Promise<void> {
    const updated = {
      ...exercise,
      image,
      updatedAt: this.now().toISOString(),
    };
    const issues = validateExercise(updated);
    if (issues.length > 0) throw new DomainValidationError(issues);
    await this.repositories.exercises.put(updated);
  }

  async setExerciseActive(exercise: Exercise, active: boolean): Promise<void> {
    await this.repositories.exercises.put({
      ...exercise,
      active,
      updatedAt: this.now().toISOString(),
    });
  }

  async updateExercise(
    exercise: Exercise,
    updates: Pick<
      Exercise,
      'name' | 'muscleGroup' | 'weightIncrementKg' | 'active'
    >,
  ): Promise<void> {
    const exercises = await this.repositories.exercises.list(true);
    if (
      exercises.some(
        ({ id, name }) =>
          id !== exercise.id &&
          normalizeName(name) === normalizeName(updates.name),
      )
    ) {
      throw new Error('Eine Übung mit diesem Namen existiert bereits.');
    }
    const updated: Exercise = {
      ...exercise,
      ...updates,
      name: updates.name.trim().replace(/\s+/g, ' '),
      muscleGroup: updates.muscleGroup.trim(),
      updatedAt: this.now().toISOString(),
    };
    const issues = validateExercise(updated);
    if (issues.length > 0) throw new DomainValidationError(issues);
    await this.repositories.exercises.put(updated);
  }

  async updateTemplate(
    template: WorkoutTemplate,
    updates: Pick<WorkoutTemplate, 'name' | 'active'>,
  ): Promise<void> {
    const updated = {
      ...template,
      ...updates,
      name: updates.name.trim(),
      updatedAt: this.now().toISOString(),
    };
    const issues = validateWorkoutTemplate(updated);
    if (issues.length > 0) throw new DomainValidationError(issues);
    await this.repositories.templates.put(updated);
  }

  async updateSlot(slot: ExerciseSlot): Promise<void> {
    await this.repositories.templates.putSlot(slot);
  }

  async moveSlot(
    plan: TemplatePlan,
    slotId: string,
    direction: -1 | 1,
  ): Promise<void> {
    const index = plan.slots.findIndex(({ slot }) => slot.id === slotId);
    const otherIndex = index + direction;
    const current = plan.slots[index]?.slot;
    const other = plan.slots[otherIndex]?.slot;
    if (!current || !other) return;
    await this.repositories.templates.putSlots([
      { ...current, order: other.order },
      { ...other, order: current.order },
    ]);
  }
}
