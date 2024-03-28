import _ from 'lodash';
import {util} from 'appium/support';

export default {
  /**
   * Set the device's UI appearance style
   *
   * @since iOS 12.0
   * @param {'dark'|'light'} style - The appearance style to set
   * @throws {Error} if the current platform does not support UI appearance changes
   * @this {XCUITestDriver}
   */
  async mobileSetAppearance(style) {
    if (!['light', 'dark'].includes(_.toLower(style))) {
      throw new Error(`The 'style' value is expected to equal either 'light' or 'dark'`);
    }
    if (util.compareVersions(/** @type {string} */ (this.opts.platformVersion), '<', '12.0')) {
      throw new Error('Changing appearance is only supported since iOS 12');
    }

    if (this.isSimulator()) {
      try {
        return void (await /** @type {import('../driver').Simulator} */ (this.device).setAppearance(style));
      } catch (e) {
        this.log.debug(e.stack);
      }
    }
    try {
      return void (await this.proxyCommand('/wda/device/appearance', 'POST', {name: style}, false));
    } catch (e) {
      this.log.debug(e.stack);
    }
    // Fall back to the ugly Siri workaround if the current SDK is too old
    await this.mobileSiriCommand(`Turn ${_.toLower(style) === 'dark' ? 'on' : 'off'} dark mode`);
  },

  /**
   * Get the device's UI appearance style.
   *
   * @since Xcode SDK 11
   * @returns {Promise<{style: Style}>}
   * @this {XCUITestDriver}
   */
  async mobileGetAppearance() {
    if (util.compareVersions(/** @type {string} */ (this.opts.platformVersion), '<', '12.0')) {
      return {style: 'unsupported'};
    }

    /** @type {Style|undefined} */
    let style;
    if (this.isSimulator()) {
      try {
        style = /** @type {Style} */ (
          await /** @type {import('../driver').Simulator} */ (this.device).getAppearance()
        );
      } catch (ign) {}
    }
    if (!style) {
      style = /** @type {Style} */ (
        /** @type {any} */ (await this.proxyCommand('/wda/device/info', 'GET'))
          ?.userInterfaceStyle ?? 'unknown'
      );
    }
    return {
      style,
    };
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('./types').Style} Style
 */
