import type {TimeoutValue} from '@appium/types';
import {ConditionUnmetError} from 'asyncbox';

// Message fallback for asyncbox < 6.6.0 (no `ConditionUnmetError`)
const LEGACY_CONDITION_UNMET_PATTERN = /Condition unmet/;

/**
 * Minimal driver surface needed to temporarily override the implicit wait.
 */
export interface ImplicitWaitOwner {
  implicitWaitMs: TimeoutValue;
  setImplicitWait(ms: TimeoutValue): void;
}

/**
 * Runs the given callback with the implicit wait temporarily set to zero,
 * restoring the original value afterwards. Internal lookups that only probe
 * the current screen state use this so they never stall for the
 * user-configured implicit timeout.
 *
 * @param driver - Driver whose implicit wait is overridden
 * @param fn - Callback to run without the implicit wait
 */
export async function withoutImplicitWait<T>(driver: ImplicitWaitOwner, fn: () => Promise<T>): Promise<T> {
  const implicitWaitMs = driver.implicitWaitMs;
  if (implicitWaitMs === 0) {
    return await fn();
  }
  driver.setImplicitWait(0);
  try {
    return await fn();
  } finally {
    driver.setImplicitWait(implicitWaitMs);
  }
}

/**
 * Whether the error is the one thrown by `implicitWaitForCondition` when the condition is not met in time.
 *
 * @param err - Error to check
 */
export function isConditionUnmetError(err: unknown): boolean {
  return (
    err instanceof ConditionUnmetError || (err instanceof Error && LEGACY_CONDITION_UNMET_PATTERN.test(err.message))
  );
}
