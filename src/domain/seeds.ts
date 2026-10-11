import type {
  DomainData,
  Exercise,
  ExerciseSlot,
  WorkoutTemplate,
} from './entities';
import { DEFAULT_WEIGHT_INCREMENT_KG } from './entities';

export const INITIAL_SEED_VERSION = 2;
const SEEDED_AT = '2026-01-01T00:00:00.000Z';

const ids = {
  trainingA: '10000000-0000-4000-8000-000000000001',
  trainingB: '10000000-0000-4000-8000-000000000002',
  squat: '20000000-0000-4000-8000-000000000001',
  legPress: '20000000-0000-4000-8000-000000000002',
  pushup: '20000000-0000-4000-8000-000000000003',
  benchPress: '20000000-0000-4000-8000-000000000004',
  chestPress: '20000000-0000-4000-8000-000000000005',
  barbellRow: '20000000-0000-4000-8000-000000000006',
  rowMachine: '20000000-0000-4000-8000-000000000007',
  legCurl: '20000000-0000-4000-8000-000000000008',
  romanianDeadlift: '20000000-0000-4000-8000-000000000009',
  hangingLegRaise: '20000000-0000-4000-8000-000000000010',
  plank: '20000000-0000-4000-8000-000000000011',
  abMachine: '20000000-0000-4000-8000-000000000012',
  deadlift: '20000000-0000-4000-8000-000000000013',
  backExtension: '20000000-0000-4000-8000-000000000014',
  pullup: '20000000-0000-4000-8000-000000000015',
  latPulldown: '20000000-0000-4000-8000-000000000016',
  overheadPress: '20000000-0000-4000-8000-000000000017',
  shoulderPress: '20000000-0000-4000-8000-000000000018',
  bulgarianSplitSquat: '20000000-0000-4000-8000-000000000019',
  tricepsPushdown: '20000000-0000-4000-8000-000000000020',
  dips: '20000000-0000-4000-8000-000000000021',
  bicepsCurl: '20000000-0000-4000-8000-000000000022',
  hammerCurl: '20000000-0000-4000-8000-000000000023',
} as const;

type SeedExercise = Omit<Exercise, 'createdAt' | 'updatedAt' | 'active'>;

function exercise(value: SeedExercise): Exercise {
  return { ...value, active: true, createdAt: SEEDED_AT, updatedAt: SEEDED_AT };
}

export const DEFAULT_EXERCISES: readonly Exercise[] = [
  exercise({
    id: ids.squat,
    name: 'Kniebeuge',
    muscleGroup: 'Beine',
    movementCategory: 'kniedominant',
    equipmentType: 'free-weight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.legPress,
    name: 'Beinpresse',
    muscleGroup: 'Beine',
    movementCategory: 'kniedominant',
    equipmentType: 'machine',
    weightIncrementKg: 5,
  }),
  exercise({
    id: ids.pushup,
    name: 'Liegestütze',
    muscleGroup: 'Brust',
    movementCategory: 'horizontal-drücken',
    equipmentType: 'bodyweight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.benchPress,
    name: 'Bankdrücken',
    muscleGroup: 'Brust',
    movementCategory: 'horizontal-drücken',
    equipmentType: 'free-weight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.chestPress,
    name: 'Brustpresse',
    muscleGroup: 'Brust',
    movementCategory: 'horizontal-drücken',
    equipmentType: 'machine',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.barbellRow,
    name: 'Langhantelrudern',
    muscleGroup: 'Rücken',
    movementCategory: 'horizontal-ziehen',
    equipmentType: 'free-weight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.rowMachine,
    name: 'Rudermaschine',
    muscleGroup: 'Rücken',
    movementCategory: 'horizontal-ziehen',
    equipmentType: 'machine',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.legCurl,
    name: 'Beinbeuger',
    muscleGroup: 'Beine',
    movementCategory: 'hintere-kette',
    equipmentType: 'machine',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.romanianDeadlift,
    name: 'Rumänisches Kreuzheben',
    muscleGroup: 'Beine und Rücken',
    movementCategory: 'hintere-kette',
    equipmentType: 'free-weight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.hangingLegRaise,
    name: 'Hängendes Beinheben',
    muscleGroup: 'Rumpf',
    movementCategory: 'rumpf',
    equipmentType: 'bodyweight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.plank,
    name: 'Unterarmstütz',
    muscleGroup: 'Rumpf',
    movementCategory: 'rumpf',
    equipmentType: 'bodyweight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.abMachine,
    name: 'Bauchmaschine',
    muscleGroup: 'Rumpf',
    movementCategory: 'rumpf',
    equipmentType: 'machine',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.deadlift,
    name: 'Kreuzheben',
    muscleGroup: 'Beine und Rücken',
    movementCategory: 'hintere-kette',
    equipmentType: 'free-weight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.backExtension,
    name: 'Rückenstrecker',
    muscleGroup: 'Rücken',
    movementCategory: 'hintere-kette',
    equipmentType: 'bodyweight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.pullup,
    name: 'Klimmzüge',
    muscleGroup: 'Rücken',
    movementCategory: 'vertikal-ziehen',
    equipmentType: 'bodyweight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.latPulldown,
    name: 'Latzug',
    muscleGroup: 'Rücken',
    movementCategory: 'vertikal-ziehen',
    equipmentType: 'cable',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.overheadPress,
    name: 'Schulterdrücken',
    muscleGroup: 'Schultern',
    movementCategory: 'vertikal-drücken',
    equipmentType: 'free-weight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.shoulderPress,
    name: 'Schulterpresse',
    muscleGroup: 'Schultern',
    movementCategory: 'vertikal-drücken',
    equipmentType: 'machine',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.bulgarianSplitSquat,
    name: 'Bulgarische Kniebeuge',
    muscleGroup: 'Beine',
    movementCategory: 'kniedominant',
    equipmentType: 'bodyweight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.tricepsPushdown,
    name: 'Trizepsdrücken am Kabelzug',
    muscleGroup: 'Trizeps',
    movementCategory: 'trizeps',
    equipmentType: 'cable',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.dips,
    name: 'Dips',
    muscleGroup: 'Trizeps',
    movementCategory: 'trizeps',
    equipmentType: 'bodyweight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.bicepsCurl,
    name: 'Bizepscurls',
    muscleGroup: 'Bizeps',
    movementCategory: 'bizeps',
    equipmentType: 'free-weight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
  exercise({
    id: ids.hammerCurl,
    name: 'Hammercurls',
    muscleGroup: 'Bizeps',
    movementCategory: 'bizeps',
    equipmentType: 'free-weight',
    weightIncrementKg: DEFAULT_WEIGHT_INCREMENT_KG,
  }),
];

export const DEFAULT_WORKOUT_TEMPLATES: readonly WorkoutTemplate[] = [
  {
    id: ids.trainingA,
    name: 'Training A',
    active: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: ids.trainingB,
    name: 'Training B',
    active: true,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
];

function slot(
  templateId: string,
  order: number,
  label: string,
  movementCategory: string,
  exerciseIds: readonly string[],
): ExerciseSlot {
  const [primaryExerciseId, ...alternativeExerciseIds] = exerciseIds;
  if (primaryExerciseId === undefined)
    throw new Error('Ein Slot benötigt eine Übung.');
  const templateNumber = templateId === ids.trainingA ? 1 : 2;
  return {
    id: `30000000-0000-4000-800${templateNumber}-00000000000${order}`,
    templateId,
    movementCategory,
    label,
    order,
    primaryExerciseId,
    alternativeExerciseIds,
    active: true,
  };
}

export const DEFAULT_EXERCISE_SLOTS: readonly ExerciseSlot[] = [
  slot(ids.trainingA, 1, 'Beine', 'kniedominant', [ids.squat, ids.legPress]),
  slot(ids.trainingA, 2, 'Brust', 'horizontal-drücken', [
    ids.pushup,
    ids.benchPress,
    ids.chestPress,
  ]),
  slot(ids.trainingA, 3, 'Rücken', 'horizontal-ziehen', [
    ids.barbellRow,
    ids.rowMachine,
  ]),
  slot(ids.trainingA, 4, 'Hintere Kette', 'hintere-kette', [
    ids.legCurl,
    ids.romanianDeadlift,
  ]),
  slot(ids.trainingA, 5, 'Rumpf', 'rumpf', [
    ids.hangingLegRaise,
    ids.plank,
    ids.abMachine,
  ]),
  slot(ids.trainingA, 6, 'Trizeps', 'trizeps', [ids.tricepsPushdown, ids.dips]),
  slot(ids.trainingB, 1, 'Hintere Kette', 'hintere-kette', [
    ids.deadlift,
    ids.romanianDeadlift,
    ids.backExtension,
  ]),
  slot(ids.trainingB, 2, 'Rücken', 'vertikal-ziehen', [
    ids.pullup,
    ids.latPulldown,
  ]),
  slot(ids.trainingB, 3, 'Schultern', 'vertikal-drücken', [
    ids.overheadPress,
    ids.shoulderPress,
  ]),
  slot(ids.trainingB, 4, 'Beine', 'kniedominant', [
    ids.bulgarianSplitSquat,
    ids.legPress,
  ]),
  slot(ids.trainingB, 5, 'Rumpf', 'rumpf', [
    ids.hangingLegRaise,
    ids.plank,
    ids.abMachine,
  ]),
  slot(ids.trainingB, 6, 'Bizeps', 'bizeps', [ids.bicepsCurl, ids.hammerCurl]),
];

export function createInitialDomainData(): DomainData {
  return {
    exercises: DEFAULT_EXERCISES.map((item) => ({ ...item })),
    workoutTemplates: DEFAULT_WORKOUT_TEMPLATES.map((item) => ({ ...item })),
    exerciseSlots: DEFAULT_EXERCISE_SLOTS.map((item) => ({
      ...item,
      alternativeExerciseIds: [...item.alternativeExerciseIds],
    })),
    workoutSessions: [],
    exerciseResults: [],
  };
}
