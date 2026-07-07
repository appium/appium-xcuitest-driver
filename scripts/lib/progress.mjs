/**
 * Logs a timeout-based progress bar while an operation without native progress callbacks is running.
 *
 * @param {{log: {info: (message: string) => void}, label: string, startedAt: number, timeoutMs: number, barWidth: number, intervalMs: number}} opts
 * @returns {{succeed: (message?: string) => void, fail: (message?: string) => void}}
 */
export function startTimeoutProgressLogger({log, label, startedAt, timeoutMs, barWidth, intervalMs}) {
  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  let isStopped = false;

  const logProgress = (status, isComplete = false) => {
    const elapsedMs = performance.now() - startedAt;
    const boundedElapsedMs = Math.min(elapsedMs, timeoutMs);
    const progress = isComplete ? 1 : boundedElapsedMs / timeoutMs;
    const filledWidth = Math.round(progress * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const bar = `${'#'.repeat(filledWidth)}${'-'.repeat(emptyWidth)}`;
    log.info(`${label}: [${bar}]${status && status !== 'waiting' ? ` - ${status}` : ''}`);
  };

  const stop = (status, isComplete = false) => {
    if (isStopped) {
      return;
    }
    isStopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    logProgress(status, isComplete);
  };

  logProgress('waiting');
  timer = setInterval(() => {
    logProgress('waiting');
  }, intervalMs);
  timer.unref?.();

  return {
    succeed: (message = 'done') => stop(message, true),
    fail: (message = 'failed') => stop(message),
  };
}
