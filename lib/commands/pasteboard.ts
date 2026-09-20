import type {XCUITestDriver} from '../driver.js';
import {requireSimulator} from './helpers/index.js';

/**
 * Sets the Simulator's pasteboard content to the given value.
 *
 * Does not work for real devices.
 *
 * @param content - The content to set
 * @param encoding - Deprecated and ignored; pasteboard content is always handled as UTF-8.
 * @group Simulator Only
 */
export async function mobileSetPasteboard(
  this: XCUITestDriver,
  content: string,
  encoding: BufferEncoding = 'utf8',
): Promise<void> {
  const simulator = requireSimulator(this, 'Setting pasteboard content');
  if (typeof content !== 'string') {
    // can be empty string
    throw new Error('Pasteboard content is mandatory to set');
  }
  warnIfNonUtf8Encoding(this, encoding);
  await simulator.setPasteboard(content);
}

/**
 * Gets the Simulator's pasteboard content.
 *
 * Does not work for real devices.
 *
 * @param encoding - Deprecated and ignored; pasteboard content is always returned as UTF-8.
 * @group Simulator Only
 * @returns The pasteboard content string
 */
export async function mobileGetPasteboard(this: XCUITestDriver, encoding: BufferEncoding = 'utf8'): Promise<string> {
  warnIfNonUtf8Encoding(this, encoding);
  return await requireSimulator(this, 'Getting pasteboard content').getPasteboard();
}

function warnIfNonUtf8Encoding(driver: XCUITestDriver, encoding: BufferEncoding): void {
  if (encoding !== 'utf8' && encoding !== 'utf-8') {
    driver.log.info(
      `The 'encoding' option is deprecated and ignored; the Simulator pasteboard is always handled as UTF-8`,
    );
  }
}
