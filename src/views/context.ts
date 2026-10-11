import type { BackupService } from '../services/backup-service';
import type { FitnessService } from '../services/fitness-service';

export interface ViewContext {
  fitness: FitnessService;
  backup: BackupService;
  refresh(options?: RefreshOptions): Promise<void>;
  setDirty(dirty: boolean): void;
  setTimerRunning(running: boolean): void;
  screenAwake: import('../platform/screen-awake').ScreenAwakeController;
}

export interface RefreshOptions {
  /** Navigation goes to the top; same-screen refreshes keep their scroll position. */
  scroll?: 'top' | 'preserve';
  /** Selector for a safe control to restore after the view has been rebuilt. */
  focusSelector?: string;
}

export type ViewFactory = (context: ViewContext) => Promise<HTMLElement>;
