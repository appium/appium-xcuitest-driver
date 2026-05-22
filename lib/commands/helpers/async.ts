import {
  TimeoutError as AsyncboxTimeoutError,
  withTimeout as asyncboxWithTimeout,
} from 'asyncbox';

/** Error thrown by {@link withTimeout} when the deadline is exceeded. */
export class TimeoutError extends Error {
  constructor(message?: string) {
    super(message ?? 'Operation timed out');
    this.name = 'TimeoutError';
  }
}

/** Resolves with `promise` or rejects if it does not settle before `timeoutMs`. */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string,
): Promise<T> {
  try {
    return await asyncboxWithTimeout(promise, timeoutMs, message);
  } catch (err) {
    if (err instanceof AsyncboxTimeoutError) {
      throw new TimeoutError(err.message);
    }
    throw err;
  }
}
