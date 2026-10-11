import { expect, test, type Page } from '@playwright/test';

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
