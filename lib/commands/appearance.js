import _ from 'lodash';
import { util } from '@appium/support';


const commands = {};

/**
 * @typedef {Object} SetAppearanceOptions
 *
 * @property {string} style - Currently two styles are supported:
 * - dark
 * - light
 */

/**
 * Set the device's UI appearance style
 *
 * @since iOS 12.0
 * @param {SetAppearanceOptions} opts
 * @throws {Error} if the current platform does not support UI
 * appearance changes
 */
commands.mobileSetAppearance = async function mobileSetAppearance (opts = {}) {
  const {
    style,
  } = opts;
  if (!['light', 'dark'].includes(_.toLower(style))) {
    throw new Error(`The 'style' value is expected to equal either 'light' or 'dark'`);
  }
  if (util.compareVersions(this.opts.platformVersion, '<', '12.0')) {
    throw new Error('Changing appearance is only supported since iOS 12');
  }

  if (this.isSimulator()) {
    try {
      return void (await this.opts.device.setAppearance(style));
    } catch (e) {
      this.log.debug(e.stack);
    }
  }
  try {
    return void (await this.proxyCommand('/wda/device/appearance', 'POST', {name: style}));
  } catch (e) {
    this.log.debug(e.stack);
  }
  // Fall back to the ugly Siri workaround if the current SDK is too old
  await this.mobileSiriCommand({
    text: `Turn ${_.toLower(style) === 'dark' ? 'on' : 'off'} dark mode`,
  });
};

/**
 * @typedef {Object} Appearance
 * @property {string} style - The device's UI appearance value.
 * This could be one of:
 * - `light`
 * - `dark`
 * - `unknown`
 * - `unsupported`
 */

/**
 * Get the device's UI appearance style.
 *
 * @since Xcode SDK 11
 * @returns {Appearance}
 */
commands.mobileGetAppearance = async function mobileGetAppearance () {
  if (util.compareVersions(this.opts.platformVersion, '<', '12.0')) {
    return 'unsupported';
  }

  let style;
  if (this.isSimulator()) {
    try {
      style = await this.opts.device.getAppearance();
    } catch (ign) {}
  }
  if (!style) {
    style = (await this.proxyCommand('/wda/device/info', 'GET')).userInterfaceStyle || 'unknown';
  }
  return {
    style,
  };
};


export { commands };
export default commands;
