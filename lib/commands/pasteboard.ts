import _ from 'lodash';
import { assertSimulator } from '../utils';
import type {XCUITestDriver} from '../driver';
import type {Simulator} from 'appium-ios-simulator';

/**
 * Sets the Simulator's pasteboard content to the given value.
 *
 * Does not work for real devices.
 *
 * @param content - The content to set
 * @param encoding - The content's encoding
 * @group Simulator Only
 */
export async function mobileSetPasteboard(
  this: XCUITestDriver,
  content: string,
  encoding: BufferEncoding = 'utf8',
): Promise<void> {
  assertSimulator.call(this, 'Setting pasteboard content');
  if (!_.isString(content)) {
    // can be empty string
    throw new Error('Pasteboard content is mandatory to set');
  }
  await (this.device as Simulator).simctl.setPasteboard(content, encoding);
}

/**
 * Gets the Simulator's pasteboard content.
 *
 * Does not work for real devices.
 *
 * @param encoding - Expected encoding of returned string
 * @group Simulator Only
 * @returns The pasteboard content string
 */
export async function mobileGetPasteboard(
  this: XCUITestDriver,
  encoding: BufferEncoding = 'utf8',
): Promise<string> {
  assertSimulator.call(this, 'Getting pasteboard content');
  return await (this.device as Simulator).simctl.getPasteboard(encoding);
}

