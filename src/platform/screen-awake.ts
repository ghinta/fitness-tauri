import { invoke, isTauri } from '@tauri-apps/api/core';

export type ScreenAwakeStatus = 'off' | 'active' | 'unavailable';
export interface ScreenAwakeController {
  readonly enabled: boolean;
  setEnabled(enabled: boolean): Promise<void>;
  setTraining(active: boolean): Promise<void>;
  dispose(): Promise<void>;
}

export function createScreenAwake(
  onStatus: (status: ScreenAwakeStatus) => void,
): ScreenAwakeController {
  let enabled = true;
  try {
    enabled = localStorage.getItem('fitness-glass-screen-awake') !== 'false';
  } catch {
    /* Use the default for this session. */
  }
  let training = false;
  let disposed = false;
  let nativeHeld: boolean | undefined = false;
  let sentinel: WakeLockSentinel | undefined;
  let queue = Promise.resolve();
  const wanted = (): boolean =>
    !disposed && training && enabled && document.visibilityState === 'visible';
  const reconcile = async (): Promise<void> => {
    const keepAwake = wanted();
    if (isTauri()) {
      if (keepAwake !== nativeHeld) {
        nativeHeld = undefined;
        await invoke('set_display_awake', { enabled: keepAwake });
        nativeHeld = keepAwake;
      }
    } else if (!keepAwake) {
      await sentinel?.release();
      sentinel = undefined;
    } else if (!sentinel || sentinel.released) {
      if (!navigator.wakeLock) {
        onStatus('unavailable');
        return;
      }
      const acquired = await navigator.wakeLock.request('screen');
      if (!wanted()) {
        await acquired.release();
        return;
      }
      sentinel = acquired;
      acquired.addEventListener('release', () => {
        if (sentinel === acquired) {
          sentinel = undefined;
          onStatus(wanted() ? 'unavailable' : 'off');
        }
      });
    }
    onStatus(keepAwake ? 'active' : 'off');
  };
  const sync = (): Promise<void> => {
    queue = queue.then(reconcile).catch(() => {
      onStatus(wanted() ? 'unavailable' : 'off');
    });
    return queue;
  };
  const onVisibility = (): void => {
    void sync();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onVisibility);
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = value;
      try {
        localStorage.setItem('fitness-glass-screen-awake', String(value));
      } catch {
        /* Keep the session setting. */
      }
      return sync();
    },
    setTraining(active) {
      training = active;
      return sync();
    },
    dispose() {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
      return sync();
    },
  };
}
