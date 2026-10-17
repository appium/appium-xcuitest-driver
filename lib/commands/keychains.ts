import type {XCUITestDriver} from '../driver.js';
import {requireSimulator} from './helpers/index.js';

declare module '../driver.js' {
  interface XCUITestDriver {
    mobileClearKeychains(...args: Parameters<typeof mobileClearKeychains>): ReturnType<typeof mobileClearKeychains>;
  }
}

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
