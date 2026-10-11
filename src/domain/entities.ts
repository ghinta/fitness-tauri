export type UUID = string;
export type ISODateString = string;

export type EquipmentType = 'bodyweight' | 'free-weight' | 'machine' | 'cable';

export type SessionStatus = 'active' | 'completed';
export type SetType = 'warmup' | 'working';
export const DEFAULT_WEIGHT_INCREMENT_KG = 2.5;

export interface Exercise {
  id: UUID;
  name: string;
  muscleGroup: string;
  movementCategory: string;
  equipmentType: EquipmentType;
  weightIncrementKg: number;
  image?: ExerciseImage | null;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ExerciseImage {
  dataUrl: string;
  thumbnailDataUrl: string;
  updatedAt: ISODateString;
}

export interface SetTimer {
  exerciseSlotId: UUID;
  setType: SetType;
  startedAt: ISODateString;
  stoppedAt: ISODateString | null;
  durationSeconds: number | null;
  weightKg: number | null;
  notes: string;
}

export interface WorkoutTemplate {
  id: UUID;
  name: string;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ExerciseSlot {
  id: UUID;
  templateId: UUID;
  movementCategory: string;
  label: string;
  order: number;
  primaryExerciseId: UUID;
  alternativeExerciseIds: UUID[];
  active: boolean;
}

export interface WorkoutSession {
  id: UUID;
  workoutTemplateId: UUID;
  templateNameSnapshot: string;
  status: SessionStatus;
  startedAt: ISODateString;
  completedAt: ISODateString | null;
  notes: string;
  exerciseSelections: Record<UUID, UUID>;
  setTimer?: SetTimer | null;
}

export interface ExerciseResult {
  id: UUID;
  workoutSessionId: UUID;
  exerciseSlotId: UUID;
  exerciseId: UUID;
  exerciseNameSnapshot: string;
  setType: SetType;
  weightKg: number | null;
  durationSeconds: number;
  notes: string;
  createdAt: ISODateString;
}

export interface DomainData {
  exercises: Exercise[];
  workoutTemplates: WorkoutTemplate[];
  exerciseSlots: ExerciseSlot[];
  workoutSessions: WorkoutSession[];
  exerciseResults: ExerciseResult[];
}

export function isBodyweightExercise(exercise: Exercise): boolean {
  return exercise.equipmentType === 'bodyweight';
}
