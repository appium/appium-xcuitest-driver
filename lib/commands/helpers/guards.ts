import type {Simulator} from 'appium-ios-simulator';

import type {RealDevice} from '../../device/real-device-management';
import {upperFirst} from '../../utils';

export interface DeviceGuardDriver {
  isSimulator(): boolean;
  isRealDevice(): boolean;
  readonly device: unknown;
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
