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
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    if (util.compareVersions(this.opts.platformVersion, '<', '12.0')) {
      throw new Error('Changing appearance is only supported since iOS 12');
    }

    if (this.isSimulator()) {
      try {
        // @ts-expect-error - do not assign arbitrary properties to `this.opts`
        return void (await this.opts.device.setAppearance(style));
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
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    if (util.compareVersions(this.opts.platformVersion, '<', '12.0')) {
      return {style: 'unsupported'};
    }

    /** @type {Style|undefined} */
    let style;
    if (this.isSimulator()) {
      try {
        // @ts-expect-error - do not assign arbitrary properties to `this.opts`
        style = await this.opts.device.getAppearance();
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
