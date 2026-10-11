import { confirmAction, saveBackup } from '../platform/desktop';
import {
  button,
  element,
  field,
  formatDate,
  statusMessage,
} from '../components/dom';
import type { EquipmentType, Exercise, ExerciseSlot } from '../domain';
import {
  MAX_IMPORT_BYTES,
  type PreparedImport,
} from '../services/backup-service';
import { prepareExerciseImage } from '../services/exercise-image-service';
import type { TemplatePlan } from '../services/fitness-service';
import type { ViewContext } from './context';

export async function createSettingsView(
  context: ViewContext,
): Promise<HTMLElement> {
  const section = element('section', { className: 'stack settings' });
  section.append(
    element('h1', { text: 'Einstellungen' }),
    element('p', {
      className: 'lead',
      text: 'Trainingspläne, Übungen und lokale Sicherungen verwalten.',
    }),
  );
  const [plans, exercises] = await Promise.all([
    context.fitness.listPlans(true),
    context.fitness.repositories.exercises.list(true),
  ]);
  section.append(
    createTemplateSettings(context, plans, exercises),
    createExerciseSettings(context, exercises),
    createBackupSettings(context),
    createPrivacyCard(),
  );
  return section;
}

function createTemplateSettings(
  context: ViewContext,
  plans: TemplatePlan[],
  exercises: Exercise[],
): HTMLElement {
  const group = element('section', { className: 'stack settings-group' });
  group.append(element('h2', { text: 'Trainingspläne' }));
  for (const plan of plans) {
    const details = element('details', { className: 'card settings-card' });
    details.dataset.templateName = plan.template.name;
    const summary = element('summary', {
      text: `${plan.template.name}${plan.template.active ? '' : ' (deaktiviert)'}`,
    });
    details.append(summary);
    const templateForm = element('form', { className: 'settings-form' });
    const name = element('input');
    name.value = plan.template.name;
    name.required = true;
    name.maxLength = 120;
    const active = element('input');
    active.type = 'checkbox';
    active.checked = plan.template.active;
    const message = element('div');
    const save = button('Plan speichern', 'button', 'submit');
    templateForm.append(
      field('Name', name),
      checkboxLabel(active, 'Plan auf der Startseite anzeigen'),
      message,
      save,
    );
    templateForm.addEventListener(
      'submit',
      asyncListener(async (event) => {
        event.preventDefault();
        try {
          await context.fitness.updateTemplate(plan.template, {
            name: name.value,
            active: active.checked,
          });
          await context.refresh();
        } catch (error) {
          message.replaceChildren(statusMessage(toMessage(error), 'error'));
        }
      }),
    );
    details.append(templateForm);
    for (const { slot } of plan.slots) {
      details.append(createSlotEditor(context, plan, slot, exercises));
    }
    group.append(details);
  }
  return group;
}

function createSlotEditor(
  context: ViewContext,
  plan: TemplatePlan,
  slot: ExerciseSlot,
  exercises: Exercise[],
): HTMLElement {
  const card = element('form', { className: 'slot-editor' });
  card.dataset.testid = `slot-editor-${slot.id}`;
  card.append(element('h3', { text: `${slot.order}. ${slot.label}` }));
  const eligible = exercises.filter(
    ({ movementCategory }) => movementCategory === slot.movementCategory,
  );
  const primary = element('select');
  for (const exercise of eligible) {
    const option = element('option', {
      text: `${exercise.name}${exercise.active ? '' : ' (deaktiviert)'}`,
    });
    option.value = exercise.id;
    option.selected = exercise.id === slot.primaryExerciseId;
    primary.append(option);
  }
  const alternatives = element('fieldset', { className: 'checkbox-group' });
  alternatives.append(element('legend', { text: 'Alternativen' }));
  for (const exercise of eligible) {
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'alternative';
    checkbox.value = exercise.id;
    checkbox.checked = slot.alternativeExerciseIds.includes(exercise.id);
    checkbox.disabled = exercise.id === slot.primaryExerciseId;
    alternatives.append(
      checkboxLabel(
        checkbox,
        `${exercise.name}${exercise.active ? '' : ' (deaktiviert)'}`,
      ),
    );
  }
  primary.addEventListener('change', () => {
    alternatives
      .querySelectorAll<HTMLInputElement>('input')
      .forEach((checkbox) => {
        checkbox.disabled = checkbox.value === primary.value;
        if (checkbox.disabled) checkbox.checked = false;
      });
  });
  const active = element('input');
  active.type = 'checkbox';
  active.checked = slot.active;
  const actions = element('div', { className: 'button-row' });
  const up = button('Nach oben', 'button button--small');
  up.disabled =
    slot.order === Math.min(...plan.slots.map(({ slot: item }) => item.order));
  up.addEventListener(
    'click',
    asyncListener(async () => {
      await runAndRefresh(context, card, () =>
        context.fitness.moveSlot(plan, slot.id, -1),
      );
    }),
  );
  const down = button('Nach unten', 'button button--small');
  down.disabled =
    slot.order === Math.max(...plan.slots.map(({ slot: item }) => item.order));
  down.addEventListener(
    'click',
    asyncListener(async () => {
      await runAndRefresh(context, card, () =>
        context.fitness.moveSlot(plan, slot.id, 1),
      );
    }),
  );
  actions.append(up, down);
  const message = element('div', { className: 'form-message' });
  const save = button('Übungsplatz speichern', 'button', 'submit');
  card.append(
    field('Hauptübung', primary),
    alternatives,
    checkboxLabel(active, 'Übungsplatz aktiv'),
    actions,
    message,
    save,
  );
  card.addEventListener(
    'submit',
    asyncListener(async (event) => {
      event.preventDefault();
      const ids = [
        ...alternatives.querySelectorAll<HTMLInputElement>('input:checked'),
      ].map(({ value }) => value);
      await runAndRefresh(context, message, () =>
        context.fitness.updateSlot({
          ...slot,
          primaryExerciseId: primary.value,
          alternativeExerciseIds: ids.filter((id) => id !== primary.value),
          active: active.checked,
        }),
      );
    }),
  );
  return card;
}

function createExerciseSettings(
  context: ViewContext,
  exercises: Exercise[],
): HTMLElement {
  const group = element('section', { className: 'stack settings-group' });
  group.append(element('h2', { text: 'Übungen' }));
  const details = element('details', { className: 'card settings-card' });
  details.dataset.testid = 'create-exercise-details';
  details.append(element('summary', { text: 'Übung hinzufügen' }));
  const form = element('form', { className: 'settings-form' });
  form.dataset.testid = 'create-exercise';
  const name = element('input');
  name.required = true;
  name.maxLength = 120;
  const muscle = element('input');
  muscle.required = true;
  muscle.maxLength = 80;
  const category = element('input');
  category.required = true;
  category.maxLength = 80;
  category.setAttribute('list', 'movement-categories');
  const categories = element('datalist', { id: 'movement-categories' });
  for (const value of [
    ...new Set(exercises.map(({ movementCategory }) => movementCategory)),
  ]) {
    const option = element('option');
    option.value = value;
    categories.append(option);
  }
  const equipment = element('select');
  const equipmentLabels: Record<EquipmentType, string> = {
    bodyweight: 'Körpergewicht',
    'free-weight': 'Freies Gewicht',
    machine: 'Maschine',
    cable: 'Kabelzug',
  };
  for (const [value, label] of Object.entries(equipmentLabels)) {
    const option = element('option', { text: label });
    option.value = value;
    equipment.append(option);
  }
  const increment = element('input');
  increment.type = 'number';
  increment.inputMode = 'decimal';
  increment.min = '0.01';
  increment.max = '1000';
  increment.step = 'any';
  increment.value = '2.5';
  increment.required = true;
  const message = element('div');
  form.append(
    field('Name', name),
    field('Muskelgruppe', muscle),
    field(
      'Bewegungskategorie',
      category,
      'Einer vorhandenen Slot-Kategorie zuordnen',
    ),
    categories,
    field('Geräteart', equipment),
    field('Gewichtsschritt (kg)', increment),
    message,
    button('Übung hinzufügen', 'button button--primary', 'submit'),
  );
  form.addEventListener(
    'submit',
    asyncListener(async (event) => {
      event.preventDefault();
      try {
        await context.fitness.createExercise({
          name: name.value,
          muscleGroup: muscle.value,
          movementCategory: category.value,
          equipmentType: equipment.value as EquipmentType,
          weightIncrementKg: Number(increment.value),
        });
        await context.refresh();
      } catch (error) {
        message.replaceChildren(statusMessage(toMessage(error), 'error'));
      }
    }),
  );
  details.append(form);
  group.append(details);

  const list = element('div', { className: 'card exercise-list' });
  for (const exercise of [...exercises].sort((a, b) =>
    a.name.localeCompare(b.name, 'de'),
  )) {
    const row = element('details', { className: 'exercise-row' });
    const rowSummary = element('summary');
    const copy = element('div');
    copy.append(
      element('strong', { text: exercise.name }),
      element('span', {
        className: 'muted',
        text: `${exercise.muscleGroup} · ${exercise.movementCategory}${exercise.active ? '' : ' · deaktiviert'}`,
      }),
    );
    rowSummary.append(exerciseThumbnail(exercise), copy);
    const edit = element('form', { className: 'exercise-edit' });
    const editName = element('input');
    editName.value = exercise.name;
    editName.required = true;
    editName.maxLength = 120;
    const editMuscle = element('input');
    editMuscle.value = exercise.muscleGroup;
    editMuscle.required = true;
    editMuscle.maxLength = 80;
    const editIncrement = element('input');
    editIncrement.type = 'number';
    editIncrement.inputMode = 'decimal';
    editIncrement.min = '0.01';
    editIncrement.max = '1000';
    editIncrement.step = 'any';
    editIncrement.required = true;
    editIncrement.value = String(exercise.weightIncrementKg);
    const editActive = element('input');
    editActive.type = 'checkbox';
    editActive.checked = exercise.active;
    const editMessage = element('div');
    const imageInput = element('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/*';
    const cameraInput = element('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.setAttribute('capture', 'environment');
    const saveSelectedImage = async (file: File | undefined): Promise<void> => {
      if (!file) return;
      try {
        await context.fitness.updateExerciseImage(
          exercise,
          await prepareExerciseImage(file),
        );
        await context.refresh();
      } catch (error) {
        editMessage.replaceChildren(statusMessage(toMessage(error), 'error'));
      }
    };
    imageInput.addEventListener(
      'change',
      asyncListener(() => saveSelectedImage(imageInput.files?.[0])),
    );
    cameraInput.addEventListener(
      'change',
      asyncListener(() => saveSelectedImage(cameraInput.files?.[0])),
    );
    const imageActions = element('div', { className: 'button-row' });
    const removeImage = button(
      'Bild entfernen',
      'button button--danger-quiet button--small',
    );
    removeImage.disabled = !exercise.image;
    removeImage.addEventListener(
      'click',
      asyncListener(async () => {
        await runAndRefresh(context, editMessage, () =>
          context.fitness.updateExerciseImage(exercise, null),
        );
      }),
    );
    imageActions.append(removeImage);
    edit.append(
      field('Name', editName),
      field('Muskelgruppe', editMuscle),
      field('Gewichtsschritt (kg)', editIncrement),
      field(
        exercise.image ? 'Bild aus Mediathek ersetzen' : 'Bild aus Mediathek',
        imageInput,
        'Wird vor dem lokalen Speichern verkleinert',
      ),
      field('Foto aufnehmen', cameraInput),
      imageActions,
      checkboxLabel(editActive, 'Übung aktiv'),
      element('p', {
        className: 'field__hint',
        text: `Geräteart und Kategorie bleiben zum Schutz des Verlaufs unverändert: ${exercise.movementCategory}.`,
      }),
      editMessage,
      button('Übung speichern', 'button button--small', 'submit'),
    );
    edit.addEventListener(
      'submit',
      asyncListener(async (event) => {
        event.preventDefault();
        try {
          await context.fitness.updateExercise(exercise, {
            name: editName.value,
            muscleGroup: editMuscle.value,
            weightIncrementKg: Number(editIncrement.value),
            active: editActive.checked,
          });
          await context.refresh();
        } catch (error) {
          editMessage.replaceChildren(statusMessage(toMessage(error), 'error'));
        }
      }),
    );
    row.append(rowSummary, edit);
    list.append(row);
  }
  group.append(list);
  return group;
}

function exerciseThumbnail(exercise: Exercise): HTMLElement {
  if (!exercise.image) {
    return element('span', {
      className: 'exercise-image exercise-image--empty',
      text: exercise.name.slice(0, 1),
    });
  }
  const image = element('img', { className: 'exercise-image' });
  image.src = exercise.image.thumbnailDataUrl;
  image.alt = '';
  return image;
}

function createBackupSettings(context: ViewContext): HTMLElement {
  const group = element('section', { className: 'stack settings-group' });
  group.append(element('h2', { text: 'Sicherung' }));
  const card = element('div', { className: 'card stack' });
  card.append(
    element('p', {
      text: 'Die JSON-Datei enthält alle Trainingsdaten im Klartext. Bewahre sie sicher auf.',
    }),
  );
  const exportButton = button(
    'Alle Daten exportieren',
    'button button--primary',
  );
  const messages = element('div');
  exportButton.addEventListener(
    'click',
    asyncListener(async () => {
      try {
        const json = await context.backup.createJson();
        if (!(await saveBackup(json, backupFilename('fitness-glass')))) return;
        messages.replaceChildren(
          statusMessage('Sicherung wurde erstellt.', 'success'),
        );
      } catch (error) {
        messages.replaceChildren(statusMessage(toMessage(error), 'error'));
      }
    }),
  );

  const input = element('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  const importHost = element('div');
  input.addEventListener(
    'change',
    asyncListener(async () => {
      importHost.replaceChildren();
      const file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_IMPORT_BYTES)
          throw new Error('Die Datei ist größer als 50 MiB.');
        showPreparedImport(
          context,
          context.backup.prepareImport(await file.text()),
          importHost,
        );
      } catch (error) {
        importHost.append(statusMessage(toMessage(error), 'error'));
      }
    }),
  );
  card.append(
    exportButton,
    messages,
    field(
      'Sicherung importieren',
      input,
      'Maximal 50 MiB; vorhandene Daten werden erst nach Bestätigung ersetzt.',
    ),
    importHost,
  );
  group.append(card);
  return group;
}

function showPreparedImport(
  context: ViewContext,
  prepared: PreparedImport,
  host: HTMLElement,
): void {
  const summary = element('div', { className: 'import-summary' });
  summary.append(
    element('h3', { text: 'Gültige Sicherung' }),
    element('p', {
      text: `${prepared.summary.exercises} Übungen, ${prepared.summary.templates} Pläne, ${prepared.summary.sessions} Trainings, ${prepared.summary.results} Ergebnisse · Export ${formatDate(prepared.summary.exportedAt)}`,
    }),
  );
  const confirm = button('Sicherung importieren', 'button button--danger');
  confirm.addEventListener(
    'click',
    asyncListener(async () => {
      if (
        !(await confirmAction(
          'Alle aktuellen Daten durch diese Sicherung ersetzen? Wähle zuerst einen Speicherort für die Sicherung der aktuellen Daten. Beim Abbrechen bleiben alle Daten erhalten.',
        ))
      )
        return;
      confirm.disabled = true;
      try {
        const preImport = await context.backup.createJson();
        if (!(await saveBackup(preImport, backupFilename('vor-import')))) {
          confirm.disabled = false;
          return;
        }
        await context.backup.replace(prepared);
        host.replaceChildren(
          statusMessage('Import erfolgreich abgeschlossen.', 'success'),
        );
        window.setTimeout(() => void context.refresh(), 500);
      } catch (error) {
        host.append(statusMessage(toMessage(error), 'error'));
        confirm.disabled = false;
      }
    }),
  );
  summary.append(confirm);
  host.append(summary);
}

function createPrivacyCard(): HTMLElement {
  const card = element('section', { className: 'card' });
  card.append(
    element('h2', { text: 'Datenschutz auf diesem Gerät' }),
    element('p', {
      text: 'Alle Daten bleiben lokal im App-Speicher dieses Geräts. Wer Zugriff auf das entsperrte Gerät oder eine exportierte Datei hat, kann die Trainingsdaten lesen. Die lokale Datenbank ist nicht zusätzlich verschlüsselt.',
    }),
  );
  return card;
}

function checkboxLabel(
  input: HTMLInputElement,
  text: string,
): HTMLLabelElement {
  const label = element('label', { className: 'checkbox' });
  label.append(input, element('span', { text }));
  return label;
}

async function runAndRefresh(
  context: ViewContext,
  host: HTMLElement,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
    await context.refresh();
  } catch (error) {
    const existing = host.querySelector('.status');
    existing?.remove();
    host.append(statusMessage(toMessage(error), 'error'));
  }
}

function backupFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
}

function toMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Die Aktion ist fehlgeschlagen.';
}

function asyncListener<T extends Event>(
  listener: (event: T) => Promise<void>,
): (event: T) => void {
  return (event) => void listener(event);
}
