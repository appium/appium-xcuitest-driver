import B from 'bluebird';
import type {XCUITestDriver} from '../driver';

/**
 * Lock the device (and optionally unlock the device after a certain amount of time)
 *
 * @param seconds - The number of seconds after which to unlock the device. Set to `0` or leave empty to require manual unlock (do not automatically unlock).
 * @defaultValue 0
 */
export async function lock(
  this: XCUITestDriver,
  seconds?: number | string,
): Promise<void> {
  await this.proxyCommand('/wda/lock', 'POST');
  if (isNaN(Number(seconds))) {
    return;
  }

  const floatSeconds = parseFloat(String(seconds));
  if (floatSeconds <= 0) {
    return;
  }

  await B.delay(floatSeconds * 1000);
  await this.proxyCommand('/wda/unlock', 'POST');
}

/**
 * Unlock the device
 */
export async function unlock(this: XCUITestDriver): Promise<void> {
  await this.proxyCommand('/wda/unlock', 'POST');
}

/**
 * Determine whether the device is locked
 *
 * @returns `true` if the device is locked, `false` otherwise
 */
export async function isLocked(this: XCUITestDriver): Promise<boolean> {
  return await this.proxyCommand<any, boolean>('/wda/locked', 'GET');
}

