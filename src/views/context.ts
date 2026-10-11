import type { BackupService } from '../services/backup-service';
import type { FitnessService } from '../services/fitness-service';

export interface ViewContext {
  fitness: FitnessService;
  backup: BackupService;
  refresh(options?: RefreshOptions): Promise<void>;
  setDirty(dirty: boolean): void;
}

export interface RefreshOptions {
  /** Keeps the active set timer in view after the view has been rebuilt. */
  scroll?: 'top' | 'preserve' | 'timer';
  /** Selector for a safe control to restore after the view has been rebuilt. */
  focusSelector?: string;
}

export type ViewFactory = (context: ViewContext) => Promise<HTMLElement>;
