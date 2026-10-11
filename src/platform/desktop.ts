import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

export async function confirmAction(message: string): Promise<boolean> {
  return isTauri()
    ? confirm(message, {
        title: 'Fitness Glass',
        kind: 'warning',
        okLabel: 'Fortfahren',
        cancelLabel: 'Abbrechen',
      })
    : window.confirm(message);
}

// Dialog-selected paths receive a temporary filesystem scope from Tauri.
export async function saveBackup(
  contents: string,
  filename: string,
): Promise<boolean> {
  if (isTauri()) {
    const path = await save({
      title: 'Sicherung speichern',
      defaultPath: filename,
      filters: [{ name: 'JSON-Sicherung', extensions: ['json'] }],
    });
    if (!path) return false;
    await writeTextFile(path, contents);
    return true;
  }
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function guardWindowClose(
  needsConfirmation: () => boolean,
): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const appWindow = getCurrentWindow();
  let confirming = false;
  return appWindow.onCloseRequested(async (event) => {
    if (!needsConfirmation()) return;
    event.preventDefault();
    if (confirming) return;
    confirming = true;
    try {
      if (
        await confirmAction(
          'Nicht gespeicherte Eingaben verwerfen und Fenster schließen? Ein laufender Timer bleibt gespeichert und läuft beim nächsten Öffnen weiter.',
        )
      )
        await appWindow.destroy();
    } finally {
      confirming = false;
    }
  });
}
