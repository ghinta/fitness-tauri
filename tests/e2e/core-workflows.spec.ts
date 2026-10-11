import { expect, test, type Locator, type Page } from '@playwright/test';

test('completes Training A, resumes after reload, and shows alternative history', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-07-19T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-07-19T12:01:00Z'));
  await page.goto('./#/');
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
  await page.getByRole('button', { name: 'Training starten' }).first().click();

  await expect(page.getByRole('heading', { name: 'Kniebeuge' })).toBeVisible();
  await saveWorkingSet(page, '50', 91, 'Saubere Ausführung');

  await expect(
    page.getByRole('heading', { name: 'Liegestütze' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Bankdrücken' }).check();
  await page.getByRole('button', { name: 'Übung übernehmen' }).click();
  await expect(
    page.getByRole('heading', { name: 'Bankdrücken' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Bankdrücken' }),
  ).toBeVisible();
  await saveWorkingSet(page, '40', 75);
  await expect(
    page.getByRole('heading', { name: 'Langhantelrudern' }),
  ).toBeVisible();
  await saveWorkingSet(page, '45', 75);
  await expect(page.getByRole('heading', { name: 'Beinbeuger' })).toBeVisible();
  await saveWorkingSet(page, '35', 75);
  await expect(
    page.getByRole('heading', { name: 'Hängendes Beinheben' }),
  ).toBeVisible();
  await saveWorkingSet(page, '', 75);
  await expect(
    page.getByRole('heading', { name: 'Trizepsdrücken am Kabelzug' }),
  ).toBeVisible();
  await saveWorkingSet(page, '20', 75);

  await expect(
    page.getByRole('heading', { name: 'Training prüfen' }),
  ).toBeVisible();
  await expect(page.getByText(/Nächstes Mal unverbindlich/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Training abschließen' }).click();

  await expect(page.getByRole('heading', { name: 'Verlauf' })).toBeVisible();
  await page.getByRole('link', { name: /Training A/ }).click();
  await expect(page.getByRole('link', { name: 'Bankdrücken' })).toBeVisible();
  await page.getByRole('link', { name: 'Bankdrücken' }).click();
  await expect(
    page.getByRole('heading', { name: 'Bankdrücken' }),
  ).toBeVisible();
  await expect(page.getByText('40 kg · 75 s')).toBeVisible();
});

test('persists an optional warmup and running timer after reload', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-07-19T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-07-19T12:01:00Z'));
  await page.goto('./#/');
  await page.getByRole('button', { name: 'Training starten' }).first().click();
  await expect(page.getByRole('heading', { name: 'Kniebeuge' })).toBeVisible();

  const warmup = formWithHeading(page, 'Optionaler Aufwärmsatz');
  await warmup.locator('input[name="weight"]').fill('20');
  await warmup.getByRole('button', { name: 'Start' }).click();
  const runningWarmup = formWithHeading(page, 'Optionaler Aufwärmsatz');
  await expect(
    runningWarmup.getByRole('button', { name: 'Stop' }),
  ).toBeFocused();
  await expect(
    runningWarmup.getByText('0 s', { exact: true }),
  ).toBeInViewport();

  // The app may be restored from sleep without a full reload.
  // The resumed view must expose fresh controls for the persisted timer.
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    );
  });
  await page.clock.fastForward(30_000);
  await page.reload();
  const resumedWarmup = formWithHeading(page, 'Optionaler Aufwärmsatz');
  await expect(resumedWarmup.getByText('30 s')).toBeVisible();
  await resumedWarmup.getByRole('button', { name: 'Stop' }).click();
  await expect(resumedWarmup.locator('input[name="duration"]')).toHaveValue(
    '30',
  );
  await resumedWarmup
    .getByRole('button', { name: 'Aufwärmsatz speichern' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Aufwärmsatz gespeichert' }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kniebeuge' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Aufwärmsatz gespeichert' }),
  ).toBeVisible();
});

test('exports, validates, confirms, and restores a complete backup', async ({
  page,
}) => {
  await page.goto('./#/einstellungen');
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Alle Daten exportieren' }).click();
  const exportPath = await (await exportDownload).path();
  expect(exportPath).not.toBeNull();

  const fileInput = page.getByLabel('Sicherung importieren');
  await fileInput.setInputFiles(exportPath);
  await expect(
    page.getByRole('heading', { name: 'Gültige Sicherung' }),
  ).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  const preImportDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Sicherung importieren', exact: true })
    .click();
  await preImportDownload;
  await expect(
    page.getByText('Import erfolgreich abgeschlossen.'),
  ).toBeVisible();

  await fileInput.setInputFiles({
    name: 'ungueltig.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"falsch"}'),
  });
  await expect(page.getByRole('alert')).toContainText('Sicherungsformat');
  await page.getByRole('link', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Training A' })).toBeVisible();
});

test('creates a custom exercise and adds it to a configured slot', async ({
  page,
}) => {
  await page.goto('./#/einstellungen');
  const createDetails = page.getByTestId('create-exercise-details');
  await createDetails.locator('summary').click();
  const createForm = page.getByTestId('create-exercise');
  await expect(createForm).toBeVisible();
  await createForm.getByLabel('Name').fill('Hackenschmidt-Kniebeuge');
  await createForm.getByLabel('Muskelgruppe').fill('Beine');
  await createForm.getByLabel('Bewegungskategorie').fill('kniedominant');
  await createForm.getByLabel('Geräteart').selectOption('machine');
  await createForm.getByLabel('Gewichtsschritt (kg)').fill('5');
  await createForm
    .getByRole('button', { name: 'Übung hinzufügen', exact: true })
    .click();

  await expect(
    page.locator('strong').filter({ hasText: 'Hackenschmidt-Kniebeuge' }),
  ).toBeVisible();
  const trainingA = page.locator('details[data-template-name="Training A"]');
  await trainingA.locator('summary').click();
  const firstSlot = trainingA
    .locator('form.slot-editor')
    .filter({ hasText: '1. Beine' });
  await firstSlot
    .getByRole('checkbox', { name: 'Hackenschmidt-Kniebeuge', exact: true })
    .check();
  await firstSlot
    .getByRole('button', { name: 'Übungsplatz speichern' })
    .click();

  await page.getByRole('link', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Training starten' }).first().click();
  await expect(
    page.getByRole('radio', { name: 'Hackenschmidt-Kniebeuge' }),
  ).toBeVisible();
});

test('adds, replaces, and removes a locally resized exercise image', async ({
  page,
}) => {
  await page.goto('./#/einstellungen');
  const exerciseRow = () =>
    page
      .locator('details.exercise-row')
      .filter({ has: page.locator('summary').filter({ hasText: 'Kniebeuge' }) })
      .first();
  await exerciseRow().locator('summary').click();
  const image = {
    name: 'kniebeuge.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  };
  await exerciseRow().getByLabel('Bild aus Mediathek').setInputFiles(image);
  await expect(exerciseRow().locator('summary img')).toBeVisible();

  await exerciseRow().locator('summary').click();
  await exerciseRow()
    .getByLabel('Bild aus Mediathek ersetzen')
    .setInputFiles(image);
  await expect(exerciseRow().locator('summary img')).toBeVisible();
  await exerciseRow().locator('summary').click();
  await exerciseRow().getByRole('button', { name: 'Bild entfernen' }).click();
  await expect(exerciseRow().locator('summary img')).toHaveCount(0);
});

function formWithHeading(page: Page, heading: string): Locator {
  return page.locator('form').filter({
    has: page.getByRole('heading', { name: heading, exact: true }),
  });
}

async function saveWorkingSet(
  page: Page,
  weight: string,
  duration: number,
  notes = '',
): Promise<void> {
  const form = formWithHeading(page, 'Arbeitssatz');
  if (weight !== '') await form.locator('input[name="weight"]').fill(weight);
  await form.getByRole('button', { name: 'Start' }).click();
  await page.clock.fastForward(duration * 1000);
  await form.getByRole('button', { name: 'Stop' }).click();
  if (notes) await form.locator('textarea[name="notes"]').fill(notes);
  await form
    .getByRole('button', { name: 'Arbeitssatz speichern & weiter' })
    .click();
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
