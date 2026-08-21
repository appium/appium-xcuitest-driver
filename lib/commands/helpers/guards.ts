import type {Simulator} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';

import type {RealDevice} from '../../device/real-device-management.js';
import {isWatchOs, upperFirst} from '../../utils/index.js';

export interface DeviceGuardDriver {
  isSimulator(): boolean;
  isRealDevice(): boolean;
  readonly device: unknown;
}

export interface WebContextGuardDriver {
  isWebContext(): boolean;
}

export interface PlatformGuardDriver {
  readonly opts: {platformName?: string | null};
}

/**
 * Requires that the given driver is running on a Simulator and return
 * the simulator instance.
 */
export function requireSimulator(driver: DeviceGuardDriver, action: string): Simulator {
  if (!driver.isSimulator()) {
    throw new Error(`${upperFirst(action)} can only be performed on Simulator`);
  }
  return driver.device as Simulator;
}

/**
 * Requires that the given driver is running on a real device and return
 * the real device instance.
 */
export function requireRealDevice(driver: DeviceGuardDriver, action: string): RealDevice {
  if (!driver.isRealDevice()) {
    throw new Error(`${upperFirst(action)} can only be performed on a real device`);
  }
  return driver.device as RealDevice;
}

/**
 * Throws if the given driver is not currently in a web context.
 */
export function requireWebContext(driver: WebContextGuardDriver, message?: string): void {
  if (!driver.isWebContext()) {
    throw new errors.NotImplementedError(message);
  }
}

/**
 * Requires that the given driver's session was started with `platformName: watchOS`.
 */
export function requireWatchOs(driver: PlatformGuardDriver, action: string): void {
  if (!isWatchOs(driver.opts.platformName)) {
    throw new errors.NotImplementedError(`${upperFirst(action)} can only be performed on watchOS`);
  }
}
