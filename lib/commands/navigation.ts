import type {Element} from '@appium/types';
import {errors} from 'appium/driver.js';

import type {XCUITestDriver} from '../driver.js';
import {isTvOs} from '../utils/index.js';

/**
 * Navigate back in the browser history or native app navigation.
 */
export async function back(this: XCUITestDriver): Promise<void> {
  if (!this.isWebContext()) {
    await this.nativeBack();
    return;
  }
  await this.webExecutionBackend.back();
}

/**
 * Navigate forward in the browser history.
 */
export async function forward(this: XCUITestDriver): Promise<void> {
  if (!this.isWebContext()) {
    // No-op for native context
    return;
  }
  await this.webExecutionBackend.forward();
}

/**
 * Closes the current window in a web context.
 *
 * @returns Promise resolving to the handles of the windows that remain open,
 * as required by https://www.w3.org/TR/webdriver2/#close-window
 */
export async function closeWindow(this: XCUITestDriver): Promise<string[]> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  await this.webExecutionBackend.closeWindow();
  return await this.getWindowHandles();
}

/**
 * Opens the given URL with the default application assigned to handle it based on the URL
 * scheme, or the application provided as an optional parameter
 *
 * (Note: the version of Xcode must be 14.3+ and iOS must be 16.4+)
 *
 * @param url - the URL to be opened, e.g. `myscheme://yolo`
 * @param bundleId - the application to open the given URL with. If not provided, then
 * the application assigned by the operating system to handle URLs of the appropriate type
 * @since 4.17
 */
export async function mobileDeepLink(this: XCUITestDriver, url: string, bundleId?: string): Promise<void> {
  return await this.proxyCommand('/url', 'POST', {
    url,
    bundleId,
  });
}

/**
 * Navigate back in native app navigation by finding and clicking the back button.
 */
export async function nativeBack(this: XCUITestDriver): Promise<void> {
  if (isTvOs(this.opts.platformName)) {
    this.log.debug(`Sending Menu button as back behavior in tvOS`);
    return await this.mobilePressButton('Menu');
  }

  try {
    const navBar = await this.findNativeElementOrElements('class name', 'XCUIElementTypeNavigationBar', false);
    let dstButton: Element<string>;
    const backButtons = await this.findNativeElementOrElements(
      '-ios predicate string',
      'type == "XCUIElementTypeButton" AND label == "Back"',
      true,
      navBar,
    );
    if (backButtons.length === 0) {
      const buttons = await this.findNativeElementOrElements(
        '-ios predicate string',
        'type == "XCUIElementTypeButton"',
        true,
        navBar,
      );
      if (buttons.length === 0) {
        throw new Error('No buttons found in navigation bar');
      }
      this.log.debug(`Found navigation bar 'back' button. Clicking.`);
      dstButton = buttons[0];
    } else {
      this.log.debug(`Did not find any navigation bar 'back' button. Clicking the first one.`);
      dstButton = backButtons[0];
    }

    await this.nativeClick(dstButton);
  } catch (err: any) {
    this.log.error(`Unable to find navigation bar and back button: ${err.message}`);
  }
}
