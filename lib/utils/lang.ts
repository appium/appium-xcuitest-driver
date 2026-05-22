// TODO(appium server 3.4.1+): Replace local helpers with imports from `appium/support`
// once this driver declares that minimum server version.

/**
 * Returns true when the value has no elements/properties.
 *
 * @param value - Value to check
 * @returns `true` if the value is empty
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === 'string' || Array.isArray(value) || Buffer.isBuffer(value)) {
    return value.length === 0;
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }
  if (typeof value === 'object' || typeof value === 'function') {
    return Object.keys(value).length === 0;
  }
  return true;
}

/**
 * Escapes RegExp special characters in a string.
 *
 * @param value - Input string
 * @returns Escaped string safe for RegExp source
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns true when `value` is a plain object (including objects with a null prototype).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Assigns own enumerable properties of `source` onto `target` only where `target[key] === undefined`
 * (lodash `defaults` semantics).
 */
export function assignDefaults<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): void {
  for (const key of Object.keys(source)) {
    if (target[key] === undefined) {
      (target as Record<string, unknown>)[key] = source[key];
    }
  }
}

/**
 * Deep-merges own enumerable properties of each `source` into `target` (lodash `merge` semantics).
 */
export function mergeDeep<T extends Record<string, unknown>>(
  target: T,
  ...sources: Record<string, unknown>[]
): T {
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        mergeDeep(targetValue, sourceValue);
      } else {
        (target as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }
  return target;
}

/**
 * Truncates a string to `length` characters (lodash-compatible default omission).
 */
export function truncateString(
  value: string,
  {length, omission = '...'}: {length: number; omission?: string},
): string {
  if (value.length <= length) {
    return value;
  }
  const end = Math.max(0, length - omission.length);
  return `${value.slice(0, end)}${omission}`;
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
