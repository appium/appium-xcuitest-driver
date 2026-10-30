/**
 * Minimal driver surface needed to temporarily override the implicit wait.
 */
export interface ImplicitWaitOwner {
  implicitWaitMs: number;
  setImplicitWait(ms: number): void;
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
