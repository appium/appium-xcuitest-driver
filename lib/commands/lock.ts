import {setTimeout as delay} from 'node:timers/promises';

import {errors} from 'appium/driver.js';

import type {XCUITestDriver} from '../driver.js';
import {getDuoSimulator} from './helpers/duo.js';

/**
 * Lock the device (and optionally unlock the device after a certain amount of time)
 *
 * @param seconds - The number of seconds after which to unlock the device. Set to `0` or leave empty to require manual unlock (do not automatically unlock).
 * @defaultValue 0
 */
export async function lock(this: XCUITestDriver, seconds?: number | string): Promise<void> {
  await setLocked(this, true);
  if (isNaN(Number(seconds))) {
    return;
  }

  const floatSeconds = parseFloat(String(seconds));
  if (floatSeconds <= 0) {
    return;
  }

  await delay(floatSeconds * 1000);
  await this.unlock();
}

/**
 * Unlock the device
 */
export async function unlock(this: XCUITestDriver): Promise<void> {
  await setLocked(this, false);
}

/**
 * Determine whether the device is locked
 *
 * @returns `true` if the device is locked, `false` otherwise
 */
export async function isLocked(this: XCUITestDriver): Promise<boolean> {
  return await this.proxyCommand<any, boolean>('/wda/locked', 'GET');
}

async function setLocked(driver: XCUITestDriver, locked: boolean): Promise<void> {
  const simulator = await getDuoSimulator(driver);
  if (!simulator) {
    await driver.proxyCommand(locked ? '/wda/lock' : '/wda/unlock', 'POST');
    return;
  }
  if ((await driver.isLocked()) === locked) {
    return;
  }
  await simulator.pressHidButton(12, locked ? 48 : 64);
  // A sleeping device may need a second Home press after waking.
  let retriedHome = false;
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if ((await driver.isLocked()) === locked) {
      return;
    }
    if (!locked && !retriedHome && Date.now() - started >= 1000) {
      await simulator.pressHidButton(12, 64);
      retriedHome = true;
    }
    await delay(100);
  }
  throw new errors.UnknownError(`Timed out waiting for the simulator to ${locked ? 'lock' : 'unlock'}`);
}
