import _ from 'lodash';
import { assertSimulator } from '../utils';

/**
 * Sets the Simulator's pasteboard content to the given value.
 *
 * Does not work for real devices.
 * @param {string} content - The content to set
 * @param {string} encoding - The content's encoding
 * @group Simulator Only
 * @returns {Promise<void>}
 * @this {XCUITestDriver}
 */
export async function mobileSetPasteboard(content, encoding = 'utf8') {
  assertSimulator.call(this, 'Setting pasteboard content');
  if (!_.isString(content)) {
    // can be empty string
    throw new Error('Pasteboard content is mandatory to set');
  }
  return await /** @type {import('appium-ios-simulator').Simulator} */ (this.device).simctl.setPasteboard(
    content, /** @type {BufferEncoding} */ (encoding)
  );
}

/**
 * Gets the Simulator's pasteboard content.
 *
 * Does not work for real devices.
 * @param {string} encoding - Expected encoding of returned string
 * @group Simulator Only
 * @this {XCUITestDriver}
 * @returns {Promise<string>} The pasteboard content string
 */
export async function mobileGetPasteboard(encoding = 'utf8') {
  assertSimulator.call(this, 'Getting pasteboard content');
  return await /** @type {import('appium-ios-simulator').Simulator} */ (this.device).simctl.getPasteboard(
    /** @type {BufferEncoding} */ (encoding)
  );
}

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
