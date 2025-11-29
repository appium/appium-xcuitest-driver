import _ from 'lodash';
import {assertSimulator as _assertSimulator} from '../utils';

const assertSimulator = _.partial(_assertSimulator, 'Keychain modification');

/**
 * Clears keychains on a simulated device.
 *
 * @throws {Error} If current device is not a Simulator or there was an error
 * while clearing keychains.
 * @this {import('../driver').XCUITestDriver}
 * @group Simulator Only
 */
export async function mobileClearKeychains() {
  assertSimulator(this);

  await /** @type {import('appium-ios-simulator').Simulator} */ (this.device).clearKeychains();
}
