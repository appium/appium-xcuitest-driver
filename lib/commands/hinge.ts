import {errors} from '@appium/base-driver';

import type {XCUITestDriver} from '../driver.js';
import {isTvOs, isWatchOs} from '../utils/index.js';

/**
 * Sets the iPhone Duo simulator hinge angle without Device Hub UI interaction.
 * Requires a WDA build with /wda/device/hingeAngle support and the iOS 27.1 Duo runtime.
 * The transition completes asynchronously. Select currentDisplayId separately.
 *
 * @param angle - Degrees from 0 (closed) to 180 (fully open), inclusive.
 */
export async function mobileSetSimulatedHingeAngle(this: XCUITestDriver, angle: number): Promise<void> {
  if (typeof angle !== 'number' || !Number.isFinite(angle) || angle < 0 || angle > 180) {
    throw new errors.InvalidArgumentError('angle must be a finite number between 0 and 180 degrees');
  }
  if (this.isRealDevice() || isTvOs(this.opts.platformName) || isWatchOs(this.opts.platformName)) {
    throw new errors.NotImplementedError('Simulated hinge angle is only supported on the iPhone Duo simulator');
  }
  await this.proxyCommand('/wda/device/hingeAngle', 'POST', {angle});
}
