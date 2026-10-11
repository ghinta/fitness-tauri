import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBackup } from './desktop';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  writeTextFile: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: mocks.save,
  confirm: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: mocks.writeTextFile,
}));

describe('native backup persistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not write or report success when the save dialog is cancelled', async () => {
    mocks.save.mockResolvedValue(null);
    expect(await saveBackup('{"data":1}', 'backup.json')).toBe(false);
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
  });

  it('waits for the selected file to be written before reporting success', async () => {
    mocks.save.mockResolvedValue('/chosen/backup.json');
    mocks.writeTextFile.mockResolvedValue(undefined);
    expect(await saveBackup('{"data":1}', 'backup.json')).toBe(true);
    expect(mocks.writeTextFile).toHaveBeenCalledWith(
      '/chosen/backup.json',
      '{"data":1}',
    );
  });

  it('propagates write failures so an import cannot replace data without a backup', async () => {
    mocks.save.mockResolvedValue('/chosen/backup.json');
    mocks.writeTextFile.mockRejectedValue(new Error('Disk full'));
    await expect(saveBackup('{}', 'backup.json')).rejects.toThrow('Disk full');
  });
});
