import {errors} from 'appium/driver.js';

import {createConfigurationClient} from '../device/configuration-client.js';
import type {XCUITestDriver} from '../driver.js';
import {requireSimulator} from './helpers/index.js';
import type {IncreaseContrastAction, IncreaseContrastResult} from './types.js';

const INCREASE_CONTRAST_CONFIG = ['enabled', 'disabled'] as const;

/**
 * Sets the increase contrast configuration for the given simulator or real device.
 *
 * On real devices this is applied through the RemoteXPC CoreDevice configuration service,
 * which requires iOS/tvOS 18+, the optional `appium-ios-remotexpc` package and a running
 * tunnel. There is no fallback: the command fails if RemoteXPC is unavailable.
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
  const normalizedValue = String(increaseContrast).toLowerCase();
  if (!(INCREASE_CONTRAST_CONFIG as readonly string[]).includes(normalizedValue)) {
    throw new errors.InvalidArgumentError(
      `The 'increaseContrast' value is expected to be one of ${INCREASE_CONTRAST_CONFIG.join(',')}`,
    );
  }

  if (this.isRealDevice()) {
    await createConfigurationClient(this, 'Setting increase contrast').setIncreaseContrast(
      normalizedValue as IncreaseContrastAction,
    );
    return;
  }

  await requireSimulator(this, 'Setting increase contrast').setIncreaseContrast(increaseContrast);
}

/**
 * Retrieves the current increase contrast configuration value from the given simulator
 * or real device.
 *
 * On real devices this is read through the RemoteXPC CoreDevice configuration service,
 * which requires iOS/tvOS 18+, the optional `appium-ios-remotexpc` package and a running
 * tunnel. There is no fallback: the command fails if RemoteXPC is unavailable.
 *
 * @since Xcode 15 (but lower xcode could have this command)
 * @returns The contrast configuration value.
 *          Possible return value is 'enabled', 'disabled',
 *          'unsupported' or 'unknown' with Xcode 16.2.
 *          Real devices only ever report 'enabled' or 'disabled'.
 */
export async function mobileGetIncreaseContrast(this: XCUITestDriver): Promise<IncreaseContrastResult> {
  if (this.isRealDevice()) {
    return await createConfigurationClient(this, 'Getting increase contrast').getIncreaseContrast();
  }

  return (await requireSimulator(this, 'Getting increase contrast').getIncreaseContrast()) as IncreaseContrastResult;
}
