import _ from 'lodash';
import {assertSimulator as _assertSimulator} from '../utils';
import { errors } from 'appium/driver';

const assertSimulator = _.partial(_assertSimulator, 'Content size ui command');

const INCREASE_CONTRAST_CONFIG = [
    'enabled',
    'disabled',
];

/**
 * Sets the increase contrast configuration for the given simulator.
 *
 * @since Xcode 15 (but lower xcode could have this command)
 * @param {IncreaseContrastAction} increaseContrast valid increase contrast configuration value.
 *                                                  Acceptable value is 'enabled' or 'disabled' with Xcode 16.2.
 * @throws {Error} if the current platform does not support content size appearance changes
 * @this {XCUITestDriver}
 */
export async function mobileSetIncreaseContrast(increaseContrast) {
  const simulator = assertSimulator(this);

  if (!INCREASE_CONTRAST_CONFIG.includes(_.lowerCase(increaseContrast))) {
    throw new errors.InvalidArgumentError(
      `The 'increaseContrast' value is expected to be one of ${INCREASE_CONTRAST_CONFIG.join(',')}`
    );
  }

  await simulator.setIncreaseContrast(increaseContrast);
}

/**
 * Retrieves the current increase contrast configuration value from the given simulator.
 *
 * @since Xcode 15 (but lower xcode could have this command)
 * @returns {Promise<IncreaseContrastResult>} the contrast configuration value.
 *                                      Possible return value is 'enabled', 'disabled',
 *                                      'unsupported' or 'unknown' with Xcode 16.2.
 * @this {XCUITestDriver}
 */
export async function mobileGetIncreaseContrast() {
  return /** @type {IncreaseContrastResult} */ (await assertSimulator(this).getIncreaseContrast());
}

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('./types').IncreaseContrastAction} IncreaseContrastAction
 * @typedef {import('./types').IncreaseContrastResult} IncreaseContrastResult
 */
