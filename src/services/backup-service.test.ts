import { describe, expect, it, vi } from 'vitest';
import { createInitialDomainData } from '../domain';
import type { SnapshotRepository, StorageSnapshot } from '../storage';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupService,
  MAX_IMPORT_BYTES,
  prepareImport,
  snapshotToDocument,
} from './backup-service';

function snapshot(): StorageSnapshot {
  const data = createInitialDomainData();
  data.exercises[0]!.image = {
    dataUrl: 'data:image/jpeg;base64,AA==',
    thumbnailDataUrl: 'data:image/jpeg;base64,AA==',
    updatedAt: '2026-07-19T12:00:00.000Z',
  };
  return {
    ...data,
    meta: [{ key: 'seedVersion', value: 2 }],
  };
}

describe('backup service', () => {
  it('exports every durable store with the versioned contract', async () => {
    const repository: SnapshotRepository = {
      read: vi.fn().mockResolvedValue(snapshot()),
      replace: vi.fn(),
    };
    const service = new BackupService(
      repository,
      () => new Date('2026-07-19T12:00:00.000Z'),
    );

    const document = JSON.parse(await service.createJson()) as Record<
      string,
      unknown
    >;

    expect(document.format).toBe(BACKUP_FORMAT);
    expect(document.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(document.exportedAt).toBe('2026-07-19T12:00:00.000Z');
    expect(document.exercises).toHaveLength(23);
    expect(
      (document.exercises as Array<{ image?: { dataUrl: string } }>)[0]?.image
        ?.dataUrl,
    ).toBe('data:image/jpeg;base64,AA==');
    expect(document.meta).toEqual([{ key: 'seedVersion', value: 2 }]);
  });

  it('validates fully before replacing the snapshot', async () => {
    const replace = vi.fn().mockResolvedValue(undefined);
    const repository: SnapshotRepository = {
      read: vi.fn().mockResolvedValue(snapshot()),
      replace,
    };
    const service = new BackupService(repository);
    const document = snapshotToDocument(snapshot(), '2026-07-19T12:00:00.000Z');
    const prepared = service.prepareImport(JSON.stringify(document));

    await service.replace(prepared);

    expect(replace).toHaveBeenCalledOnce();
    expect(prepared.summary).toMatchObject({
      exercises: 23,
      templates: 2,
      sessions: 0,
      results: 0,
    });
  });

  it('rejects malformed, unknown-version, dangling, and oversized imports', () => {
    expect(() => prepareImport('{')).toThrow('kein gültiges JSON');

    const valid = snapshotToDocument(snapshot(), '2026-07-19T12:00:00.000Z');
    expect(() =>
      prepareImport(JSON.stringify({ ...valid, formatVersion: 2 })),
    ).toThrow('nicht unterstützt');

    const dangling = structuredClone(valid);
    dangling.exerciseSlots[0]!.primaryExerciseId = crypto.randomUUID();
    expect(() => prepareImport(JSON.stringify(dangling))).toThrow(
      'Sicherung ist ungültig',
    );

    expect(() => prepareImport(' '.repeat(MAX_IMPORT_BYTES + 1))).toThrow(
      'größer als 50 MiB',
    );
  });

  it('rejects duplicate metadata and unknown root fields', () => {
    const valid = snapshotToDocument(snapshot(), '2026-07-19T12:00:00.000Z');
    expect(() =>
      prepareImport(
        JSON.stringify({
          ...valid,
          meta: [
            { key: 'seedVersion', value: 1 },
            { key: 'seedVersion', value: 2 },
          ],
        }),
      ),
    ).toThrow('doppelte Metadaten');
    expect(() =>
      prepareImport(JSON.stringify({ ...valid, unexpected: true })),
    ).toThrow('unbekannte Felder');
  });
});
