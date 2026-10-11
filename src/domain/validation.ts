import type { DomainData, EquipmentType, Exercise, SetType } from './entities';

export type ValidationCode =
  | 'invalid-type'
  | 'invalid-value'
  | 'duplicate-id'
  | 'duplicate-name'
  | 'dangling-reference'
  | 'invariant';

export interface ValidationIssue {
  path: string;
  code: ValidationCode;
  message: string;
}

export class DomainValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'DomainValidationError';
    this.issues = issues;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const EQUIPMENT_TYPES: readonly EquipmentType[] = [
  'bodyweight',
  'free-weight',
  'machine',
  'cable',
];
const SET_TYPES: readonly SetType[] = ['warmup', 'working'];
export const MAX_WEIGHT_KG = 100_000;
export const MAX_DURATION_SECONDS = 86_400;
export const MAX_WEIGHT_INCREMENT_KG = 1_000;
export const MAX_EXERCISE_IMAGE_DATA_URL_LENGTH = 2_000_000;
export const DOMAIN_COLLECTION_LIMITS = {
  exercises: 500,
  workoutTemplates: 50,
  exerciseSlots: 500,
  workoutSessions: 10_000,
  exerciseResults: 100_000,
} as const;

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isIsoUtcDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC_PATTERN.test(value)) return false;
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) return false;
  const canonicalValue = value.includes('.')
    ? value
    : value.replace('Z', '.000Z');
  return new Date(milliseconds).toISOString() === canonicalValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(
  path: string,
  code: ValidationCode,
  message: string,
): ValidationIssue {
  return { path, code, message };
}

function stringIssues(
  value: unknown,
  path: string,
  maximumLength: number,
  allowEmpty = false,
): ValidationIssue[] {
  if (typeof value !== 'string') {
    return [issue(path, 'invalid-type', 'Muss Text sein.')];
  }
  if (!allowEmpty && value.trim().length === 0) {
    return [issue(path, 'invalid-value', 'Darf nicht leer sein.')];
  }
  if (value.length > maximumLength) {
    return [
      issue(
        path,
        'invalid-value',
        `Darf höchstens ${maximumLength} Zeichen enthalten.`,
      ),
    ];
  }
  return [];
}

function idIssues(value: unknown, path: string): ValidationIssue[] {
  return isUuid(value)
    ? []
    : [issue(path, 'invalid-value', 'Muss eine gültige UUID sein.')];
}

function dateIssues(value: unknown, path: string): ValidationIssue[] {
  return isIsoUtcDate(value)
    ? []
    : [
        issue(
          path,
          'invalid-value',
          'Muss ein gültiger ISO-8601-UTC-Zeitpunkt sein.',
        ),
      ];
}

function booleanIssues(value: unknown, path: string): ValidationIssue[] {
  return typeof value === 'boolean'
    ? []
    : [issue(path, 'invalid-type', 'Muss ein Wahrheitswert sein.')];
}

export function validateExercise(
  value: unknown,
  path = 'exercise',
): ValidationIssue[] {
  if (!isRecord(value)) {
    return [issue(path, 'invalid-type', 'Muss ein Objekt sein.')];
  }
  const issues = [
    ...idIssues(value.id, `${path}.id`),
    ...stringIssues(value.name, `${path}.name`, 120),
    ...stringIssues(value.muscleGroup, `${path}.muscleGroup`, 80),
    ...stringIssues(value.movementCategory, `${path}.movementCategory`, 80),
    ...booleanIssues(value.active, `${path}.active`),
    ...dateIssues(value.createdAt, `${path}.createdAt`),
    ...dateIssues(value.updatedAt, `${path}.updatedAt`),
  ];
  if (!EQUIPMENT_TYPES.includes(value.equipmentType as EquipmentType)) {
    issues.push(
      issue(`${path}.equipmentType`, 'invalid-value', 'Unbekannte Geräteart.'),
    );
  }
  if (
    typeof value.weightIncrementKg !== 'number' ||
    !Number.isFinite(value.weightIncrementKg) ||
    value.weightIncrementKg <= 0 ||
    value.weightIncrementKg > MAX_WEIGHT_INCREMENT_KG
  ) {
    issues.push(
      issue(
        `${path}.weightIncrementKg`,
        'invalid-value',
        `Muss größer als null und höchstens ${MAX_WEIGHT_INCREMENT_KG} kg sein.`,
      ),
    );
  }
  if (value.image !== undefined && value.image !== null) {
    if (!isRecord(value.image)) {
      issues.push(
        issue(`${path}.image`, 'invalid-type', 'Muss ein Bildobjekt sein.'),
      );
    } else {
      for (const key of ['dataUrl', 'thumbnailDataUrl'] as const) {
        const imageValue = value.image[key];
        if (
          typeof imageValue !== 'string' ||
          !/^data:image\/(?:jpeg|webp);base64,/.test(imageValue) ||
          imageValue.length > MAX_EXERCISE_IMAGE_DATA_URL_LENGTH
        ) {
          issues.push(
            issue(
              `${path}.image.${key}`,
              'invalid-value',
              'Muss ein lokal erzeugtes JPEG- oder WebP-Bild in zulässiger Größe sein.',
            ),
          );
        }
      }
      issues.push(
        ...dateIssues(value.image.updatedAt, `${path}.image.updatedAt`),
      );
    }
  }
  if (
    isIsoUtcDate(value.createdAt) &&
    isIsoUtcDate(value.updatedAt) &&
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  ) {
    issues.push(
      issue(
        `${path}.updatedAt`,
        'invariant',
        'Darf nicht vor createdAt liegen.',
      ),
    );
  }
  return issues;
}

export function validateWorkoutTemplate(
  value: unknown,
  path = 'workoutTemplate',
): ValidationIssue[] {
  if (!isRecord(value)) {
    return [issue(path, 'invalid-type', 'Muss ein Objekt sein.')];
  }
  return [
    ...idIssues(value.id, `${path}.id`),
    ...stringIssues(value.name, `${path}.name`, 120),
    ...booleanIssues(value.active, `${path}.active`),
    ...dateIssues(value.createdAt, `${path}.createdAt`),
    ...dateIssues(value.updatedAt, `${path}.updatedAt`),
  ];
}

export function validateExerciseSlot(
  value: unknown,
  path = 'exerciseSlot',
): ValidationIssue[] {
  if (!isRecord(value)) {
    return [issue(path, 'invalid-type', 'Muss ein Objekt sein.')];
  }
  const issues = [
    ...idIssues(value.id, `${path}.id`),
    ...idIssues(value.templateId, `${path}.templateId`),
    ...stringIssues(value.movementCategory, `${path}.movementCategory`, 80),
    ...stringIssues(value.label, `${path}.label`, 120),
    ...idIssues(value.primaryExerciseId, `${path}.primaryExerciseId`),
    ...booleanIssues(value.active, `${path}.active`),
  ];
  if (!Number.isInteger(value.order) || Number(value.order) <= 0) {
    issues.push(
      issue(
        `${path}.order`,
        'invalid-value',
        'Muss eine positive ganze Zahl sein.',
      ),
    );
  }
  if (!Array.isArray(value.alternativeExerciseIds)) {
    issues.push(
      issue(
        `${path}.alternativeExerciseIds`,
        'invalid-type',
        'Muss eine Liste sein.',
      ),
    );
  } else {
    value.alternativeExerciseIds.forEach((id, index) => {
      issues.push(...idIssues(id, `${path}.alternativeExerciseIds[${index}]`));
    });
    const ids = value.alternativeExerciseIds.filter(isUuid);
    if (new Set(ids).size !== ids.length) {
      issues.push(
        issue(
          `${path}.alternativeExerciseIds`,
          'invariant',
          'Darf keine Übung doppelt enthalten.',
        ),
      );
    }
    if (
      typeof value.primaryExerciseId === 'string' &&
      ids.includes(value.primaryExerciseId)
    ) {
      issues.push(
        issue(
          `${path}.alternativeExerciseIds`,
          'invariant',
          'Die Hauptübung darf nicht zusätzlich eine Alternative sein.',
        ),
      );
    }
  }
  return issues;
}

export function validateWorkoutSession(
  value: unknown,
  path = 'workoutSession',
): ValidationIssue[] {
  if (!isRecord(value)) {
    return [issue(path, 'invalid-type', 'Muss ein Objekt sein.')];
  }
  const issues = [
    ...idIssues(value.id, `${path}.id`),
    ...idIssues(value.workoutTemplateId, `${path}.workoutTemplateId`),
    ...stringIssues(
      value.templateNameSnapshot,
      `${path}.templateNameSnapshot`,
      120,
    ),
    ...dateIssues(value.startedAt, `${path}.startedAt`),
    ...stringIssues(value.notes, `${path}.notes`, 2000, true),
  ];
  if (!isRecord(value.exerciseSelections)) {
    issues.push(
      issue(
        `${path}.exerciseSelections`,
        'invalid-type',
        'Muss eine Zuordnung von Slots zu Übungen sein.',
      ),
    );
  } else {
    for (const [slotId, exerciseId] of Object.entries(
      value.exerciseSelections,
    )) {
      issues.push(...idIssues(slotId, `${path}.exerciseSelections.${slotId}`));
      issues.push(
        ...idIssues(exerciseId, `${path}.exerciseSelections.${slotId}`),
      );
    }
  }
  if (value.setTimer !== undefined && value.setTimer !== null) {
    if (!isRecord(value.setTimer)) {
      issues.push(
        issue(`${path}.setTimer`, 'invalid-type', 'Muss ein Timerobjekt sein.'),
      );
    } else {
      issues.push(
        ...idIssues(
          value.setTimer.exerciseSlotId,
          `${path}.setTimer.exerciseSlotId`,
        ),
        ...dateIssues(value.setTimer.startedAt, `${path}.setTimer.startedAt`),
        ...stringIssues(
          value.setTimer.notes,
          `${path}.setTimer.notes`,
          2000,
          true,
        ),
      );
      if (
        value.setTimer.weightKg !== null &&
        (typeof value.setTimer.weightKg !== 'number' ||
          !Number.isFinite(value.setTimer.weightKg) ||
          value.setTimer.weightKg < 0 ||
          value.setTimer.weightKg > MAX_WEIGHT_KG)
      ) {
        issues.push(
          issue(
            `${path}.setTimer.weightKg`,
            'invalid-value',
            'Das Gewicht des Timerentwurfs ist ungültig.',
          ),
        );
      }
      if (!SET_TYPES.includes(value.setTimer.setType as SetType)) {
        issues.push(
          issue(
            `${path}.setTimer.setType`,
            'invalid-value',
            'Unbekannte Satzart.',
          ),
        );
      }
      if (value.setTimer.stoppedAt === null) {
        if (value.setTimer.durationSeconds !== null) {
          issues.push(
            issue(
              `${path}.setTimer.durationSeconds`,
              'invariant',
              'Ein laufender Timer hat noch keine Dauer.',
            ),
          );
        }
      } else {
        issues.push(
          ...dateIssues(value.setTimer.stoppedAt, `${path}.setTimer.stoppedAt`),
        );
        if (
          !Number.isInteger(value.setTimer.durationSeconds) ||
          Number(value.setTimer.durationSeconds) <= 0 ||
          Number(value.setTimer.durationSeconds) > MAX_DURATION_SECONDS
        ) {
          issues.push(
            issue(
              `${path}.setTimer.durationSeconds`,
              'invalid-value',
              'Die gemessene Dauer ist ungültig.',
            ),
          );
        }
      }
    }
  }
  if (value.status !== 'active' && value.status !== 'completed') {
    issues.push(
      issue(`${path}.status`, 'invalid-value', 'Unbekannter Sitzungsstatus.'),
    );
  }
  if (value.status === 'active' && value.completedAt !== null) {
    issues.push(
      issue(
        `${path}.completedAt`,
        'invariant',
        'Eine aktive Einheit darf kein Abschlussdatum haben.',
      ),
    );
  }
  if (value.status === 'completed') {
    issues.push(...dateIssues(value.completedAt, `${path}.completedAt`));
    if (
      isIsoUtcDate(value.startedAt) &&
      isIsoUtcDate(value.completedAt) &&
      Date.parse(value.completedAt) < Date.parse(value.startedAt)
    ) {
      issues.push(
        issue(
          `${path}.completedAt`,
          'invariant',
          'Darf nicht vor dem Beginn liegen.',
        ),
      );
    }
    if (value.setTimer !== undefined && value.setTimer !== null) {
      issues.push(
        issue(
          `${path}.setTimer`,
          'invariant',
          'Ein abgeschlossenes Training darf keinen Timerentwurf enthalten.',
        ),
      );
    }
  }
  return issues;
}

export function validateExerciseResult(
  value: unknown,
  path = 'exerciseResult',
): ValidationIssue[] {
  if (!isRecord(value)) {
    return [issue(path, 'invalid-type', 'Muss ein Objekt sein.')];
  }
  const issues = [
    ...idIssues(value.id, `${path}.id`),
    ...idIssues(value.workoutSessionId, `${path}.workoutSessionId`),
    ...idIssues(value.exerciseSlotId, `${path}.exerciseSlotId`),
    ...idIssues(value.exerciseId, `${path}.exerciseId`),
    ...stringIssues(
      value.exerciseNameSnapshot,
      `${path}.exerciseNameSnapshot`,
      120,
    ),
    ...stringIssues(value.notes, `${path}.notes`, 2000, true),
    ...dateIssues(value.createdAt, `${path}.createdAt`),
  ];
  if (!SET_TYPES.includes(value.setType as SetType)) {
    issues.push(
      issue(`${path}.setType`, 'invalid-value', 'Unbekannte Satzart.'),
    );
  }
  if (
    value.weightKg !== null &&
    (typeof value.weightKg !== 'number' ||
      !Number.isFinite(value.weightKg) ||
      value.weightKg < 0 ||
      value.weightKg > MAX_WEIGHT_KG)
  ) {
    issues.push(
      issue(
        `${path}.weightKg`,
        'invalid-value',
        `Muss null oder eine Zahl zwischen 0 und ${MAX_WEIGHT_KG} kg sein.`,
      ),
    );
  }
  if (
    !Number.isInteger(value.durationSeconds) ||
    Number(value.durationSeconds) <= 0 ||
    Number(value.durationSeconds) > MAX_DURATION_SECONDS
  ) {
    issues.push(
      issue(
        `${path}.durationSeconds`,
        'invalid-value',
        `Muss eine ganze Sekundenzahl zwischen 1 und ${MAX_DURATION_SECONDS} sein.`,
      ),
    );
  }
  return issues;
}

type EntityWithId = { id: string };

function duplicateIdIssues<T extends EntityWithId>(
  values: readonly T[],
  path: string,
): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      issues.push(
        issue(`${path}[${index}].id`, 'duplicate-id', 'ID kommt mehrfach vor.'),
      );
    }
    seen.add(value.id);
  });
  return issues;
}

export function validateUniqueExerciseNames(
  exercises: readonly Pick<Exercise, 'name'>[],
  path = 'exercises',
): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  exercises.forEach((exercise, index) => {
    const normalized = normalizeName(exercise.name);
    if (seen.has(normalized)) {
      issues.push(
        issue(
          `${path}[${index}].name`,
          'duplicate-name',
          'Übungsnamen müssen unabhängig von Großschreibung und Leerzeichen eindeutig sein.',
        ),
      );
    }
    seen.add(normalized);
  });
  return issues;
}

export function validateDomainData(data: DomainData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [name, limit] of Object.entries(DOMAIN_COLLECTION_LIMITS)) {
    const collection = data[name as keyof DomainData];
    if (collection.length > limit) {
      issues.push(
        issue(
          name,
          'invalid-value',
          `Darf höchstens ${limit.toLocaleString('de')} Einträge enthalten.`,
        ),
      );
    }
  }
  data.exercises.forEach((value, index) =>
    issues.push(...validateExercise(value, `exercises[${index}]`)),
  );
  data.workoutTemplates.forEach((value, index) =>
    issues.push(
      ...validateWorkoutTemplate(value, `workoutTemplates[${index}]`),
    ),
  );
  data.exerciseSlots.forEach((value, index) =>
    issues.push(...validateExerciseSlot(value, `exerciseSlots[${index}]`)),
  );
  data.workoutSessions.forEach((value, index) =>
    issues.push(...validateWorkoutSession(value, `workoutSessions[${index}]`)),
  );
  data.exerciseResults.forEach((value, index) =>
    issues.push(...validateExerciseResult(value, `exerciseResults[${index}]`)),
  );

  // Relationship checks assume structurally valid entities. Import callers get
  // all field-level issues without risking access to malformed nested values.
  if (issues.length > 0) return issues;

  issues.push(
    ...duplicateIdIssues(data.exercises, 'exercises'),
    ...duplicateIdIssues(data.workoutTemplates, 'workoutTemplates'),
    ...duplicateIdIssues(data.exerciseSlots, 'exerciseSlots'),
    ...duplicateIdIssues(data.workoutSessions, 'workoutSessions'),
    ...duplicateIdIssues(data.exerciseResults, 'exerciseResults'),
    ...validateUniqueExerciseNames(data.exercises),
  );

  const exercises = new Map(data.exercises.map((value) => [value.id, value]));
  const templates = new Set(data.workoutTemplates.map((value) => value.id));
  const slots = new Map(data.exerciseSlots.map((value) => [value.id, value]));
  const sessions = new Map(
    data.workoutSessions.map((value) => [value.id, value]),
  );

  data.exerciseSlots.forEach((slot, index) => {
    if (!templates.has(slot.templateId)) {
      issues.push(
        issue(
          `exerciseSlots[${index}].templateId`,
          'dangling-reference',
          'Vorlage existiert nicht.',
        ),
      );
    }
    const exerciseIds = [
      slot.primaryExerciseId,
      ...slot.alternativeExerciseIds,
    ];
    exerciseIds.forEach((id, exerciseIndex) => {
      const exercise = exercises.get(id);
      const field =
        exerciseIndex === 0
          ? 'primaryExerciseId'
          : `alternativeExerciseIds[${exerciseIndex - 1}]`;
      if (exercise === undefined) {
        issues.push(
          issue(
            `exerciseSlots[${index}].${field}`,
            'dangling-reference',
            'Übung existiert nicht.',
          ),
        );
      } else if (exercise.movementCategory !== slot.movementCategory) {
        issues.push(
          issue(
            `exerciseSlots[${index}].${field}`,
            'invariant',
            'Übung und Slot müssen dieselbe Bewegungskategorie haben.',
          ),
        );
      }
    });
  });
  const slotOrders = new Set<string>();
  data.exerciseSlots.forEach((slot, index) => {
    const key = `${slot.templateId}:${slot.order}`;
    if (slotOrders.has(key)) {
      issues.push(
        issue(
          `exerciseSlots[${index}].order`,
          'invariant',
          'Die Reihenfolge muss innerhalb der Vorlage eindeutig sein.',
        ),
      );
    }
    slotOrders.add(key);
  });

  if (
    data.workoutSessions.filter((value) => value.status === 'active').length > 1
  ) {
    issues.push(
      issue(
        'workoutSessions',
        'invariant',
        'Es darf höchstens eine aktive Einheit geben.',
      ),
    );
  }

  data.workoutSessions.forEach((session, index) => {
    if (!templates.has(session.workoutTemplateId)) {
      issues.push(
        issue(
          `workoutSessions[${index}].workoutTemplateId`,
          'dangling-reference',
          'Vorlage existiert nicht.',
        ),
      );
    }
    const templateSlots = data.exerciseSlots.filter(
      (slot) => slot.templateId === session.workoutTemplateId,
    );
    const requiredSlots =
      session.status === 'active'
        ? templateSlots.filter((slot) => slot.active)
        : [];
    const selectedSlotIds = Object.keys(session.exerciseSelections);
    if (selectedSlotIds.length === 0) {
      issues.push(
        issue(
          `workoutSessions[${index}].exerciseSelections`,
          'invariant',
          'Eine Einheit benötigt mindestens eine Übungsauswahl.',
        ),
      );
    }
    for (const slot of requiredSlots) {
      const selectedExerciseId = session.exerciseSelections[slot.id];
      if (selectedExerciseId === undefined) {
        issues.push(
          issue(
            `workoutSessions[${index}].exerciseSelections`,
            'invariant',
            `Für Slot ${slot.id} fehlt die Übungsauswahl.`,
          ),
        );
      } else if (
        ![slot.primaryExerciseId, ...slot.alternativeExerciseIds].includes(
          selectedExerciseId,
        )
      ) {
        issues.push(
          issue(
            `workoutSessions[${index}].exerciseSelections.${slot.id}`,
            'invariant',
            'Die gewählte Übung gehört nicht zum Slot.',
          ),
        );
      }
    }
    for (const selectedSlotId of selectedSlotIds) {
      const selectedSlot = slots.get(selectedSlotId);
      const selectedExerciseId = session.exerciseSelections[selectedSlotId];
      if (
        selectedSlot === undefined ||
        selectedSlot.templateId !== session.workoutTemplateId
      ) {
        issues.push(
          issue(
            `workoutSessions[${index}].exerciseSelections.${selectedSlotId}`,
            'invariant',
            'Die Auswahl gehört zu keinem aktiven Slot dieser Vorlage.',
          ),
        );
      }
      if (
        selectedExerciseId !== undefined &&
        !exercises.has(selectedExerciseId)
      ) {
        issues.push(
          issue(
            `workoutSessions[${index}].exerciseSelections.${selectedSlotId}`,
            'dangling-reference',
            'Gewählte Übung existiert nicht.',
          ),
        );
      }
    }
  });

  const resultKeys = new Set<string>();
  data.exerciseResults.forEach((result, index) => {
    const session = sessions.get(result.workoutSessionId);
    const slot = slots.get(result.exerciseSlotId);
    const exercise = exercises.get(result.exerciseId);
    if (session === undefined) {
      issues.push(
        issue(
          `exerciseResults[${index}].workoutSessionId`,
          'dangling-reference',
          'Einheit existiert nicht.',
        ),
      );
    }
    if (slot === undefined) {
      issues.push(
        issue(
          `exerciseResults[${index}].exerciseSlotId`,
          'dangling-reference',
          'Slot existiert nicht.',
        ),
      );
    }
    if (exercise === undefined) {
      issues.push(
        issue(
          `exerciseResults[${index}].exerciseId`,
          'dangling-reference',
          'Übung existiert nicht.',
        ),
      );
    } else if (
      result.weightKg === null &&
      exercise.equipmentType !== 'bodyweight'
    ) {
      issues.push(
        issue(
          `exerciseResults[${index}].weightKg`,
          'invariant',
          'Nur Körpergewichtsübungen dürfen ohne externes Gewicht gespeichert werden.',
        ),
      );
    }
    if (
      session !== undefined &&
      slot !== undefined &&
      slot.templateId !== session.workoutTemplateId
    ) {
      issues.push(
        issue(
          `exerciseResults[${index}].exerciseSlotId`,
          'invariant',
          'Slot gehört nicht zur Vorlage der Einheit.',
        ),
      );
    }
    if (
      session !== undefined &&
      Date.parse(result.createdAt) < Date.parse(session.startedAt)
    ) {
      issues.push(
        issue(
          `exerciseResults[${index}].createdAt`,
          'invariant',
          'Darf nicht vor dem Beginn der Einheit liegen.',
        ),
      );
    }
    if (
      session !== undefined &&
      session.exerciseSelections[result.exerciseSlotId] !== undefined &&
      session.exerciseSelections[result.exerciseSlotId] !== result.exerciseId
    ) {
      issues.push(
        issue(
          `exerciseResults[${index}].exerciseId`,
          'invariant',
          'Übung entspricht nicht der für die Einheit gespeicherten Auswahl.',
        ),
      );
    }
    if (
      session?.status === 'active' &&
      slot !== undefined &&
      ![slot.primaryExerciseId, ...slot.alternativeExerciseIds].includes(
        result.exerciseId,
      )
    ) {
      issues.push(
        issue(
          `exerciseResults[${index}].exerciseId`,
          'invariant',
          'Übung gehört nicht zum Slot.',
        ),
      );
    }
    const key = `${result.workoutSessionId}:${result.exerciseSlotId}:${result.setType}`;
    if (resultKeys.has(key)) {
      issues.push(
        issue(
          `exerciseResults[${index}].setType`,
          'invariant',
          'Pro Slot darf jede Satzart höchstens einmal vorkommen.',
        ),
      );
    }
    resultKeys.add(key);
  });

  data.workoutSessions.forEach((session, sessionIndex) => {
    if (session.status !== 'completed') return;
    for (const slotId of Object.keys(session.exerciseSelections)) {
      const workingSets = data.exerciseResults.filter(
        (result) =>
          result.workoutSessionId === session.id &&
          result.exerciseSlotId === slotId &&
          result.setType === 'working',
      );
      if (workingSets.length !== 1) {
        issues.push(
          issue(
            `workoutSessions[${sessionIndex}].exerciseSelections.${slotId}`,
            'invariant',
            'Eine abgeschlossene Einheit benötigt je ausgewähltem Slot genau einen Arbeitssatz.',
          ),
        );
      }
    }
  });

  return issues;
}

export function assertValidDomainData(data: DomainData): void {
  const issues = validateDomainData(data);
  if (issues.length > 0) throw new DomainValidationError(issues);
}

export function parseDomainData(value: unknown): DomainData {
  if (!isRecord(value)) {
    throw new DomainValidationError([
      issue('data', 'invalid-type', 'Muss ein Objekt sein.'),
    ]);
  }
  const collectionNames = [
    'exercises',
    'workoutTemplates',
    'exerciseSlots',
    'workoutSessions',
    'exerciseResults',
  ] as const;
  const issues: ValidationIssue[] = [];
  for (const name of collectionNames) {
    if (!Array.isArray(value[name])) {
      issues.push(issue(name, 'invalid-type', 'Muss eine Liste sein.'));
    }
  }
  if (issues.length > 0) throw new DomainValidationError(issues);

  const data = value as unknown as DomainData;
  assertValidDomainData(data);
  return data;
}
