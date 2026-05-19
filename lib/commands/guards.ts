import _ from 'lodash';
import type {Simulator} from 'appium-ios-simulator';
import type {XCUITestDriver} from '../driver';
import type {RealDevice} from '../device/real-device-management';

/**
 * Requires that the given driver is running on a Simulator and return
 * the simulator instance.
 */
export function requireSimulator(driver: XCUITestDriver, action: string): Simulator {
  if (!driver.isSimulator()) {
    throw new Error(`${_.upperFirst(action)} can only be performed on Simulator`);
  }
  return driver.device as Simulator;
}

/**
 * Requires that the given driver is running on a real device and return
 * the real device instance.
 */
export function requireRealDevice(driver: XCUITestDriver, action: string): RealDevice {
  if (!driver.isRealDevice()) {
    throw new Error(`${_.upperFirst(action)} can only be performed on a real device`);
  }
  return driver.device as RealDevice;
}
