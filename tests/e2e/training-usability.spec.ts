import { expect, test, type Page } from '@playwright/test';
import type { ExerciseResult, WorkoutSession } from '../../src/domain';

async function startWorkout(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-07-19T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-07-19T12:01:00Z'));
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Training starten' }).first().click();
  await expect(page.getByRole('heading', { name: 'Kniebeuge' })).toBeVisible();
}

for (const setType of ['warmup', 'working']) {
  test(`${setType} starts without weight and keeps controls and scroll position stable`, async ({
    page,
  }) => {
    await startWorkout(page);
    const form = page.locator(`form[data-set-type="${setType}"]`);
    const weight = form.locator('input[name="weight"]');
    await expect(weight).not.toHaveAttribute('required');
    await expect(weight).toHaveCSS('appearance', 'textfield');
    const start = form.getByRole('button', { name: 'Start', exact: true });
    await start.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await form.evaluate((node) => {
      node.dataset.retained = 'true';
    });
    await start.click();
    await expect(
      form.getByRole('button', { name: 'Stop', exact: true }),
    ).toBeVisible();
    await expect(form).toHaveAttribute('data-retained', 'true');
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - before),
    ).toBeLessThan(3);
    await page.clock.fastForward(30_000);
    const stopScroll = await page.evaluate(() => window.scrollY);
    await form.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(form.locator('input[name="duration"]')).toHaveValue('30');
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - stopScroll),
    ).toBeLessThan(3);
    await form
      .getByRole('button', {
        name:
          setType === 'warmup'
            ? 'Aufwärmsatz speichern'
            : 'Arbeitssatz speichern & weiter',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: setType === 'warmup' ? 'Aufwärmsatz gespeichert' : 'Liegestütze',
        exact: true,
      }),
    ).toBeVisible();
    if (setType === 'warmup') {
      await expect(
        page.getByText('Ohne Gewichtsangabe · 30 Sekunden', { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Aufwärmsatz gespeichert' }),
      ).toBeVisible();
    }
  });
}

test('warmup start, stop, and save retain the working-set draft', async ({
  page,
}) => {
  await startWorkout(page);
  const working = page.locator('form[data-set-type="working"]');
  await working.locator('input[name="weight"]').fill('42.5');
  await working.locator('textarea[name="notes"]').fill('Nicht verlieren');
  const warmup = page.locator('form[data-set-type="warmup"]');
  await warmup.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    warmup.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(25_000);
  await warmup.getByRole('button', { name: 'Stop', exact: true }).click();
  await warmup
    .getByRole('button', { name: 'Aufwärmsatz speichern', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Aufwärmsatz gespeichert' }),
  ).toBeVisible();
  await expect(working.locator('input[name="weight"]')).toHaveValue('42.5');
  await expect(working.locator('textarea[name="notes"]')).toHaveValue(
    'Nicht verlieren',
  );
  await expect(
    working.getByRole('button', { name: 'Start', exact: true }),
  ).toBeEnabled();
});

test('working Start automatically saves corrected warmup values without moving the forms', async ({
  page,
}) => {
  await startWorkout(page);
  const warmup = page.locator('form[data-set-type="warmup"]');
  const working = page.locator('form[data-set-type="working"]');
  await working.locator('input[name="weight"]').fill('42.5');
  await working.locator('textarea[name="notes"]').fill('Arbeitssatz-Notiz');
  await warmup.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    warmup.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  const start = working.getByRole('button', { name: 'Start', exact: true });
  await expect(start).toBeDisabled();
  await page.clock.fastForward(25_000);
  await warmup.getByRole('button', { name: 'Stop', exact: true }).click();
  await warmup.locator('input[name="duration"]').fill('28');
  await warmup.locator('textarea[name="notes"]').fill('Aufwärm-Notiz');
  await expect(start).toBeEnabled();
  await start.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  const top = (await working.boundingBox())?.y;
  await start.click();
  await expect(
    working.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await expect(
    warmup.getByRole('heading', { name: 'Aufwärmsatz gespeichert' }),
  ).toBeAttached();
  await expect(
    warmup.getByRole('button', { name: 'Gespeichert', exact: true }),
  ).toBeDisabled();
  await expect(warmup.locator('input[name="duration"]')).toHaveValue('28');
  await expect(warmup.locator('input[name="duration"]')).toHaveAttribute(
    'readonly',
    '',
  );
  await expect(working.locator('input[name="weight"]')).toHaveValue('42.5');
  await expect(working.locator('textarea[name="notes"]')).toHaveValue(
    'Arbeitssatz-Notiz',
  );
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - before),
  ).toBeLessThan(3);
  expect(
    Math.abs(((await working.boundingBox())?.y ?? 0) - (top ?? 0)),
  ).toBeLessThan(3);
  const data = await readTrainingData(page);
  expect(data.results).toHaveLength(1);
  expect(data.results[0]).toMatchObject({
    setType: 'warmup',
    weightKg: null,
    durationSeconds: 28,
    notes: 'Aufwärm-Notiz',
  });
  expect(data.sessions[0]?.setTimer).toMatchObject({
    setType: 'working',
    weightKg: 42.5,
    notes: 'Arbeitssatz-Notiz',
    stoppedAt: null,
  });
  await page.clock.fastForward(30_000);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Aufwärmsatz gespeichert' }),
  ).toBeVisible();
  await expect(working.locator('[data-timer-display]')).toHaveText('30 s');
  await working.getByRole('button', { name: 'Stop', exact: true }).click();
  await working
    .getByRole('button', { name: 'Arbeitssatz speichern & weiter' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Liegestütze' }),
  ).toBeVisible();
  expect(
    (await readTrainingData(page)).results.map(({ setType }) => setType).sort(),
  ).toEqual(['warmup', 'working']);
});

test('working Start also saves a stopped warmup restored after reload', async ({
  page,
}) => {
  await startWorkout(page);
  const warmup = page.locator('form[data-set-type="warmup"]');
  await warmup.locator('input[name="weight"]').fill('20');
  await warmup.locator('textarea[name="notes"]').fill('Leicht aufwärmen');
  await warmup.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    warmup.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(20_000);
  await warmup.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(warmup.locator('input[name="duration"]')).toHaveValue('20');
  await page.reload();
  const working = page.locator('form[data-set-type="working"]');
  await working.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    working.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  const data = await readTrainingData(page);
  expect(data.results).toHaveLength(1);
  expect(data.results[0]).toMatchObject({
    setType: 'warmup',
    weightKg: 20,
    durationSeconds: 20,
    notes: 'Leicht aufwärmen',
  });
  expect(data.sessions[0]?.setTimer).toMatchObject({
    setType: 'working',
    weightKg: null,
    stoppedAt: null,
  });
});

test('invalid warmup corrections stay editable before starting the working timer', async ({
  page,
}) => {
  await startWorkout(page);
  const warmup = page.locator('form[data-set-type="warmup"]');
  const working = page.locator('form[data-set-type="working"]');
  await warmup.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    warmup.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(20_000);
  await warmup.getByRole('button', { name: 'Stop', exact: true }).click();
  await warmup.locator('input[name="duration"]').fill('0');
  await working.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Bitte korrigiere die Eingaben im Aufwärmsatz.',
  );
  await expect(warmup.locator('input[name="duration"]')).toHaveValue('0');
  await expect(
    working.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeHidden();
  expect((await readTrainingData(page)).results).toHaveLength(0);
  await warmup.locator('input[name="duration"]').fill('23');
  await working.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    working.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  expect((await readTrainingData(page)).results[0]?.durationSeconds).toBe(23);
});

test('failed automatic save preserves the warmup and permits retry without duplicates', async ({
  page,
}) => {
  await startWorkout(page);
  const warmup = page.locator('form[data-set-type="warmup"]');
  const working = page.locator('form[data-set-type="working"]');
  await warmup.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    warmup.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(20_000);
  await warmup.getByRole('button', { name: 'Stop', exact: true }).click();
  await warmup.locator('input[name="duration"]').fill('24');
  await warmup.locator('textarea[name="notes"]').fill('Behalten');
  await page.evaluate(() => {
    // Preserve the receiver when delegating to the original IndexedDB method.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'exerciseResults') {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Test write failure', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  await working.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(warmup.locator('input[name="duration"]')).toHaveValue('24');
  await expect(warmup.locator('textarea[name="notes"]')).toHaveValue(
    'Behalten',
  );
  await expect(
    working.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeHidden();
  const failed = await readTrainingData(page);
  expect(failed.results).toHaveLength(0);
  expect(failed.sessions[0]?.setTimer?.setType).toBe('warmup');
  await working.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    working.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  const retried = await readTrainingData(page);
  expect(retried.results).toHaveLength(1);
  expect(retried.results[0]).toMatchObject({
    durationSeconds: 24,
    notes: 'Behalten',
  });
});

test('restored working timer retains an unspecified weight and resumes in place', async ({
  page,
}) => {
  await startWorkout(page);
  const working = page.locator('form[data-set-type="working"]');
  await working.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    working.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(15_000);
  await page.reload();
  await expect(working.locator('[data-timer-display]')).toHaveText('15 s');
  await expect(working.locator('input[name="weight"]')).toHaveValue('');
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await page.clock.fastForward(15_000);
  await working.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(working.locator('input[name="duration"]')).toHaveValue('30');
});

test('training acquires the display wake lock and releases it when disabled or left', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { requests: 0, releases: 0 };
    (window as Window & { wakeState?: typeof state }).wakeState = state;
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: () => {
          state.requests++;
          const sentinel = new EventTarget();
          return Promise.resolve(
            Object.assign(sentinel, {
              released: false,
              release: () => {
                state.releases++;
                return Promise.resolve();
              },
            }),
          );
        },
      },
    });
  });
  await startWorkout(page);
  const wakeState = () =>
    page.evaluate(
      () =>
        (
          window as Window & {
            wakeState?: { requests: number; releases: number };
          }
        ).wakeState,
    );
  await expect.poll(wakeState).toEqual({ requests: 1, releases: 0 });
  await page
    .getByRole('checkbox', { name: 'Bildschirm wach halten' })
    .uncheck();
  await expect.poll(wakeState).toEqual({ requests: 1, releases: 1 });
  await page.getByRole('checkbox', { name: 'Bildschirm wach halten' }).check();
  await expect.poll(wakeState).toEqual({ requests: 2, releases: 1 });
  await page.getByRole('button', { name: 'Später fortsetzen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Start', exact: true }),
  ).toBeVisible();
  await expect.poll(wakeState).toEqual({ requests: 2, releases: 2 });
});

async function readTrainingData(
  page: Page,
): Promise<{ results: ExerciseResult[]; sessions: WorkoutSession[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('fitness-glass');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB request failed'));
    });
    try {
      const read = <T>(name: string): Promise<T[]> =>
        new Promise((resolve, reject) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result as T[]);
          request.onerror = () =>
            reject(request.error ?? new Error('IndexedDB request failed'));
        });
      return {
        results: await read<ExerciseResult>('exerciseResults'),
        sessions: await read<WorkoutSession>('workoutSessions'),
      };
    } finally {
      db.close();
    }
  });
}
