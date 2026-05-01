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
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Filters an array using an async predicate while preserving order. */
export async function asyncFilter<T>(
  items: T[],
  predicate: (item: T) => boolean | Promise<boolean>,
): Promise<T[]> {
  const flags = await Promise.all(items.map((item) => predicate(item)));
  return items.filter((_, idx) => Boolean(flags[idx]));
}
