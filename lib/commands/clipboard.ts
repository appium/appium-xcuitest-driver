import {PasteboardClient} from '../device/pasteboard-client.js';
import type {XCUITestDriver} from '../driver.js';
import {requireRealDevice} from './helpers/index.js';

/**
 * Sets the primary clipboard's content on the device under test.
 *
 * @param content - The content to be set as base64 encoded string.
 * @param contentType - The type of the content to set.
 *                      Only `plaintext`, 'image' and 'url' are supported.
 * @param mode - The mode to use. If set to 'xpc', the clipboard content will be set using
 * the RemoteXPC Pasteboard service.
 */
export async function setClipboard(
  this: XCUITestDriver,
  content: string,
  contentType?: string,
  mode?: string,
): Promise<void> {
  if (mode === 'xpc') {
    requireRealDevice(this, 'Setting clipboard content');
    const pasteboardClient = new PasteboardClient(this.device.udid, this.remoteXPCFacade);
    await pasteboardClient.setPasteboard(content, contentType);
    return;
  }
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
 * @param mode - The mode to use. If set to 'xpc', the clipboard content will be retrieved using the
 * RemoteXPC Pasteboard service.
 * @returns The actual clipboard content encoded into base64 string.
 * An empty string is returned if the clipboard contains no data.
 */
export async function getClipboard(this: XCUITestDriver, contentType?: string, mode?: string): Promise<string> {
  if (mode === 'xpc') {
    requireRealDevice(this, 'Getting clipboard content');
    const pasteboardClient = new PasteboardClient(this.device.udid, this.remoteXPCFacade);
    return (await pasteboardClient.getPasteboard(contentType)) ?? '';
  }
  return await this.proxyCommand<any, string>('/wda/getPasteboard', 'POST', {
    contentType,
  });
}
