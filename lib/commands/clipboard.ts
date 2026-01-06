import type {XCUITestDriver} from '../driver';

/**
 * Sets the primary clipboard's content on the device under test.
 *
 * @param content - The content to be set as base64 encoded string.
 * @param contentType - The type of the content to set.
 *                      Only `plaintext`, 'image' and 'url' are supported.
 */
export async function setClipboard(
  this: XCUITestDriver,
  content: string,
  contentType?: string,
): Promise<void> {
  await this.proxyCommand('/wda/setPasteboard', 'POST', {
    content,
    contentType,
  });
}

/**
 * Gets the content of the primary clipboard on the device under test.
 *
 * @param contentType - The type of the content to get.
 *                      Only `plaintext`, 'image' and 'url' are supported.
 * @returns The actual clipboard content encoded into base64 string.
 * An empty string is returned if the clipboard contains no data.
 */
export async function getClipboard(
  this: XCUITestDriver,
  contentType?: string,
): Promise<string> {
  return await this.proxyCommand<any, string>('/wda/getPasteboard', 'POST', {
    contentType,
  });
}

