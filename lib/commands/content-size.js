import _ from 'lodash';
import {assertSimulator as _assertSimulator} from '../utils';
import { errors } from 'appium/driver';

const assertSimulator = _.partial(_assertSimulator, 'Content size ui command');

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
    'decrement'
];

export default {
  /**
   * Sets content size for the given simulator.
   *
   * @since Xcode 15 (but lower xcode could have this command)
   * @param {ContentSizeAction} size - The content size action to set. Acceptable value is
   *                                   extra-small, small, medium, large, extra-large, extra-extra-large,
   *                                   extra-extra-extra-large, accessibility-medium, accessibility-large,
   *                                   accessibility-extra-large, accessibility-extra-extra-large,
   *                                   accessibility-extra-extra-extra-large with Xcode 16.2.
   * @throws {Error} if the current platform does not support content size appearance changes
   * @this {XCUITestDriver}
   */
  async mobileSetContentSize(size) {
    const simulator = assertSimulator(this);

    if (!CONTENT_SIZE.includes(_.lowerCase(size))) {
      throw new errors.InvalidArgumentError(
        `The 'size' value is expected to be one of ${CONTENT_SIZE.join(',')}`
      );
    }

    await simulator.setContentSize(size);
  },

  /**
   * Retrieves the current content size value from the given simulator.
   *
   * @since Xcode 15 (but lower xcode could have this command)
   * @returns {Promise<ContentSizeResult>} the content size value. Possible return value is
   *                                 extra-small, small, medium, large, extra-large, extra-extra-large,
   *                                 extra-extra-extra-large, accessibility-medium, accessibility-large,
   *                                 accessibility-extra-large, accessibility-extra-extra-large,
   *                                 accessibility-extra-extra-extra-large,
   *                                 unknown or unsupported with Xcode 16.2.
   * @this {XCUITestDriver}
   */
  async mobileGetContentSize() {
    return /** @type {ContentSizeResult} */ (await assertSimulator(this).getContentSize());
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('./types').ContentSizeAction} ContentSizeAction
 * @typedef {import('./types').ContentSizeResult} ContentSizeResult
 */
