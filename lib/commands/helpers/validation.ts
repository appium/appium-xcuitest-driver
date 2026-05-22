import {errors} from 'appium/driver';
import {fs} from 'appium/support';
import {isPlainObject} from '../../utils';
import {log} from '../../logger';
import type {StringRecord} from '@appium/types';

export const DEFAULT_TIMEOUT_KEY = 'default';

/** Assert the presence of particular keys in the given object. */
export function requireArgs(
  argNames: string | string[],
  opts: StringRecord<any> = {},
): StringRecord<any> {
  for (const argName of Array.isArray(argNames) ? argNames : [argNames]) {
    if (!Object.hasOwn(opts, argName)) {
      throw new errors.InvalidArgumentError(`'${argName}' argument must be provided`);
    }
  }
  return opts;
}

/** Ensures application path exists before attempting installation. */
export async function checkAppPresent(app: string): Promise<void> {
  log.debug(`Checking whether app '${app}' is actually present on file system`);
  if (!(await fs.exists(app))) {
    throw log.errorWithException(`Could not find app at '${app}'`);
  }
  log.debug('App is present');
}

/** Normalizes command timeout capability into a validated milliseconds map. */
export function normalizeCommandTimeouts(
  value: string | Record<string, number>,
): Record<string, number> {
  // The value is normalized already
  if (typeof value !== 'string') {
    return value;
  }

  let result: Record<string, number> = {};
  // Use as default timeout for all commands if a single integer value is provided
  if (!isNaN(Number(value))) {
    result[DEFAULT_TIMEOUT_KEY] = Number.parseInt(String(value), 10);
    return result;
  }

  // JSON object has been provided. Let's parse it
  try {
    result = JSON.parse(value);
    if (!isPlainObject(result)) {
      throw new Error();
    }
  } catch {
    throw log.errorWithException(
      `"commandTimeouts" capability should be a valid JSON object. "${value}" was given instead`,
    );
  }
  for (const [cmd, timeout] of Object.entries(result)) {
    if (!Number.isInteger(timeout) || timeout <= 0) {
      throw log.errorWithException(
        `The timeout for "${cmd}" should be a valid natural number of milliseconds. "${timeout}" was given instead`,
      );
    }
  }
  return result;
}
