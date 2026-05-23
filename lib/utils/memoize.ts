// TODO(appium server 3.4.1+): Replace local `memoize` with imports from `appium/support`
// once this driver declares that minimum server version.

/**
 * Creates a memoized version of a function.
 *
 * @param fn - Function to memoize
 * @param resolver - Optional cache key resolver. If omitted, the first argument is used as the cache key.
 * @returns Memoized function with a mutable `.cache` map (compatible with lodash-style cache resets in tests).
 */
export function memoize<Fn extends (...args: any[]) => any>(
  fn: Fn,
  resolver?: (...args: Parameters<Fn>) => unknown,
): Fn & {cache: Map<unknown, ReturnType<Fn>>} {
  const memoizedFn = function (this: unknown, ...args: Parameters<Fn>) {
    const key = resolver ? resolver.apply(this, args) : args[0];
    if (memoizedFn.cache.has(key)) {
      return memoizedFn.cache.get(key) as ReturnType<Fn>;
    }
    const result = fn.apply(this, args);
    memoizedFn.cache.set(key, result);
    return result;
  } as unknown as Fn & {cache: Map<unknown, ReturnType<Fn>>};
  memoizedFn.cache = new Map<unknown, ReturnType<Fn>>();
  return memoizedFn;
}
