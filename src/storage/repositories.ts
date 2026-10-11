import type {
  Exercise,
  ExerciseResult,
  ExerciseSlot,
  SetTimer,
  WorkoutSession,
  WorkoutTemplate,
} from '../domain/entities';
import type { FitnessDatabase, StorageMeta } from './database';
import { StorageError, toStorageError } from './errors';

export interface StorageSnapshot {
  exercises: Exercise[];
  workoutTemplates: WorkoutTemplate[];
  exerciseSlots: ExerciseSlot[];
  workoutSessions: WorkoutSession[];
  exerciseResults: ExerciseResult[];
  meta: StorageMeta[];
}

export interface ExerciseRepository {
  get(id: string): Promise<Exercise | undefined>;
  list(includeInactive?: boolean): Promise<Exercise[]>;
  put(exercise: Exercise): Promise<void>;
}

export interface WorkoutTemplateRepository {
  get(id: string): Promise<WorkoutTemplate | undefined>;
  list(includeInactive?: boolean): Promise<WorkoutTemplate[]>;
  listSlots(
    templateId: string,
    includeInactive?: boolean,
  ): Promise<ExerciseSlot[]>;
  put(template: WorkoutTemplate): Promise<void>;
  putSlot(slot: ExerciseSlot): Promise<void>;
  putSlots(slots: ExerciseSlot[]): Promise<void>;
}

export interface WorkoutRepository {
  getSession(id: string): Promise<WorkoutSession | undefined>;
  getActiveSession(): Promise<WorkoutSession | undefined>;
  listSessions(): Promise<WorkoutSession[]>;
  startSession(session: WorkoutSession): Promise<void>;
  selectExercise(
    sessionId: string,
    slotId: string,
    exerciseId: string,
    useAsDefault: boolean,
  ): Promise<void>;
  startTimer(sessionId: string, timer: SetTimer): Promise<void>;
  stopTimer(
    sessionId: string,
    stoppedAt: string,
    durationSeconds: number,
  ): Promise<void>;
  saveResult(result: ExerciseResult): Promise<void>;
  listSessionResults(sessionId: string): Promise<ExerciseResult[]>;
  completeSession(
    sessionId: string,
    completedAt: string,
    finalResult?: ExerciseResult,
  ): Promise<void>;
  discardSession(sessionId: string): Promise<void>;
}

export interface HistoryRepository {
  listExerciseResults(exerciseId: string): Promise<ExerciseResult[]>;
}

export interface SnapshotRepository {
  read(): Promise<StorageSnapshot>;
  replace(snapshot: StorageSnapshot): Promise<void>;
}

export interface Repositories {
  exercises: ExerciseRepository;
  templates: WorkoutTemplateRepository;
  workouts: WorkoutRepository;
  history: HistoryRepository;
  snapshots: SnapshotRepository;
}

export function createRepositories(database: FitnessDatabase): Repositories {
  return {
    exercises: new DexieExerciseRepository(database),
    templates: new DexieWorkoutTemplateRepository(database),
    workouts: new DexieWorkoutRepository(database),
    history: new DexieHistoryRepository(database),
    snapshots: new DexieSnapshotRepository(database),
  };
}

class DexieExerciseRepository implements ExerciseRepository {
  constructor(private readonly database: FitnessDatabase) {}

  get(id: string): Promise<Exercise | undefined> {
    return runStorageOperation(
      () => this.database.exercises.get(id),
      'Die Übung konnte nicht geladen werden.',
    );
  }

  list(includeInactive = false): Promise<Exercise[]> {
    return runStorageOperation(
      () =>
        includeInactive
          ? this.database.exercises.toArray()
          : this.database.exercises.filter(({ active }) => active).toArray(),
      'Die Übungen konnten nicht geladen werden.',
    );
  }

  async put(exercise: Exercise): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.exercises,
          this.database.exerciseSlots,
          this.database.workoutSessions,
          async () => {
            const referencedSlots = await this.database.exerciseSlots
              .filter(
                (slot) =>
                  slot.primaryExerciseId === exercise.id ||
                  slot.alternativeExerciseIds.includes(exercise.id),
              )
              .toArray();
            if (
              referencedSlots.some(
                ({ movementCategory }) =>
                  movementCategory !== exercise.movementCategory,
              )
            ) {
              throw new StorageError(
                'constraint',
                'Die Bewegungskategorie einer verwendeten Übung kann nicht geändert werden.',
              );
            }
            const activeSession = await this.database.workoutSessions
              .where('status')
              .equals('active')
              .first();
            if (
              !exercise.active &&
              activeSession &&
              Object.values(activeSession.exerciseSelections).includes(
                exercise.id,
              )
            ) {
              throw new StorageError(
                'constraint',
                'Eine im aktiven Training ausgewählte Übung kann nicht deaktiviert werden.',
              );
            }
            await this.database.exercises.put(exercise);
          },
        ),
      'Die Übung konnte nicht gespeichert werden.',
    );
  }
}

class DexieWorkoutTemplateRepository implements WorkoutTemplateRepository {
  constructor(private readonly database: FitnessDatabase) {}

  get(id: string): Promise<WorkoutTemplate | undefined> {
    return runStorageOperation(
      () => this.database.workoutTemplates.get(id),
      'Der Trainingsplan konnte nicht geladen werden.',
    );
  }

  list(includeInactive = false): Promise<WorkoutTemplate[]> {
    return runStorageOperation(
      () =>
        includeInactive
          ? this.database.workoutTemplates.toArray()
          : this.database.workoutTemplates
              .filter(({ active }) => active)
              .toArray(),
      'Die Trainingspläne konnten nicht geladen werden.',
    );
  }

  listSlots(
    templateId: string,
    includeInactive = false,
  ): Promise<ExerciseSlot[]> {
    return runStorageOperation(async () => {
      const slots = await this.database.exerciseSlots
        .where('templateId')
        .equals(templateId)
        .sortBy('order');
      return includeInactive ? slots : slots.filter((slot) => slot.active);
    }, 'Die Übungsplätze konnten nicht geladen werden.');
  }

  async put(template: WorkoutTemplate): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.workoutTemplates,
          this.database.workoutSessions,
          async () => {
            await rejectActiveTemplateChange(this.database, template.id);
            await this.database.workoutTemplates.put(template);
          },
        ),
      'Der Trainingsplan konnte nicht gespeichert werden.',
    );
  }

  async putSlot(slot: ExerciseSlot): Promise<void> {
    await this.putSlots([slot]);
  }

  async putSlots(slots: ExerciseSlot[]): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.exerciseSlots,
          this.database.workoutTemplates,
          this.database.exercises,
          this.database.workoutSessions,
          async () => {
            for (const slot of slots) {
              const existing = await this.database.exerciseSlots.get(slot.id);
              if (existing && existing.templateId !== slot.templateId) {
                throw new StorageError(
                  'constraint',
                  'Die Planzuordnung eines Übungsplatzes kann nicht geändert werden.',
                );
              }
              await rejectActiveTemplateChange(this.database, slot.templateId);
              await assertSlotReferences(this.database, slot);
            }
            await this.database.exerciseSlots.bulkPut(slots);
          },
        ),
      'Die Übungsplätze konnten nicht gespeichert werden.',
    );
  }
}

class DexieWorkoutRepository implements WorkoutRepository {
  constructor(private readonly database: FitnessDatabase) {}

  getSession(id: string): Promise<WorkoutSession | undefined> {
    return runStorageOperation(
      () => this.database.workoutSessions.get(id),
      'Das Training konnte nicht geladen werden.',
    );
  }

  getActiveSession(): Promise<WorkoutSession | undefined> {
    return runStorageOperation(
      () =>
        this.database.workoutSessions.where('status').equals('active').first(),
      'Das aktive Training konnte nicht geladen werden.',
    );
  }

  listSessions(): Promise<WorkoutSession[]> {
    return runStorageOperation(
      () =>
        this.database.workoutSessions.orderBy('startedAt').reverse().toArray(),
      'Der Trainingsverlauf konnte nicht geladen werden.',
    );
  }

  async startSession(session: WorkoutSession): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.workoutSessions,
          this.database.workoutTemplates,
          this.database.exerciseSlots,
          this.database.exercises,
          async () => {
            if (session.status !== 'active' || session.completedAt !== null) {
              throw new StorageError(
                'integrity',
                'Ein neues Training muss aktiv und unvollständig sein.',
              );
            }
            if (
              await this.database.workoutSessions
                .where('status')
                .equals('active')
                .count()
            ) {
              throw new StorageError(
                'constraint',
                'Es ist bereits ein Training aktiv.',
              );
            }
            const template = await this.database.workoutTemplates.get(
              session.workoutTemplateId,
            );
            if (!template || !template.active) {
              throw new StorageError(
                'integrity',
                'Der Trainingsplan des Trainings ist nicht verfügbar.',
              );
            }
            await assertSessionSelections(this.database, session);
            await this.database.workoutSessions.add(session);
          },
        ),
      'Das Training konnte nicht gestartet werden.',
    );
  }

  async saveResult(result: ExerciseResult): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.exerciseResults,
          this.database.workoutSessions,
          this.database.exerciseSlots,
          this.database.exercises,
          async () => saveResultInTransaction(this.database, result),
        ),
      'Das Ergebnis konnte nicht gespeichert werden.',
    );
  }

  async selectExercise(
    sessionId: string,
    slotId: string,
    exerciseId: string,
    useAsDefault: boolean,
  ): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.workoutSessions,
          this.database.exerciseSlots,
          this.database.exercises,
          this.database.exerciseResults,
          async () => {
            const [session, slot, exercise] = await Promise.all([
              this.database.workoutSessions.get(sessionId),
              this.database.exerciseSlots.get(slotId),
              this.database.exercises.get(exerciseId),
            ]);
            if (!session || session.status !== 'active' || !slot || !exercise) {
              throw new StorageError(
                'integrity',
                'Die Übungsauswahl ist nicht verfügbar.',
              );
            }
            if (
              slot.templateId !== session.workoutTemplateId ||
              !exercise.active ||
              ![
                slot.primaryExerciseId,
                ...slot.alternativeExerciseIds,
              ].includes(exerciseId)
            ) {
              throw new StorageError(
                'constraint',
                'Diese Übung gehört nicht zum aktuellen Übungsplatz.',
              );
            }
            if (
              await this.database.exerciseResults
                .where('workoutSessionId')
                .equals(sessionId)
                .filter((result) => result.exerciseSlotId === slotId)
                .count()
            ) {
              throw new StorageError(
                'constraint',
                'Nach dem ersten gespeicherten Satz kann die Übung nicht mehr gewechselt werden.',
              );
            }
            if (session.setTimer?.exerciseSlotId === slotId) {
              throw new StorageError(
                'constraint',
                'Während eines Timers kann die Übung nicht gewechselt werden.',
              );
            }
            await this.database.workoutSessions.update(sessionId, {
              exerciseSelections: {
                ...session.exerciseSelections,
                [slotId]: exerciseId,
              },
            });
            if (useAsDefault && slot.primaryExerciseId !== exerciseId) {
              await this.database.exerciseSlots.update(slotId, {
                primaryExerciseId: exerciseId,
                alternativeExerciseIds: [
                  slot.primaryExerciseId,
                  ...slot.alternativeExerciseIds.filter(
                    (id) => id !== exerciseId,
                  ),
                ],
              });
            }
          },
        ),
      'Die Übungsauswahl konnte nicht gespeichert werden.',
    );
  }

  async startTimer(sessionId: string, timer: SetTimer): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.workoutSessions,
          this.database.exerciseResults,
          async () => {
            const session = await this.database.workoutSessions.get(sessionId);
            if (!session || session.status !== 'active') {
              throw new StorageError(
                'integrity',
                'Das Training ist nicht aktiv.',
              );
            }
            if (session.setTimer) {
              throw new StorageError(
                'constraint',
                'Es ist bereits ein Timer aktiv oder noch nicht gespeichert.',
              );
            }
            if (!session.exerciseSelections[timer.exerciseSlotId]) {
              throw new StorageError(
                'integrity',
                'Der Timer gehört zu keinem ausgewählten Übungsplatz.',
              );
            }
            const existing = await this.database.exerciseResults
              .where('workoutSessionId')
              .equals(sessionId)
              .filter(
                (result) =>
                  result.exerciseSlotId === timer.exerciseSlotId &&
                  result.setType === timer.setType,
              )
              .count();
            if (existing) {
              throw new StorageError(
                'constraint',
                'Dieser Satz wurde bereits gespeichert.',
              );
            }
            await this.database.workoutSessions.update(sessionId, {
              setTimer: timer,
            });
          },
        ),
      'Der Timer konnte nicht gestartet werden.',
    );
  }

  async stopTimer(
    sessionId: string,
    stoppedAt: string,
    durationSeconds: number,
  ): Promise<void> {
    await runStorageOperation(async () => {
      const session = await this.database.workoutSessions.get(sessionId);
      if (!session?.setTimer || session.setTimer.stoppedAt !== null) {
        throw new StorageError('constraint', 'Es läuft kein Timer.');
      }
      await this.database.workoutSessions.update(sessionId, {
        setTimer: { ...session.setTimer, stoppedAt, durationSeconds },
      });
    }, 'Der Timer konnte nicht gestoppt werden.');
  }

  listSessionResults(sessionId: string): Promise<ExerciseResult[]> {
    return runStorageOperation(
      () =>
        this.database.exerciseResults
          .where('workoutSessionId')
          .equals(sessionId)
          .sortBy('createdAt'),
      'Die Ergebnisse konnten nicht geladen werden.',
    );
  }

  async completeSession(
    sessionId: string,
    completedAt: string,
    finalResult?: ExerciseResult,
  ): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.workoutSessions,
          this.database.exerciseResults,
          this.database.exerciseSlots,
          this.database.exercises,
          async () => {
            const session = await this.database.workoutSessions.get(sessionId);
            if (!session) {
              throw new StorageError(
                'not-found',
                'Das Training existiert nicht.',
              );
            }
            if (session.status !== 'active') {
              throw new StorageError(
                'constraint',
                'Nur ein aktives Training kann abgeschlossen werden.',
              );
            }
            if (finalResult) {
              if (finalResult.workoutSessionId !== sessionId) {
                throw new StorageError(
                  'integrity',
                  'Das letzte Ergebnis gehört nicht zu diesem Training.',
                );
              }
              await saveResultInTransaction(this.database, finalResult);
            }
            await this.database.workoutSessions.update(sessionId, {
              status: 'completed',
              completedAt,
            });
          },
        ),
      'Das Training konnte nicht abgeschlossen werden.',
    );
  }

  async discardSession(sessionId: string): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          this.database.workoutSessions,
          this.database.exerciseResults,
          async () => {
            const session = await this.database.workoutSessions.get(sessionId);
            if (!session) {
              throw new StorageError(
                'not-found',
                'Das Training existiert nicht.',
              );
            }
            if (session.status !== 'active') {
              throw new StorageError(
                'constraint',
                'Nur ein aktives Training kann verworfen werden.',
              );
            }
            await this.database.exerciseResults
              .where('workoutSessionId')
              .equals(sessionId)
              .delete();
            await this.database.workoutSessions.delete(sessionId);
          },
        ),
      'Das Training konnte nicht verworfen werden.',
    );
  }
}

class DexieHistoryRepository implements HistoryRepository {
  constructor(private readonly database: FitnessDatabase) {}

  listExerciseResults(exerciseId: string): Promise<ExerciseResult[]> {
    return runStorageOperation(
      () =>
        this.database.exerciseResults
          .where('[exerciseId+createdAt]')
          .between([exerciseId, ''], [exerciseId, '\uffff'])
          .reverse()
          .toArray(),
      'Der Übungsverlauf konnte nicht geladen werden.',
    );
  }
}

class DexieSnapshotRepository implements SnapshotRepository {
  constructor(private readonly database: FitnessDatabase) {}

  read(): Promise<StorageSnapshot> {
    return runStorageOperation(
      () =>
        this.database.transaction(
          'r',
          [
            this.database.exercises,
            this.database.workoutTemplates,
            this.database.exerciseSlots,
            this.database.workoutSessions,
            this.database.exerciseResults,
            this.database.meta,
          ],
          async () => ({
            exercises: await this.database.exercises.toArray(),
            workoutTemplates: await this.database.workoutTemplates.toArray(),
            exerciseSlots: await this.database.exerciseSlots.toArray(),
            workoutSessions: await this.database.workoutSessions.toArray(),
            exerciseResults: await this.database.exerciseResults.toArray(),
            meta: await this.database.meta.toArray(),
          }),
        ),
      'Die Daten konnten nicht gelesen werden.',
    );
  }

  async replace(snapshot: StorageSnapshot): Promise<void> {
    await runStorageOperation(
      () =>
        this.database.transaction(
          'rw',
          [
            this.database.exercises,
            this.database.workoutTemplates,
            this.database.exerciseSlots,
            this.database.workoutSessions,
            this.database.exerciseResults,
            this.database.meta,
          ],
          async () => {
            assertSnapshotIntegrity(snapshot);
            await this.database.exerciseResults.clear();
            await this.database.workoutSessions.clear();
            await this.database.exerciseSlots.clear();
            await this.database.workoutTemplates.clear();
            await this.database.exercises.clear();
            await this.database.meta.clear();
            await this.database.exercises.bulkAdd(snapshot.exercises);
            await this.database.workoutTemplates.bulkAdd(
              snapshot.workoutTemplates,
            );
            await this.database.exerciseSlots.bulkAdd(snapshot.exerciseSlots);
            await this.database.workoutSessions.bulkAdd(
              snapshot.workoutSessions,
            );
            await this.database.exerciseResults.bulkAdd(
              snapshot.exerciseResults,
            );
            await this.database.meta.bulkAdd(snapshot.meta);
          },
        ),
      'Die Daten konnten nicht ersetzt werden.',
    );
  }
}

async function rejectActiveTemplateChange(
  database: FitnessDatabase,
  templateId: string,
): Promise<void> {
  const activeSession = await database.workoutSessions
    .where('status')
    .equals('active')
    .first();
  if (activeSession?.workoutTemplateId === templateId) {
    throw new StorageError(
      'constraint',
      'Der Plan eines aktiven Trainings kann nicht geändert werden.',
    );
  }
}

async function assertSlotReferences(
  database: FitnessDatabase,
  slot: ExerciseSlot,
): Promise<void> {
  if (!(await database.workoutTemplates.get(slot.templateId))) {
    throw new StorageError('integrity', 'Der Trainingsplan existiert nicht.');
  }
  const exerciseIds = [slot.primaryExerciseId, ...slot.alternativeExerciseIds];
  const exercises = await database.exercises.bulkGet(exerciseIds);
  if (exercises.some((exercise) => !exercise)) {
    throw new StorageError(
      'integrity',
      'Mindestens eine Übung existiert nicht.',
    );
  }
  if (
    exercises.some(
      (exercise) => exercise?.movementCategory !== slot.movementCategory,
    )
  ) {
    throw new StorageError(
      'integrity',
      'Alle Übungen müssen zur Bewegungskategorie des Übungsplatzes gehören.',
    );
  }
}

async function assertSessionSelections(
  database: FitnessDatabase,
  session: WorkoutSession,
): Promise<void> {
  const slots = await database.exerciseSlots
    .where('templateId')
    .equals(session.workoutTemplateId)
    .toArray();
  const activeSlots = slots.filter(({ active }) => active);
  const activeSlotIds = new Set(activeSlots.map(({ id }) => id));
  if (
    Object.keys(session.exerciseSelections).some(
      (slotId) => !activeSlotIds.has(slotId),
    ) ||
    activeSlots.some(({ id }) => session.exerciseSelections[id] === undefined)
  ) {
    throw new StorageError(
      'integrity',
      'Die Übungsauswahl passt nicht zum Trainingsplan.',
    );
  }

  for (const slot of activeSlots) {
    const exerciseId = session.exerciseSelections[slot.id];
    const exercise = exerciseId
      ? await database.exercises.get(exerciseId)
      : undefined;
    if (
      !exercise ||
      !exercise.active ||
      (exercise.id !== slot.primaryExerciseId &&
        !slot.alternativeExerciseIds.includes(exercise.id))
    ) {
      throw new StorageError(
        'integrity',
        'Eine ausgewählte Übung ist nicht verfügbar.',
      );
    }
  }
}

async function saveResultInTransaction(
  database: FitnessDatabase,
  result: ExerciseResult,
): Promise<void> {
  const [session, slot, exercise] = await Promise.all([
    database.workoutSessions.get(result.workoutSessionId),
    database.exerciseSlots.get(result.exerciseSlotId),
    database.exercises.get(result.exerciseId),
  ]);
  if (!session || session.status !== 'active') {
    throw new StorageError('integrity', 'Das Training ist nicht aktiv.');
  }
  if (!slot || slot.templateId !== session.workoutTemplateId) {
    throw new StorageError(
      'integrity',
      'Der Übungsplatz gehört nicht zum Trainingsplan.',
    );
  }
  if (!exercise) {
    throw new StorageError('integrity', 'Die Übung existiert nicht.');
  }
  if (session.exerciseSelections[result.exerciseSlotId] !== result.exerciseId) {
    throw new StorageError(
      'integrity',
      'Das Ergebnis gehört nicht zur ausgewählten Übung.',
    );
  }
  if (
    exercise.id !== slot.primaryExerciseId &&
    !slot.alternativeExerciseIds.includes(exercise.id)
  ) {
    throw new StorageError(
      'integrity',
      'Die Übung ist für diesen Übungsplatz nicht konfiguriert.',
    );
  }
  const existing = await database.exerciseResults
    .where('workoutSessionId')
    .equals(result.workoutSessionId)
    .filter(
      (candidate) =>
        candidate.exerciseSlotId === result.exerciseSlotId &&
        candidate.setType === result.setType &&
        candidate.id !== result.id,
    )
    .first();
  if (existing) {
    throw new StorageError(
      'constraint',
      'Für diesen Übungsplatz wurde dieser Satz bereits gespeichert.',
    );
  }
  await database.exerciseResults.put(result);
  if (
    session.setTimer?.exerciseSlotId === result.exerciseSlotId &&
    session.setTimer.setType === result.setType
  ) {
    await database.workoutSessions.update(session.id, { setTimer: null });
  }
}

function assertSnapshotIntegrity(snapshot: StorageSnapshot): void {
  assertUnique(
    snapshot.exercises.map(({ id }) => id),
    'Übungs-IDs',
  );
  assertUnique(
    snapshot.workoutTemplates.map(({ id }) => id),
    'Plan-IDs',
  );
  assertUnique(
    snapshot.exerciseSlots.map(({ id }) => id),
    'Übungsplatz-IDs',
  );
  assertUnique(
    snapshot.workoutSessions.map(({ id }) => id),
    'Trainings-IDs',
  );
  assertUnique(
    snapshot.exerciseResults.map(({ id }) => id),
    'Ergebnis-IDs',
  );
  assertUnique(
    snapshot.meta.map(({ key }) => key),
    'Metadaten-Schlüssel',
  );

  const exerciseIds = new Set(snapshot.exercises.map(({ id }) => id));
  const exerciseById = new Map(
    snapshot.exercises.map((exercise) => [exercise.id, exercise]),
  );
  const templateIds = new Set(snapshot.workoutTemplates.map(({ id }) => id));
  const slotById = new Map(
    snapshot.exerciseSlots.map((slot) => [slot.id, slot]),
  );
  const sessionById = new Map(
    snapshot.workoutSessions.map((session) => [session.id, session]),
  );

  for (const slot of snapshot.exerciseSlots) {
    if (
      !templateIds.has(slot.templateId) ||
      !exerciseIds.has(slot.primaryExerciseId) ||
      slot.alternativeExerciseIds.some((id) => !exerciseIds.has(id)) ||
      [slot.primaryExerciseId, ...slot.alternativeExerciseIds].some(
        (id) =>
          exerciseById.get(id)?.movementCategory !== slot.movementCategory,
      )
    ) {
      throw new StorageError(
        'integrity',
        'Der Datenstand enthält ungültige Übungsplatz-Verweise.',
      );
    }
  }

  const activeSessions = snapshot.workoutSessions.filter(
    ({ status }) => status === 'active',
  );
  if (activeSessions.length > 1) {
    throw new StorageError(
      'integrity',
      'Der Datenstand enthält mehrere aktive Trainings.',
    );
  }
  for (const session of snapshot.workoutSessions) {
    if (
      !templateIds.has(session.workoutTemplateId) ||
      (session.status === 'active' && session.completedAt !== null) ||
      (session.status === 'completed' && session.completedAt === null)
    ) {
      throw new StorageError(
        'integrity',
        'Der Datenstand enthält ein ungültiges Training.',
      );
    }
    const templateSlots = snapshot.exerciseSlots.filter(
      (slot) => slot.templateId === session.workoutTemplateId,
    );
    const selectedEntries = Object.entries(session.exerciseSelections);
    const hasInvalidReference = selectedEntries.some(
      ([slotId, exerciseId]) =>
        !templateSlots.some(({ id }) => id === slotId) ||
        !exerciseIds.has(exerciseId),
    );
    const activeSlots = templateSlots.filter(({ active }) => active);
    const hasInvalidActiveSelection =
      session.status === 'active' &&
      (selectedEntries.some(
        ([slotId]) => !activeSlots.some(({ id }) => id === slotId),
      ) ||
        activeSlots.some((slot) => {
          const selectedId = session.exerciseSelections[slot.id];
          return (
            !selectedId ||
            (selectedId !== slot.primaryExerciseId &&
              !slot.alternativeExerciseIds.includes(selectedId))
          );
        }));
    if (hasInvalidReference || hasInvalidActiveSelection) {
      throw new StorageError(
        'integrity',
        'Der Datenstand enthält eine ungültige Übungsauswahl.',
      );
    }
  }

  const resultKeys = new Set<string>();
  for (const result of snapshot.exerciseResults) {
    const session = sessionById.get(result.workoutSessionId);
    const slot = slotById.get(result.exerciseSlotId);
    if (
      !session ||
      !slot ||
      !exerciseIds.has(result.exerciseId) ||
      slot.templateId !== session.workoutTemplateId ||
      session.exerciseSelections[result.exerciseSlotId] !== result.exerciseId
    ) {
      throw new StorageError(
        'integrity',
        'Der Datenstand enthält ungültige Ergebnis-Verweise.',
      );
    }
    const key = `${result.workoutSessionId}\u0000${result.exerciseSlotId}\u0000${result.setType}`;
    if (resultKeys.has(key)) {
      throw new StorageError(
        'integrity',
        'Der Datenstand enthält doppelte Sätze.',
      );
    }
    resultKeys.add(key);
  }
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new StorageError('integrity', `${label} sind nicht eindeutig.`);
  }
}

async function runStorageOperation<T>(
  operation: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toStorageError(error, message);
  }
}
