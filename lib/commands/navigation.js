import {errors} from 'appium/driver';
import _ from 'lodash';
import {waitForCondition} from 'asyncbox';

// these two constitute the wait after closing a window
const CLOSE_WINDOW_TIMEOUT = 5000;
const CLOSE_WINDOW_INTERVAL = 100;

const commands = {
  /**
   * @this {XCUITestDriver}
   */
  async back() {
    if (!this.isWebContext()) {
      await this.nativeBack();
    } else {
      await this.mobileWebNav('back');
    }
  },
  /**
   * @this {XCUITestDriver}
   */
  async forward() {
    if (!this.isWebContext()) {
    }
    await this.mobileWebNav('forward');
  },
  /**
   * @this {XCUITestDriver}
   */
  async closeWindow() {
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
      } catch (ign) {
        this.log.debug('Context has not yet been changed after closing window. Continuing...');
      }
    }
  },

  /**
   * Opens the given URL with the default or the given application
   *
   * @param {string} url
   * @param {string} [bundleId]
   * @this {XCUITestDriver}
   */
  async mobileDeepLink(url, bundleId) {
    return await this.proxyCommand('/url', 'POST', {
      url,
      bundleId,
    });
  },
};

const helpers = {
  /**
   * @this {XCUITestDriver}
   */
  async nativeBack() {
    try {
      let navBar = await this.findNativeElementOrElements(
        'class name',
        'XCUIElementTypeNavigationBar',
        false
      );
      let buttons = await this.findNativeElementOrElements(
        'class name',
        'XCUIElementTypeButton',
        true,
        navBar
      );
      if (buttons?.length === 0) {
        throw new Error('No buttons found in navigation bar');
      }

      let backButton = _.filter(buttons, (value) => value.label === 'Back')[0];
      if (backButton) {
        this.log.debug(`Found navigation bar 'back' button. Clicking.`);
      } else {
        this.log.debug(`Unable to find 'Back' button. Trying first button in navigation bar`);
        backButton = buttons?.[0];
      }
      await this.nativeClick(/** @type {string} */(backButton));
    } catch (err) {
      this.log.error(`Unable to find navigation bar and back button: ${err.message}`);
    }
  },
};

export default {...helpers, ...commands};

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
