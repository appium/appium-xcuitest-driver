import _ from 'lodash';
import {requireSimulator} from '../utils';
import {errors} from 'appium/driver';
import type {XCUITestDriver} from '../driver';
import type {ContentSizeAction, ContentSizeResult} from './types';

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
 * Sets content size for the given simulator.
 *
 * @since Xcode 15 (but lower xcode could have this command)
 * @param size - The content size action to set. Acceptable value is
 *               extra-small, small, medium, large, extra-large, extra-extra-large,
 *               extra-extra-extra-large, accessibility-medium, accessibility-large,
 *               accessibility-extra-large, accessibility-extra-extra-large,
 *               accessibility-extra-extra-extra-large with Xcode 16.2.
 * @throws If the current platform does not support content size appearance changes
 */
export async function mobileSetContentSize(
  this: XCUITestDriver,
  size: ContentSizeAction,
): Promise<void> {
  if (!(CONTENT_SIZE as readonly string[]).includes(_.lowerCase(size))) {
    throw new errors.InvalidArgumentError(
      `The 'size' value is expected to be one of ${CONTENT_SIZE.join(',')}`,
    );
  }

  await requireSimulator(this, 'Setting content size').setContentSize(size);
}

/**
 * Retrieves the current content size value from the given simulator.
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
  return (await requireSimulator(
    this,
    'Getting content size',
  ).getContentSize()) as ContentSizeResult;
}
