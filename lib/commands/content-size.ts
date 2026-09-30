import {errors} from 'appium/driver.js';

import {CONTENT_SIZE_ACTIONS, isContentSizeStep, stepContentSize} from '../content-size-model.js';
import {createConfigurationClient} from '../device/configuration-client.js';
import type {XCUITestDriver} from '../driver.js';
import {requireSimulator} from './helpers/index.js';
import type {ContentSizeAction, ContentSizeResult} from './types.js';

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
  const normalizedSize = String(size).toLowerCase() as ContentSizeAction;
  if (!(CONTENT_SIZE_ACTIONS as readonly string[]).includes(normalizedSize)) {
    throw new errors.InvalidArgumentError(
      `The 'size' value is expected to be one of ${CONTENT_SIZE_ACTIONS.join(',')}`,
    );
  }

  if (this.isRealDevice()) {
    await createConfigurationClient(this, 'Setting content size').setContentSize(normalizedSize as ContentSizeAction);
    return;
  }

  const simulator = requireSimulator(this, 'Setting content size');
  if (isContentSizeStep(normalizedSize)) {
    // Only newer Xcode versions accept `increment`/`decrement`; older ones answer
    // `'increment' is not a valid content size`. Resolving the step here makes these work on any
    // Xcode, and behave the same as they do on a real device, where they are resolved too.
    const currentSize = String(await mobileGetContentSize.call(this)).toLowerCase();
    const nextSize = stepContentSize(currentSize, normalizedSize);
    if (nextSize !== currentSize) {
      await simulator.setContentSize(nextSize);
    }
    return;
  }

  await simulator.setContentSize(size);
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

  // `simctl` prints `extra-Small` and `Small` capitalised on Xcode 27, though Apple's own help
  // text, node-simctl and this driver all document every size lowercase - and node-simctl passes
  // stdout through verbatim. Normalizing keeps the value matching the declared return type, and
  // identical to what a real device reports, on whichever Xcode is installed.
  const size = await requireSimulator(this, 'Getting content size').getContentSize();
  return String(size).toLowerCase() as ContentSizeResult;
}
