export const DEFAULT_DISCONNECT_RETRY_INTERVAL_MS = 1000;
export const DEFAULT_DISCONNECT_RETRY_BACKOFF_MULTIPLIER = 2;
export const DEFAULT_DISCONNECT_RETRY_BACKOFF_MAX_INTERVAL_MS = 30_000;

/**
 * @abstract
 * Common attempt-counting behavior shared by all retry policies. Subclasses only need to implement
 * `getDelayMs()`.
 */
export class RetryPolicy {
  /**
   * @param {{maxAttempts: number | null, intervalMs: number}} opts - maxAttempts: null disables
   * retries entirely; 0 means unlimited retries
   */
  constructor({maxAttempts, intervalMs}) {
    if (new.target === RetryPolicy) {
      throw new TypeError('RetryPolicy is abstract and cannot be instantiated directly');
    }
    this.maxAttempts = maxAttempts;
    this._intervalMs = intervalMs;
  }

  get isEnabled() {
    return this.maxAttempts !== null;
  }

  /**
   * @param {number} attemptsMade - number of attempts already made
   * @returns {boolean}
   */
  hasAttemptsRemaining(attemptsMade) {
    return !this.maxAttempts || attemptsMade < this.maxAttempts;
  }

  /**
   * @abstract
   * @param {number} _attempt - 1-based number of the attempt about to be made
   * @returns {number}
   */
  getDelayMs(_attempt) {
    throw new Error('Not implemented');
  }
}

/**
 * Fixed-interval retry policy: waits the same delay between every attempt.
 */
export class FixedIntervalRetryPolicy extends RetryPolicy {
  /**
   * @param {number} _attempt - 1-based number of the attempt about to be made
   * @returns {number}
   */
  getDelayMs(_attempt) {
    return this._intervalMs;
  }
}

/**
 * Exponential-backoff retry policy: the delay grows by a multiplier on each attempt, capped at a
 * configured maximum.
 */
export class ExponentialBackoffRetryPolicy extends RetryPolicy {
  /**
   * @param {{maxAttempts: number | null, intervalMs: number, backoffMultiplier: number, backoffMaxIntervalMs: number}} opts
   */
  constructor({maxAttempts, intervalMs, backoffMultiplier, backoffMaxIntervalMs}) {
    super({maxAttempts, intervalMs});
    if (backoffMaxIntervalMs < intervalMs) {
      throw new Error(
        `Invalid disconnect retry backoff max interval: ${backoffMaxIntervalMs}. ` +
          `Expected a value >= the initial interval (${intervalMs}).`,
      );
    }
    this._backoffMultiplier = backoffMultiplier;
    this._backoffMaxIntervalMs = backoffMaxIntervalMs;
  }

  /**
   * @param {number} attempt - 1-based number of the attempt about to be made
   * @returns {number}
   */
  getDelayMs(attempt) {
    const delayMs = this._intervalMs * this._backoffMultiplier ** (attempt - 1);
    return Math.min(delayMs, this._backoffMaxIntervalMs);
  }
}

/**
 * @param {{strategy: 'fixed' | 'exponential', maxAttempts: number | null, intervalMs: number, backoffMultiplier?: number, backoffMaxIntervalMs?: number}} opts
 * @returns {RetryPolicy}
 */
export function createDisconnectRetryPolicy({
  strategy,
  maxAttempts,
  intervalMs,
  backoffMultiplier = DEFAULT_DISCONNECT_RETRY_BACKOFF_MULTIPLIER,
  backoffMaxIntervalMs = DEFAULT_DISCONNECT_RETRY_BACKOFF_MAX_INTERVAL_MS,
}) {
  return strategy === 'exponential'
    ? new ExponentialBackoffRetryPolicy({maxAttempts, intervalMs, backoffMultiplier, backoffMaxIntervalMs})
    : new FixedIntervalRetryPolicy({maxAttempts, intervalMs});
}
