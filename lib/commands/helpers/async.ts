import {TimeoutError as AsyncboxTimeoutError, withTimeout as asyncboxWithTimeout} from 'asyncbox';

/** The longest script timeout: the remote debugger also stops a script after 1 h */
const MAX_SCRIPT_TIMEOUT_MS = 60 * 60 * 1000;

/** Limits a script timeout to {@link MAX_SCRIPT_TIMEOUT_MS}; W3C `null` (no limit) gives that limit. */
export function limitScriptTimeoutMs(ms: number | null): number {
  return Math.min(ms ?? Infinity, MAX_SCRIPT_TIMEOUT_MS);
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
