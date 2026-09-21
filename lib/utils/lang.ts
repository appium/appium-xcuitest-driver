import {util} from 'appium/support.js';

/**
 * Assigns own enumerable properties of `source` onto `target` only where `target[key] === undefined`
 * (lodash `defaults` semantics).
 */
export function assignDefaults<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    if (target[key] === undefined) {
      (target as Record<string, unknown>)[key] = source[key];
    }
  }
}

/**
 * Deep-merges own enumerable properties of each `source` into `target` (lodash `merge` semantics).
 */
export function mergeDeep<T extends Record<string, unknown>>(target: T, ...sources: Record<string, unknown>[]): T {
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (util.isPlainObject(sourceValue) && util.isPlainObject(targetValue)) {
        mergeDeep(targetValue, sourceValue);
      } else {
        (target as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }
  return target;
}

/**
 * Uppercases the first character of a string.
 */
export function upperFirst(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * Capitalizes the first character and lowercases the rest.
 */
export function capitalize(value: string): string {
  return value ? upperFirst(value.toLowerCase()) : value;
}

/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * @param err - Value caught from a try/catch block
 * @returns The error's message, or its string representation if it is not an `Error`
 */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
