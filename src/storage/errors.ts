export type StorageErrorCode =
  'unavailable' | 'constraint' | 'not-found' | 'integrity' | 'transaction';

/** A storage failure that can be translated into actionable UI copy. */
export class StorageError extends Error {
  readonly code: StorageErrorCode;
  override readonly cause: unknown;

  constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.cause = cause;
  }
}

export function toStorageError(
  error: unknown,
  fallbackMessage: string,
): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  if (error instanceof DOMException) {
    if (error.name === 'ConstraintError') {
      return new StorageError('constraint', fallbackMessage, error);
    }

    if (
      error.name === 'InvalidStateError' ||
      error.name === 'NotAllowedError' ||
      error.name === 'SecurityError' ||
      error.name === 'UnknownError'
    ) {
      return new StorageError('unavailable', fallbackMessage, error);
    }
  }

  return new StorageError('transaction', fallbackMessage, error);
}
