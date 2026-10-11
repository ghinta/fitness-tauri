import {
  DomainValidationError,
  isIsoUtcDate,
  parseDomainData,
  type DomainData,
} from '../domain';
import type {
  SnapshotRepository,
  StorageMeta,
  StorageSnapshot,
} from '../storage';

export const BACKUP_FORMAT = 'fitness-pwa-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

const ROOT_KEYS = [
  'format',
  'formatVersion',
  'exportedAt',
  'exercises',
  'workoutTemplates',
  'exerciseSlots',
  'workoutSessions',
  'exerciseResults',
  'meta',
] as const;

export interface BackupDocument extends DomainData {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  meta: StorageMeta[];
}

export interface ImportSummary {
  exercises: number;
  templates: number;
  sessions: number;
  results: number;
  exportedAt: string;
}

export interface PreparedImport {
  document: BackupDocument;
  summary: ImportSummary;
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export class BackupService {
  constructor(
    private readonly snapshots: SnapshotRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createDocument(): Promise<BackupDocument> {
    const snapshot = await this.snapshots.read();
    return snapshotToDocument(snapshot, this.now().toISOString());
  }

  async createJson(): Promise<string> {
    return JSON.stringify(await this.createDocument(), null, 2);
  }

  prepareImport(text: string): PreparedImport {
    return prepareImport(text);
  }

  async replace(prepared: PreparedImport): Promise<void> {
    await this.snapshots.replace(documentToSnapshot(prepared.document));
  }
}

export function snapshotToDocument(
  snapshot: StorageSnapshot,
  exportedAt: string,
): BackupDocument {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    exercises: snapshot.exercises,
    workoutTemplates: snapshot.workoutTemplates,
    exerciseSlots: snapshot.exerciseSlots,
    workoutSessions: snapshot.workoutSessions,
    exerciseResults: snapshot.exerciseResults,
    meta: snapshot.meta,
  };
}

export function prepareImport(text: string): PreparedImport {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    throw new BackupValidationError(
      'Die Sicherungsdatei ist größer als 50 MiB.',
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new BackupValidationError('Die Datei enthält kein gültiges JSON.');
  }

  if (!isRecord(value)) {
    throw new BackupValidationError('Die Sicherung muss ein Objekt sein.');
  }
  const unknownKeys = Object.keys(value).filter(
    (key) => !ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number]),
  );
  if (unknownKeys.length > 0) {
    throw new BackupValidationError(
      `Die Sicherung enthält unbekannte Felder: ${unknownKeys.join(', ')}.`,
    );
  }
  if (value.format !== BACKUP_FORMAT) {
    throw new BackupValidationError('Das Sicherungsformat wird nicht erkannt.');
  }
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(
      'Diese Version der Sicherungsdatei wird nicht unterstützt.',
    );
  }
  if (!isIsoUtcDate(value.exportedAt)) {
    throw new BackupValidationError('Das Exportdatum ist ungültig.');
  }

  let data: DomainData;
  try {
    data = parseDomainData(value);
  } catch (error) {
    if (error instanceof DomainValidationError) {
      throw new BackupValidationError(
        `Die Sicherung ist ungültig: ${error.issues[0]?.message ?? error.message}`,
      );
    }
    throw error;
  }
  const meta = parseMeta(value.meta);
  const document: BackupDocument = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: value.exportedAt,
    ...data,
    meta,
  };

  return {
    document,
    summary: {
      exercises: data.exercises.length,
      templates: data.workoutTemplates.length,
      sessions: data.workoutSessions.length,
      results: data.exerciseResults.length,
      exportedAt: value.exportedAt,
    },
  };
}

function documentToSnapshot(document: BackupDocument): StorageSnapshot {
  return {
    exercises: document.exercises,
    workoutTemplates: document.workoutTemplates,
    exerciseSlots: document.exerciseSlots,
    workoutSessions: document.workoutSessions,
    exerciseResults: document.exerciseResults,
    meta: document.meta,
  };
}

function parseMeta(value: unknown): StorageMeta[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new BackupValidationError(
      'Die Metadaten der Sicherung sind ungültig.',
    );
  }
  const keys = new Set<string>();
  return value.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.key !== 'string' ||
      entry.key.length === 0 ||
      entry.key.length > 100 ||
      !Object.hasOwn(entry, 'value')
    ) {
      throw new BackupValidationError(
        'Die Metadaten der Sicherung sind ungültig.',
      );
    }
    if (keys.has(entry.key)) {
      throw new BackupValidationError(
        'Die Sicherung enthält doppelte Metadaten-Schlüssel.',
      );
    }
    keys.add(entry.key);
    return { key: entry.key, value: entry.value };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
