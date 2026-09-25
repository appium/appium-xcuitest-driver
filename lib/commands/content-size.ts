import {errors} from 'appium/driver.js';

import {createConfigurationClient} from '../device/configuration-client.js';
import type {XCUITestDriver} from '../driver.js';
import {requireSimulator} from './helpers/index.js';
import type {ContentSizeAction, ContentSizeResult} from './types.js';

const CONTENT_SIZE = [
  'extra-small',
  'small',
  'medium',
  'large',
  'extra-large',
  'extra-extra-large',
  'extra-extra-extra-large',
  'accessibility-medium',
  'accessibility-large',
  'accessibility-extra-large',
  'accessibility-extra-extra-large',
  'accessibility-extra-extra-extra-large',
  'increment',
  'decrement',
] as const;

/**
 * Sets content size for the given simulator or real device.
 *
 * On real devices this is applied through the RemoteXPC CoreDevice configuration service,
 * which requires iOS/tvOS 18+, the optional `appium-ios-remotexpc` package and a running
 * tunnel. There is no fallback: the command fails if RemoteXPC is unavailable.
 * The five `accessibility-*` sizes additionally require *Larger Accessibility Sizes* to be
 * enabled on the device; the CoreDevice service rejects them otherwise.
 *
 * @since Xcode 15 (but lower xcode could have this command)
 * @param size - The content size action to set. Acceptable value is
 *               extra-small, small, medium, large, extra-large, extra-extra-large,
 *               extra-extra-extra-large, accessibility-medium, accessibility-large,
 *               accessibility-extra-large, accessibility-extra-extra-large,
 *               accessibility-extra-extra-extra-large with Xcode 16.2.
 * @throws If the current platform does not support content size appearance changes
 */
export async function mobileSetContentSize(this: XCUITestDriver, size: ContentSizeAction): Promise<void> {
  const normalizedSize = String(size).toLowerCase();
  if (!(CONTENT_SIZE as readonly string[]).includes(normalizedSize)) {
    throw new errors.InvalidArgumentError(`The 'size' value is expected to be one of ${CONTENT_SIZE.join(',')}`);
  }

  if (this.isRealDevice()) {
    await createConfigurationClient(this, 'Setting content size').setContentSize(normalizedSize as ContentSizeAction);
    return;
  }

  await requireSimulator(this, 'Setting content size').setContentSize(size);
}

/**
 * Retrieves the current content size value from the given simulator or real device.
 *
 * On real devices this is read through the RemoteXPC CoreDevice configuration service,
 * which requires iOS/tvOS 18+, the optional `appium-ios-remotexpc` package and a running
 * tunnel. There is no fallback: the command fails if RemoteXPC is unavailable.
 *
 * @since Xcode 15 (but lower xcode could have this command)
 * @returns The content size value. Possible return value is
 *          extra-small, small, medium, large, extra-large, extra-extra-large,
 *          extra-extra-extra-large, accessibility-medium, accessibility-large,
 *          accessibility-extra-large, accessibility-extra-extra-large,
 *          accessibility-extra-extra-extra-large,
 *          unknown or unsupported with Xcode 16.2.
 */
export async function mobileGetContentSize(this: XCUITestDriver): Promise<ContentSizeResult> {
  if (this.isRealDevice()) {
    return await createConfigurationClient(this, 'Getting content size').getContentSize();
  }

  return (await requireSimulator(this, 'Getting content size').getContentSize()) as ContentSizeResult;
}
