import {errors} from '@appium/base-driver';

import type {XCUITestDriver} from '../driver.js';
import {isTvOs, isWatchOs} from '../utils/index.js';

/**
 * Reads the current hinge angle in degrees, including changes made outside WDA.
 * Requires a WDA build with GET /wda/device/hingeAngle support.
 * WDA checks hinge and CoreMotion availability and waits up to five seconds for a valid reading.
 * Physical Duo behavior is unverified. A reading may reflect an intermediate angle during folding.
 */
export async function mobileGetSimulatedHingeAngle(this: XCUITestDriver): Promise<number> {
  if (isTvOs(this.opts.platformName) || isWatchOs(this.opts.platformName)) {
    throw new errors.NotImplementedError(
      'Hinge angle reading is only supported on iOS devices with an available hinge',
    );
  }
  return await this.proxyCommand('/wda/device/hingeAngle', 'GET');
}

/**
 * Requests a simulated hinge angle on an iOS device with an available hinge.
 * Requires a WDA build with /wda/device/hingeAngle support; WDA checks availability at runtime.
 * Tested only on the Duo simulator. Physical Duo behavior is unverified.
 * The transition completes asynchronously. Select currentDisplayId separately.
 *
 * @param angle - Degrees from 0 (closed) to 180 (fully open), inclusive.
 */
export async function mobileSetSimulatedHingeAngle(this: XCUITestDriver, angle: number): Promise<void> {
  if (typeof angle !== 'number' || !Number.isFinite(angle) || angle < 0 || angle > 180) {
    throw new errors.InvalidArgumentError('angle must be a finite number between 0 and 180 degrees');
  }
  if (isTvOs(this.opts.platformName) || isWatchOs(this.opts.platformName)) {
    throw new errors.NotImplementedError(
      'Simulated hinge angle is only supported on iOS devices with an available hinge',
    );
  }
  await this.proxyCommand('/wda/device/hingeAngle', 'POST', {angle});
}
