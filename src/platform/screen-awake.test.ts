import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreenAwake } from './screen-awake';

const platform = vi.hoisted(() => ({ native: false, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => platform.native,
  invoke: platform.invoke,
}));

function lock() {
  const target = new EventTarget();
  let released = false;
  const sentinel = Object.assign(target, {
    type: 'screen' as const,
    released: false,
    release: vi.fn(() => {
      released = true;
      target.dispatchEvent(new Event('release'));
      return Promise.resolve();
    }),
    onrelease: null,
  });
  Object.defineProperty(sentinel, 'released', { get: () => released });
  return sentinel;
}

beforeEach(() => {
  localStorage.clear();
  platform.native = false;
  platform.invoke.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});

describe('screen awake lifecycle', () => {
  it('acquires only during training and releases on leaving or opting out', async () => {
    const sentinel = lock();
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    const awake = createScreenAwake(vi.fn());
    await awake.setTraining(false);
    expect(request).not.toHaveBeenCalled();
    await awake.setTraining(true);
    expect(request).toHaveBeenCalledWith('screen');
    await awake.setEnabled(false);
    expect(sentinel.release).toHaveBeenCalledOnce();
    expect(localStorage.getItem('fitness-glass-screen-awake')).toBe('false');
    await awake.dispose();
  });

  it('reports unsupported browsers without breaking training', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: undefined,
    });
    const status = vi.fn();
    const awake = createScreenAwake(status);
    await awake.setTraining(true);
    expect(status).toHaveBeenLastCalledWith('unavailable');
    await awake.dispose();
  });

  it('releases a late browser acquisition when training has already ended', async () => {
    const sentinel = lock();
    let grant!: (value: WakeLockSentinel) => void;
    const request = vi.fn(
      () =>
        new Promise<WakeLockSentinel>((resolve) => {
          grant = resolve;
        }),
    );
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    const awake = createScreenAwake(vi.fn());
    const acquiring = awake.setTraining(true);
    await Promise.resolve();
    const stopping = awake.setTraining(false);
    grant(sentinel);
    await acquiring;
    await stopping;
    expect(sentinel.release).toHaveBeenCalledOnce();
    await awake.dispose();
  });

  it('uses native display inhibition and releases it on disposal', async () => {
    platform.native = true;
    const awake = createScreenAwake(vi.fn());
    await awake.setTraining(true);
    expect(platform.invoke).toHaveBeenLastCalledWith('set_display_awake', {
      enabled: true,
    });
    await awake.dispose();
    expect(platform.invoke).toHaveBeenLastCalledWith('set_display_awake', {
      enabled: false,
    });
  });

  it('releases when hidden and reacquires when the training is visible again', async () => {
    platform.native = true;
    const awake = createScreenAwake(vi.fn());
    await awake.setTraining(true);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await awake.setTraining(true);
    expect(platform.invoke).toHaveBeenLastCalledWith('set_display_awake', {
      enabled: false,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await awake.setTraining(true);
    expect(platform.invoke).toHaveBeenLastCalledWith('set_display_awake', {
      enabled: true,
    });
    await awake.dispose();
  });
});
