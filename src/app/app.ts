import { createNavigation, updateNavigation } from '../components/navigation';
import { button, element, statusMessage } from '../components/dom';
import { BackupService } from '../services/backup-service';
import { FitnessService } from '../services/fitness-service';
import {
  createRepositories,
  FitnessDatabase,
  openFitnessDatabase,
} from '../storage';
import { createHistoryView } from '../views/history-view';
import { createSettingsView } from '../views/settings-view';
import { createStartView } from '../views/start-view';
import type {
  RefreshOptions,
  ViewContext,
  ViewFactory,
} from '../views/context';
import { createWorkoutView } from '../views/workout-view';
import { resolveRoute } from './router';
import { guardWindowClose, confirmAction } from '../platform/desktop';
import { createScreenAwake } from '../platform/screen-awake';
import { createToolbar } from '../components/toolbar';

export interface App {
  start(): Promise<void>;
  stop(): void;
}

export interface AppDependencies {
  database?: FitnessDatabase;
  fitness?: FitnessService;
  backup?: BackupService;
}

const views: Record<ReturnType<typeof resolveRoute>, ViewFactory> = {
  '/': createStartView,
  '/training': createWorkoutView,
  '/verlauf': createHistoryView,
  '/einstellungen': createSettingsView,
};

export function createApp(
  root: HTMLElement,
  dependencies: AppDependencies = {},
): App {
  root.replaceChildren();
  let stopped = false;
  let rendering = 0;
  let dirty = false;
  let runningTimer = false;
  let ready = false;
  let fitness = dependencies.fitness;
  let backup = dependencies.backup;

  const skipLink = element('a', {
    className: 'skip-link',
    text: 'Zum Inhalt springen',
  });
  skipLink.href = '#main-content';
  const header = element('header', { className: 'app-header' });
  header.append(createToolbar());
  const updateHost = element('div', { className: 'system-messages' });
  const screenAwake = createScreenAwake((status) => {
    updateHost.replaceChildren();
    if (status === 'unavailable')
      updateHost.append(
        statusMessage(
          'Der Bildschirm kann auf diesem Gerät gerade nicht automatisch wach gehalten werden.',
        ),
      );
  });
  const main = element('main', {
    className: 'app-content',
    id: 'main-content',
  });
  main.tabIndex = -1;
  const navigation = createNavigation();
  root.append(skipLink, header, updateHost, main, navigation);

  const refresh = async (options?: RefreshOptions): Promise<void> =>
    render(options);
  const context = (): ViewContext => {
    if (!fitness || !backup)
      throw new Error('Die Anwendung ist nicht initialisiert.');
    return {
      fitness,
      backup,
      refresh,
      screenAwake,
      setTimerRunning(value) {
        runningTimer = value;
      },
      setDirty(value) {
        dirty = value;
      },
    };
  };

  const render = async ({
    scroll = 'top',
    focusSelector,
  }: RefreshOptions = {}): Promise<void> => {
    const renderId = ++rendering;
    main.ariaBusy = 'true';
    const scrollTop = window.scrollY;
    if (!main.firstElementChild)
      main.append(element('p', { className: 'loading', text: 'Laden …' }));
    try {
      if (!fitness) throw new Error('Die lokale Datenbank ist nicht bereit.');
      const active = await fitness.getActiveWorkout();
      if (renderId !== rendering || stopped) return;
      runningTimer = active?.session.setTimer?.stoppedAt === null;
      navigation.hidden = resolveRoute(window.location.hash) === '/training';
      void screenAwake.setTraining(Boolean(active) && navigation.hidden);
      const view = await views[resolveRoute(window.location.hash)](context());
      if (renderId !== rendering || stopped) return;
      main.replaceChildren(view);
      main.removeAttribute('aria-busy');
      updateNavigation(navigation);
      document.title = `${view.querySelector('h1')?.textContent ?? 'Fitness'} · Fitness Glass`;
      const focusTarget = focusSelector
        ? main.querySelector<HTMLElement>(focusSelector)
        : undefined;
      focusTarget?.focus({ preventScroll: true });
      if (scroll === 'top') {
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        window.scrollTo({ top: scrollTop, behavior: 'instant' });
      }
    } catch (error) {
      main.removeAttribute('aria-busy');
      main.replaceChildren(createFailure(error, () => void render()));
    }
  };

  let currentHash = window.location.hash;
  let confirmingNavigation = false;
  const onHashChange = (): void => {
    void (async () => {
      if (confirmingNavigation) return;
      if (dirty || runningTimer) {
        confirmingNavigation = true;
        const stay = !(await confirmAction(
          runningTimer
            ? 'Der Timer läuft noch. Training wirklich verlassen?'
            : 'Nicht gespeicherte Eingaben verwerfen?',
        ));
        confirmingNavigation = false;
        if (stay) {
          window.history.replaceState(null, '', currentHash || '#/');
          return;
        }
        dirty = false;
      }
      currentHash = window.location.hash;
      await render();
    })();
  };
  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (dirty || runningTimer) event.preventDefault();
  };
  const recoverAfterResume = (): void => {
    if (!ready || stopped || document.visibilityState !== 'visible' || dirty)
      return;
    // Timestamps remain accurate after sleep; update controls in place without scrolling.
    main
      .querySelectorAll('form[data-set-type]')
      .forEach((form) => form.dispatchEvent(new Event('timer-resume')));
  };
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') recoverAfterResume();
  };
  const onPageShow = (): void => recoverAfterResume();
  let disposeCloseGuard = (): void => undefined;

  return {
    async start(): Promise<void> {
      window.addEventListener('hashchange', onHashChange);
      window.addEventListener('beforeunload', onBeforeUnload);
      window.addEventListener('pageshow', onPageShow);
      document.addEventListener('visibilitychange', onVisibilityChange);
      try {
        if (!fitness || !backup) {
          const database = await openFitnessDatabase(
            dependencies.database ?? new FitnessDatabase(),
          );
          const repositories = createRepositories(database);
          fitness ??= new FitnessService(repositories);
          backup ??= new BackupService(repositories.snapshots);
        }
        disposeCloseGuard = await guardWindowClose(() => dirty || runningTimer);
        ready = true;
        await render();
      } catch (error) {
        main.replaceChildren(createFailure(error, () => void this.start()));
      }
    },
    stop(): void {
      stopped = true;
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      disposeCloseGuard();
      void screenAwake.dispose();
    },
  };
}

function createFailure(error: unknown, retry: () => void): HTMLElement {
  const section = element('section', { className: 'card stack storage-error' });
  section.append(
    element('h1', { text: 'Lokaler Speicher nicht verfügbar' }),
    statusMessage(
      error instanceof Error
        ? error.message
        : 'Die lokalen Daten konnten nicht geöffnet werden. Es wurden keine Daten gelöscht.',
      'error',
    ),
    element('p', {
      text: 'Prüfe den privaten Browsermodus oder freien Gerätespeicher und versuche es erneut. Die App setzt die Datenbank niemals automatisch zurück.',
    }),
  );
  const action = button('Erneut versuchen', 'button button--primary');
  action.addEventListener('click', retry);
  section.append(action);
  return section;
}
