import {setTimeout as delay} from 'node:timers/promises';

import {errors} from 'appium/driver.js';
import {waitForCondition} from 'asyncbox';

import type {XCUITestDriver} from '../driver.js';
import {getDuoSimulator} from './helpers/duo.js';
import {HIDPageEvent, HIDUsageConsumerEvent} from './hid-event.js';

declare module '../driver.js' {
  interface XCUITestDriver {
    lock(...args: Parameters<typeof lock>): ReturnType<typeof lock>;
    unlock(...args: Parameters<typeof unlock>): ReturnType<typeof unlock>;
    isLocked(...args: Parameters<typeof isLocked>): ReturnType<typeof isLocked>;
  }
}

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
  await simulator.pressHidButton(
    HIDPageEvent.kHIDPage_Consumer,
    locked ? HIDUsageConsumerEvent.kHIDUsage_Csmr_Power : HIDUsageConsumerEvent.kHIDUsage_Csmr_Menu,
  );
  const timeoutError = new errors.UnknownError(`Timed out waiting for the simulator to ${locked ? 'lock' : 'unlock'}`);
  const waitForState = async (waitMs: number) =>
    await waitForCondition(async () => (await driver.isLocked()) === locked, {
      waitMs,
      intervalMs: 100,
      error: timeoutError,
    });
  if (!locked) {
    try {
      await waitForState(1000);
      return;
    } catch (err) {
      if (err !== timeoutError) {
        throw err;
      }
    }
    // A sleeping device may need a second Home press after waking.
    await simulator.pressHidButton(HIDPageEvent.kHIDPage_Consumer, HIDUsageConsumerEvent.kHIDUsage_Csmr_Menu);
  }
  await waitForState(locked ? 5000 : 4000);
}
