import {requireSimulator} from '../utils';
import type {XCUITestDriver} from '../driver';

/**
 * Clears keychains on a simulated device.
 *
 * @throws {Error} If current device is not a Simulator or there was an error
 * while clearing keychains.
 * @group Simulator Only
 */
export async function mobileClearKeychains(this: XCUITestDriver): Promise<void> {
  await requireSimulator(this, 'Keychain modification').clearKeychains();
}
