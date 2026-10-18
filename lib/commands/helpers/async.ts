import {TimeoutError as AsyncboxTimeoutError, withTimeout as asyncboxWithTimeout} from 'asyncbox';

/** The longest delay of a Node or WebKit timer: a longer delay fires at once */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/** Limits `ms` to the longest timer delay, so that a timer with this delay does not fire at once. */
export function limitTimerDelayMs(ms: number): number {
  return Math.min(ms, MAX_TIMER_DELAY_MS);
}

/** Error thrown by {@link withTimeout} when the deadline is exceeded. */
export class TimeoutError extends Error {
  constructor(message?: string) {
    super(message ?? 'Operation timed out');
    this.name = 'TimeoutError';
  }
}

/** Resolves with `promise` or rejects if it does not settle before `timeoutMs`. */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  try {
    return await asyncboxWithTimeout(promise, timeoutMs, message);
  } catch (err) {
    if (err instanceof AsyncboxTimeoutError) {
      throw new TimeoutError(err.message);
    }
    throw err;
  }
}
