import {errors} from 'appium/driver';
import {waitForCondition} from 'asyncbox';
import { isTvOs } from '../utils';

// these two constitute the wait after closing a window
const CLOSE_WINDOW_TIMEOUT = 5000;
const CLOSE_WINDOW_INTERVAL = 100;

/**
 * @this {XCUITestDriver}
 */
export async function back() {
  if (!this.isWebContext()) {
    await this.nativeBack();
  } else {
    await this.mobileWebNav('back');
  }
}

/**
 * @this {XCUITestDriver}
 */
export async function forward() {
  if (!this.isWebContext()) {
  }
  await this.mobileWebNav('forward');
}

/**
 * @this {XCUITestDriver}
 */
export async function closeWindow() {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  // since the window will be closed and the execution context gone, return
  // first before closing. Waiting for close will happen in the finally block
  const script = `setTimeout(function () {window.open('','_self').close();}, 0); return true;`;
  const context = this.curContext;
  try {
    return await this.executeAtom('execute_script', [script, []], true);
  } finally {
    // wait for the window to successfully change...
    try {
      await waitForCondition(() => this.curContext !== context, {
        waitMs: CLOSE_WINDOW_TIMEOUT,
        intervalMs: CLOSE_WINDOW_INTERVAL,
      });
    } catch {
      this.log.debug('Context has not yet been changed after closing window. Continuing...');
    }
  }
}

/**
 * Opens the given URL with the default application assigned to handle it based on the URL
 * scheme, or the application provided as an optional parameter
 *
 * (Note: the version of Xcode must be 14.3+ and iOS must be 16.4+)
 *
 * @param {string} url - the URL to be opened, e.g. `myscheme://yolo`
 * @param {string} [bundleId] - the application to open the given URL with. If not provided, then
 * the application assigned by the operating system to handle URLs of the appropriate type
 * @returns {Promise<void>}
 * @since 4.17
 * @this {XCUITestDriver}
 */
export async function mobileDeepLink(url, bundleId) {
  return await this.proxyCommand('/url', 'POST', {
    url,
    bundleId,
  });
}

/**
 * @this {XCUITestDriver}
 */
export async function nativeBack() {
  if (isTvOs(this.opts.platformName)) {
    this.log.debug(`Sending Menu button as back behavior in tvOS`);
    return await this.mobilePressButton('Menu');
  }

  try {
    const navBar = await this.findNativeElementOrElements(
      'class name',
      'XCUIElementTypeNavigationBar',
      false,
    );
    let dstButton;
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
  } catch (err) {
    this.log.error(`Unable to find navigation bar and back button: ${err.message}`);
  }
}

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */

/**
 * @typedef {Object} DeepLinkOptions
 * @property {string} url The URL to be opened. This parameter is manadatory
 * @property {string?} bundleId The bundle identifier of an application to open the
 * given url with. If not provided then the default application for the given url scheme
 * is going to be used.
 */
