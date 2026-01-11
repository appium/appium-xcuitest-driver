import _ from 'lodash';
import {requireSimulator} from '../utils';
import { errors } from 'appium/driver';
import type {XCUITestDriver} from '../driver';
import type {IncreaseContrastAction, IncreaseContrastResult} from './types';

const INCREASE_CONTRAST_CONFIG = [
    'enabled',
    'disabled',
] as const;

/**
 * Sets the increase contrast configuration for the given simulator.
 *
 * @since Xcode 15 (but lower xcode could have this command)
 * @param increaseContrast - Valid increase contrast configuration value.
 *                          Acceptable value is 'enabled' or 'disabled' with Xcode 16.2.
 * @throws If the current platform does not support content size appearance changes
 */
export async function mobileSetIncreaseContrast(
  this: XCUITestDriver,
  increaseContrast: IncreaseContrastAction,
): Promise<void> {
  if (!(INCREASE_CONTRAST_CONFIG as readonly string[]).includes(_.lowerCase(increaseContrast))) {
    throw new errors.InvalidArgumentError(
      `The 'increaseContrast' value is expected to be one of ${INCREASE_CONTRAST_CONFIG.join(',')}`
    );
  }

  await requireSimulator(this, 'Setting increase contrast')
    .setIncreaseContrast(increaseContrast);
}

/**
 * Retrieves the current increase contrast configuration value from the given simulator.
 *
 * @since Xcode 15 (but lower xcode could have this command)
 * @returns The contrast configuration value.
 *          Possible return value is 'enabled', 'disabled',
 *          'unsupported' or 'unknown' with Xcode 16.2.
 */
export async function mobileGetIncreaseContrast(
  this: XCUITestDriver,
): Promise<IncreaseContrastResult> {
  return await requireSimulator(this, 'Getting increase contrast')
    .getIncreaseContrast() as IncreaseContrastResult;
}

