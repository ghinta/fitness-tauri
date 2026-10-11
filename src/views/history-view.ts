import { routeQuery } from '../app/router';
import {
  element,
  formatDate,
  formatWeight,
  statusMessage,
} from '../components/dom';
import type { ExerciseResult } from '../domain';
import type { HistorySession } from '../services/fitness-service';
import type { ViewContext } from './context';

export async function createHistoryView(
  context: ViewContext,
): Promise<HTMLElement> {
  const query = routeQuery();
  const exerciseId = query.get('exercise');
  const sessionId = query.get('session');
  if (exerciseId) return createExerciseHistory(context, exerciseId);
  const history = await context.fitness.listHistory();
  if (sessionId) {
    return createSessionDetail(
      history.find(({ session }) => session.id === sessionId),
    );
  }

  const section = element('section', { className: 'stack' });
  section.append(
    element('h1', { text: 'Verlauf' }),
    element('p', {
      className: 'lead',
      text: 'Abgeschlossene Trainings, neueste zuerst.',
    }),
  );
  if (history.length === 0) {
    section.append(statusMessage('Noch kein Training abgeschlossen.'));
    return section;
  }
  for (const entry of history) {
    const link = element('a', { className: 'card history-card' });
    link.href = `#/verlauf?session=${encodeURIComponent(entry.session.id)}`;
    link.append(
      element('h2', { text: entry.session.templateNameSnapshot }),
      element('p', {
        text: formatDate(entry.session.completedAt ?? entry.session.startedAt),
      }),
      element('span', {
        className: 'muted',
        text: `${entry.results.filter(({ setType }) => setType === 'working').length} Arbeitssätze`,
      }),
    );
    section.append(link);
  }
  return section;
}

function createSessionDetail(entry: HistorySession | undefined): HTMLElement {
  const section = element('section', { className: 'stack' });
  const back = element('a', {
    className: 'back-link',
    text: '← Alle Trainings',
  });
  back.href = '#/verlauf';
  section.append(back);
  if (!entry) {
    section.append(element('h1', { text: 'Training nicht gefunden' }));
    return section;
  }
  section.append(
    element('h1', { text: entry.session.templateNameSnapshot }),
    element('p', {
      className: 'lead',
      text: formatDate(entry.session.completedAt ?? entry.session.startedAt),
    }),
  );
  const grouped = new Map<string, ExerciseResult[]>();
  for (const result of entry.results) {
    const values = grouped.get(result.exerciseSlotId) ?? [];
    values.push(result);
    grouped.set(result.exerciseSlotId, values);
  }
  for (const results of grouped.values()) {
    const working = results.find(({ setType }) => setType === 'working');
    if (!working) continue;
    const card = element('article', { className: 'card result-card' });
    const link = element('a', {
      className: 'result-card__title',
      text: working.exerciseNameSnapshot,
    });
    link.href = `#/verlauf?exercise=${encodeURIComponent(working.exerciseId)}`;
    card.append(link);
    const warmup = results.find(({ setType }) => setType === 'warmup');
    if (warmup) {
      card.append(
        element('p', {
          text: `Aufwärmen: ${formatWeight(warmup.weightKg)} · ${warmup.durationSeconds} s`,
        }),
      );
    }
    card.append(
      element('p', {
        text: `Arbeit: ${formatWeight(working.weightKg)} · ${working.durationSeconds} s`,
      }),
    );
    if (working.notes)
      card.append(element('p', { className: 'note', text: working.notes }));
    section.append(card);
  }
  return section;
}

async function createExerciseHistory(
  context: ViewContext,
  exerciseId: string,
): Promise<HTMLElement> {
  const results = await context.fitness.previousWorkingResults(exerciseId);
  const section = element('section', { className: 'stack' });
  const back = element('a', { className: 'back-link', text: '← Verlauf' });
  back.href = '#/verlauf';
  section.append(
    back,
    element('h1', {
      text: results[0]?.exerciseNameSnapshot ?? 'Übungsverlauf',
    }),
  );
  if (results.length === 0) {
    section.append(
      statusMessage('Keine Arbeitssätze für diese Übung gefunden.'),
    );
    return section;
  }
  const list = element('ol', { className: 'result-history card' });
  for (const result of results) {
    const item = element('li');
    item.append(
      element('strong', {
        text: `${formatWeight(result.weightKg)} · ${result.durationSeconds} s`,
      }),
      element('span', { text: formatDate(result.createdAt) }),
    );
    if (result.notes)
      item.append(element('span', { className: 'note', text: result.notes }));
    list.append(item);
  }
  section.append(list);
  return section;
}
