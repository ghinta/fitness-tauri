import { confirmAction } from '../platform/desktop';
import { navigate } from '../app/router';
import {
  button,
  element,
  field,
  formatDate,
  formatWeight,
  statusMessage,
} from '../components/dom';
import {
  recommendNextWeight,
  type Exercise,
  type ExerciseResult,
} from '../domain';
import type { ActiveWorkout } from '../services/fitness-service';
import type { ViewContext } from './context';

export async function createWorkoutView(
  context: ViewContext,
): Promise<HTMLElement> {
  const workout = await context.fitness.getActiveWorkout();
  if (!workout) {
    const empty = element('section', { className: 'stack' });
    empty.append(
      element('h1', { text: 'Kein aktives Training' }),
      statusMessage('Starte zuerst Training A oder Training B.'),
    );
    const home = button('Zur Startseite', 'button button--primary');
    home.addEventListener('click', () => navigate('/'));
    empty.append(home);
    return empty;
  }

  const slots = workout.plan.slots.filter(({ slot }) => slot.active);
  const workingBySlot = new Map(
    workout.results
      .filter(({ setType }) => setType === 'working')
      .map((result) => [result.exerciseSlotId, result]),
  );
  const currentIndex = slots.findIndex(
    ({ slot }) => !workingBySlot.has(slot.id),
  );
  return currentIndex === -1
    ? createReview(
        context,
        workout,
        slots.map(({ slot }) => workingBySlot.get(slot.id) as ExerciseResult),
      )
    : createStep(context, workout, currentIndex);
}

async function createStep(
  context: ViewContext,
  workout: ActiveWorkout,
  currentIndex: number,
): Promise<HTMLElement> {
  const activeSlots = workout.plan.slots.filter(({ slot }) => slot.active);
  const current = activeSlots[currentIndex];
  if (!current) throw new Error('Der aktuelle Übungsplatz fehlt.');
  const exerciseId = workout.session.exerciseSelections[current.slot.id];
  const exercise = current.exercises.find(({ id }) => id === exerciseId);
  if (!exercise) throw new Error('Die ausgewählte Übung fehlt.');
  const previous = await context.fitness.previousWorkingResults(exercise.id);
  const existingWarmup = workout.results.find(
    ({ exerciseSlotId, setType }) =>
      exerciseSlotId === current.slot.id && setType === 'warmup',
  );

  const section = element('section', { className: 'stack workout' });
  const header = element('header', { className: 'workout__header' });
  header.append(
    element('p', {
      className: 'eyebrow',
      text: `${workout.session.templateNameSnapshot} · Übung ${currentIndex + 1} von ${activeSlots.length}`,
    }),
    exerciseImage(exercise, 'exercise-image exercise-image--workout'),
    element('h1', { text: exercise.name }),
    element('p', { className: 'muted', text: current.slot.label }),
  );
  const progress = element('progress');
  progress.max = activeSlots.length;
  progress.value = currentIndex;
  progress.ariaLabel = 'Trainingsfortschritt';
  header.append(progress);
  const keepAwake = element('input');
  keepAwake.type = 'checkbox';
  keepAwake.checked = context.screenAwake.enabled;
  keepAwake.addEventListener('change', () => {
    void context.screenAwake.setEnabled(keepAwake.checked);
  });
  const wakeToggle = checkboxLabel(keepAwake, 'Bildschirm wach halten');
  wakeToggle.classList.add('wake-toggle');
  header.append(wakeToggle);
  section.append(header);

  section.append(
    createExerciseSelection(
      context,
      workout,
      current.slot,
      current.exercises,
      exercise,
      Boolean(
        existingWarmup ||
        workout.session.setTimer?.exerciseSlotId === current.slot.id,
      ),
    ),
  );

  if (existingWarmup) {
    const saved = element('article', { className: 'card card--compact' });
    saved.append(
      element('h2', { text: 'Aufwärmsatz gespeichert' }),
      element('p', {
        text: `${formatWeight(existingWarmup.weightKg)} · ${existingWarmup.durationSeconds} Sekunden`,
      }),
    );
    section.append(saved);
  } else {
    section.append(
      createSetForm(
        context,
        workout,
        current.slot,
        exercise,
        'warmup',
        previous[0],
      ),
    );
  }
  section.append(
    createSetForm(
      context,
      workout,
      current.slot,
      exercise,
      'working',
      previous[0],
    ),
    createPreviousCard(previous, exercise),
  );
  const leave = button('Später fortsetzen', 'button button--quiet');
  leave.addEventListener('click', () => {
    void (async () => {
      if (
        !document.querySelector('form[data-dirty="true"]') ||
        (await confirmAction(
          'Nicht gespeicherte Eingaben verwerfen und später fortsetzen?',
        ))
      ) {
        context.setDirty(false);
        navigate('/');
      }
    })();
  });
  section.append(leave);
  return section;
}

function createExerciseSelection(
  context: ViewContext,
  workout: ActiveWorkout,
  slot: ActiveWorkout['plan']['slots'][number]['slot'],
  exercises: Exercise[],
  selected: Exercise,
  locked: boolean,
): HTMLElement {
  const form = element('form', { className: 'card exercise-choice' });
  form.append(element('h2', { text: 'Übung auswählen' }));
  const choices = element('fieldset', { className: 'exercise-choice__list' });
  choices.append(
    element('legend', { className: 'visually-hidden', text: slot.label }),
  );
  for (const exercise of exercises.filter(
    ({ active, id }) => active || id === selected.id,
  )) {
    const input = element('input');
    input.type = 'radio';
    input.name = 'exercise';
    input.value = exercise.id;
    input.checked = exercise.id === selected.id;
    input.disabled = locked;
    const label = element('label', { className: 'exercise-choice__option' });
    label.append(
      input,
      exerciseImage(exercise),
      element('span', { text: exercise.name }),
    );
    choices.append(label);
  }
  const useDefault = element('input');
  useDefault.type = 'checkbox';
  useDefault.disabled = locked;
  const message = element('div');
  const save = button('Übung übernehmen', 'button button--small', 'submit');
  save.disabled = locked;
  form.append(
    choices,
    checkboxLabel(useDefault, 'Als Standard verwenden'),
    message,
    save,
  );
  if (locked) {
    message.append(
      statusMessage(
        'Die Auswahl ist nach dem ersten gespeicherten Satz fixiert.',
        'info',
      ),
    );
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      const choice = form.querySelector<HTMLInputElement>(
        'input[name="exercise"]:checked',
      );
      if (!choice) return;
      save.disabled = true;
      try {
        await context.fitness.selectExercise(
          workout.session,
          slot,
          choice.value,
          useDefault.checked,
        );
        await context.refresh();
      } catch (error) {
        message.replaceChildren(statusMessage(toMessage(error), 'error'));
        save.disabled = false;
      }
    })();
  });
  return form;
}

function createSetForm(
  context: ViewContext,
  workout: ActiveWorkout,
  slot: ActiveWorkout['plan']['slots'][number]['slot'],
  exercise: Exercise,
  setType: 'warmup' | 'working',
  previous?: ExerciseResult,
): HTMLFormElement {
  const isWarmup = setType === 'warmup';
  const form = element('form', {
    className: `card set-form ${isWarmup ? 'set-form--warmup' : 'card--accent'}`,
  });
  form.dataset.dirty = 'false';
  form.dataset.setType = setType;
  form.append(
    element('h2', {
      text: isWarmup ? 'Optionaler Aufwärmsatz' : 'Arbeitssatz',
    }),
  );

  const grid = element('div', { className: 'input-grid' });
  const weight = element('input');
  weight.type = 'number';
  weight.name = 'weight';
  weight.inputMode = 'decimal';
  weight.min = '0';
  weight.max = '100000';
  weight.step = 'any';
  weight.placeholder = 'optional';
  if (previous?.weightKg !== null && previous?.weightKg !== undefined)
    weight.value = String(previous.weightKg);

  const duration = element('input');
  duration.type = 'number';
  duration.name = 'duration';
  duration.inputMode = 'numeric';
  duration.min = '1';
  duration.max = '86400';
  duration.step = '1';
  duration.required = true;
  duration.placeholder = 'Automatisch';
  const initialTimer = workout.session.setTimer;
  const ownsInitialTimer =
    initialTimer?.exerciseSlotId === slot.id &&
    initialTimer.setType === setType;
  if (ownsInitialTimer) {
    weight.value =
      initialTimer.weightKg === null ? '' : String(initialTimer.weightKg);
    if (initialTimer.durationSeconds !== null)
      duration.value = String(initialTimer.durationSeconds);
  }
  grid.append(
    field(
      exercise.equipmentType === 'bodyweight'
        ? 'Zusatzgewicht (kg)'
        : 'Gewicht (kg)',
      weight,
      'Optional – du kannst direkt starten.',
    ),
    field('Dauer (s)', duration, 'Nach dem Stoppen bei Bedarf korrigierbar'),
  );
  const timerBox = element('div', { className: 'set-timer' });
  const timerDisplay = element('output', {
    className: 'set-timer__display',
    text: '0 s',
  });
  timerDisplay.dataset.timerDisplay = 'true';
  timerDisplay.setAttribute('aria-live', 'off');
  const timerHint = element('p', {
    className: 'set-timer__hint',
    text: 'Zielbereich: 60–90 Sekunden',
  });
  const timerActions = element('div', { className: 'button-row' });
  const start = button('Start', 'button button--timer-start');
  const stop = button('Stop', 'button button--timer-stop');
  stop.dataset.timerControl = 'stop';
  const notes = element('textarea');
  notes.name = 'notes';
  notes.rows = 2;
  notes.maxLength = 2000;
  if (ownsInitialTimer) notes.value = initialTimer.notes;
  const messages = element('div');
  const save = button(
    isWarmup ? 'Aufwärmsatz speichern' : 'Arbeitssatz speichern & weiter',
    isWarmup ? 'button' : 'button button--primary',
    'submit',
  );
  let interval: number | undefined;
  const syncTimer = (): void => {
    if (interval !== undefined) window.clearInterval(interval);
    interval = undefined;
    const timer = workout.session.setTimer;
    const ownsTimer =
      timer?.exerciseSlotId === slot.id && timer.setType === setType;
    const running = ownsTimer && timer.stoppedAt === null;
    start.disabled = Boolean(timer);
    start.hidden = Boolean(ownsTimer);
    stop.hidden = !ownsTimer;
    stop.disabled = !running;
    stop.textContent = running ? 'Stop' : 'Gestoppt';
    stop.classList.toggle('button--timer-stop', Boolean(running));
    duration.readOnly = !ownsTimer || running;
    weight.readOnly = Boolean(running);
    save.disabled = !ownsTimer || timer.durationSeconds === null;
    if (ownsTimer) {
      if (timer.durationSeconds !== null)
        duration.value = String(timer.durationSeconds);
      updateTimerDisplay(
        timerDisplay,
        timerHint,
        timer.startedAt,
        timer.durationSeconds,
      );
      if (running)
        interval = window.setInterval(() => {
          if (!timerDisplay.isConnected) {
            window.clearInterval(interval);
            interval = undefined;
            return;
          }
          updateTimerDisplay(timerDisplay, timerHint, timer.startedAt, null);
        }, 250);
    }
  };
  // Update both set controls without replacing the forms, losing drafts, or scrolling.
  const notifyTimerChanged = (): void => {
    form
      .closest('.workout')
      ?.querySelectorAll<HTMLFormElement>('form[data-set-type]')
      .forEach((setForm) =>
        setForm.dispatchEvent(new Event('set-timer-changed')),
      );
    context.setTimerRunning(workout.session.setTimer?.stoppedAt === null);
  };
  const updateDirty = (): void =>
    context.setDirty(
      Boolean(
        form.closest('.workout')?.querySelector('form[data-dirty="true"]'),
      ),
    );
  form.addEventListener('set-timer-changed', syncTimer);
  form.addEventListener('timer-resume', syncTimer);
  syncTimer();
  start.addEventListener('click', () => {
    void (async () => {
      if (!weight.reportValidity()) return;
      start.disabled = true;
      messages.replaceChildren();
      try {
        await context.fitness.startTimer(
          workout.session,
          slot,
          setType,
          weight.value.trim() === '' ? null : Number(weight.value),
          notes.value,
        );
        const active = await context.fitness.getActiveWorkout();
        if (!active)
          throw new Error('Das aktive Training wurde nicht gefunden.');
        workout.session = active.session;
        form.dataset.dirty = 'false';
        updateDirty();
        form
          .closest('.workout')
          ?.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
            '.exercise-choice input, .exercise-choice button',
          )
          .forEach((control) => {
            control.disabled = true;
          });
        notifyTimerChanged();
        stop.focus({ preventScroll: true });
      } catch (error) {
        messages.replaceChildren(statusMessage(toMessage(error), 'error'));
        start.disabled = false;
      }
    })();
  });
  stop.addEventListener('click', () => {
    void (async () => {
      stop.disabled = true;
      try {
        const measured = await context.fitness.stopTimer(workout.session);
        if (workout.session.setTimer)
          workout.session.setTimer = {
            ...workout.session.setTimer,
            durationSeconds: measured,
            stoppedAt: new Date().toISOString(),
          };
        notifyTimerChanged();
        save.focus({ preventScroll: true });
      } catch (error) {
        messages.replaceChildren(statusMessage(toMessage(error), 'error'));
        stop.disabled = false;
      }
    })();
  });
  timerActions.append(start, stop);
  timerBox.append(timerDisplay, timerHint, timerActions);
  form.append(grid, timerBox, field('Notiz (optional)', notes), messages, save);
  form.addEventListener('input', () => {
    form.dataset.dirty = 'true';
    context.setDirty(true);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      messages.replaceChildren();
      save.disabled = true;
      try {
        const result = await context.fitness.saveSet(workout.session, slot, {
          setType,
          weightKg: weight.value.trim() === '' ? null : Number(weight.value),
          durationSeconds: Number(duration.value),
          notes: notes.value,
        });
        form.dataset.dirty = 'false';
        if (isWarmup) {
          // Keep the work set and any values entered there in place.
          workout.session.setTimer = null;
          workout.results.push(result);
          const saved = element('article', { className: 'card card--compact' });
          saved.append(
            element('h2', { text: 'Aufwärmsatz gespeichert' }),
            element('p', {
              text: `${formatWeight(result.weightKg)} · ${result.durationSeconds} Sekunden`,
            }),
          );
          const section = form.closest('.workout');
          form.replaceWith(saved);
          section
            ?.querySelectorAll<HTMLFormElement>('form[data-set-type]')
            .forEach((setForm) =>
              setForm.dispatchEvent(new Event('set-timer-changed')),
            );
          context.setTimerRunning(false);
          context.setDirty(
            Boolean(section?.querySelector('form[data-dirty="true"]')),
          );
        } else {
          context.setDirty(false);
          context.setTimerRunning(false);
          await context.refresh();
        }
      } catch (error) {
        messages.append(statusMessage(toMessage(error), 'error'));
        save.disabled = false;
        form
          .querySelector<HTMLElement>('input:invalid, textarea:invalid')
          ?.focus({ preventScroll: true });
      }
    })();
  });
  return form;
}

function updateTimerDisplay(
  output: HTMLOutputElement,
  hint: HTMLElement,
  startedAt: string,
  fixedDuration: number | null,
): void {
  const seconds =
    fixedDuration ??
    Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  output.textContent = `${seconds} s`;
  output.classList.toggle(
    'set-timer__display--target',
    seconds >= 60 && seconds < 90,
  );
  output.classList.toggle('set-timer__display--upper', seconds >= 90);
  hint.textContent =
    seconds >= 90
      ? '90 Sekunden erreicht – Timer läuft weiter.'
      : seconds >= 60
        ? 'Zielbereich erreicht.'
        : 'Zielbereich: 60–90 Sekunden';
}

function exerciseImage(
  exercise: Exercise,
  className = 'exercise-image',
): HTMLElement {
  if (!exercise.image)
    return element('span', {
      className: `${className} exercise-image--empty`,
      text: exercise.name.slice(0, 1),
    });
  const image = element('img', { className });
  image.src = className.includes('--workout')
    ? exercise.image.dataUrl
    : exercise.image.thumbnailDataUrl;
  image.alt = '';
  return image;
}

function checkboxLabel(
  input: HTMLInputElement,
  text: string,
): HTMLLabelElement {
  const label = element('label', { className: 'checkbox' });
  label.append(input, element('span', { text }));
  return label;
}

function createPreviousCard(
  previous: ExerciseResult[],
  exercise: Exercise,
): HTMLElement {
  const card = element('article', { className: 'card' });
  card.append(element('h2', { text: 'Bisherige Ergebnisse' }));
  if (previous.length === 0) {
    card.append(
      element('p', {
        className: 'muted',
        text: 'Noch kein Arbeitssatz gespeichert.',
      }),
    );
    return card;
  }
  const list = element('ul', { className: 'result-list' });
  for (const result of previous.slice(0, 5)) {
    const item = element('li');
    item.append(
      element('strong', {
        text: `${formatWeight(result.weightKg)} · ${result.durationSeconds} s`,
      }),
      element('span', { text: formatDate(result.createdAt) }),
    );
    list.append(item);
  }
  card.append(
    list,
    recommendationText(previous[0] as ExerciseResult, exercise),
  );
  return card;
}

function recommendationText(
  result: ExerciseResult,
  exercise: Exercise,
): HTMLElement {
  if (result.weightKg === null && exercise.equipmentType !== 'bodyweight') {
    return statusMessage(
      'Kein Gewicht erfasst. Für eine Gewichtsempfehlung kannst du beim nächsten Mal ein Gewicht angeben.',
    );
  }
  const recommendation = recommendNextWeight(
    result.weightKg,
    result.durationSeconds,
    exercise.weightIncrementKg,
  );
  let text: string;
  if (recommendation.action === 'increase') {
    text =
      recommendation.suggestedWeightKg === null
        ? 'Über 90 Sekunden: Beim nächsten Mal die Schwierigkeit bzw. das Zusatzgewicht um etwa 2,5 % erhöhen.'
        : `Über 90 Sekunden: Nächstes Mal unverbindlich ${formatWeight(recommendation.suggestedWeightKg)} (+2,5 %) versuchen.`;
  } else if (recommendation.durationBand === 'below-target') {
    text =
      'Unter 60 Sekunden: Gewicht zunächst beibehalten; bei unsauberer Ausführung reduzieren.';
  } else {
    text = '60–90 Sekunden: Gewicht beim nächsten Mal beibehalten.';
  }
  return statusMessage(text, 'info');
}

function createReview(
  context: ViewContext,
  workout: ActiveWorkout,
  workingResults: ExerciseResult[],
): HTMLElement {
  const section = element('section', { className: 'stack' });
  section.append(
    element('p', {
      className: 'eyebrow',
      text: workout.session.templateNameSnapshot,
    }),
    element('h1', { text: 'Training prüfen' }),
    element('p', {
      className: 'lead',
      text: `Alle ${workingResults.length} Arbeitssätze sind gespeichert.`,
    }),
  );
  const list = element('ol', { className: 'review-list card' });
  for (const result of workingResults) {
    const item = element('li');
    item.append(
      element('strong', { text: result.exerciseNameSnapshot }),
      element('span', {
        text: `${formatWeight(result.weightKg)} · ${result.durationSeconds} Sekunden`,
      }),
    );
    const exercise = workout.plan.slots
      .flatMap(({ exercises }) => exercises)
      .find(({ id }) => id === result.exerciseId);
    if (exercise) item.append(recommendationText(result, exercise));
    list.append(item);
  }
  const messages = element('div');
  const complete = button('Training abschließen', 'button button--primary');
  complete.addEventListener('click', () => {
    void (async () => {
      complete.disabled = true;
      try {
        await context.fitness.completeWorkout(workout.session.id);
        context.setDirty(false);
        navigate('/verlauf');
      } catch (error) {
        messages.append(statusMessage(toMessage(error), 'error'));
        complete.disabled = false;
      }
    })();
  });
  section.append(list, messages, complete);
  return section;
}

function toMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Das Ergebnis konnte nicht gespeichert werden.';
}
