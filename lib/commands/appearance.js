import _ from 'lodash';
import { util } from 'appium-support';


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
 * @since Xcode SDK 11.4
 * @param {SetAppearanceOptions} opts
 */
commands.mobileSetAppearance = async function mobileSetAppearance (opts = {}) {
  const {
    style,
  } = opts;
  if (!style) {
    throw new Error(`The 'style' option is expected to be present`);
  }
  if (util.compareVersions(this.opts.platformVersion, '<', '12.0')) {
    throw new Error('Changing appearance is only supported since iOS 12');
  }

  return this.isSimulator() && (_.isEmpty(this.xcodeVersion)
      || util.compareVersions(`${this.xcodeVersion.major}.${this.xcodeVersion.minor}`, '>=', '11.4'))
    ? await this.opts.device.setAppearance(style)
    // ugly workaround for real devices
    : await this.mobileSiriCommand({
      text: `Turn ${_.toLower(style) === 'dark' ? 'on' : 'off'} dark mode`,
    });
};

/**
 * Get the device's UI appearance style.
 *
 * @since Xcode SDK 11.4
 * @returns {string} The device's UI appearance value.
 * This could be one of:
 * - `light`
 * - `dark`
 * - `unknown`
 * - `unsupported`
 */
commands.mobileGetAppearance = async function mobileGetAppearance () {
  if (util.compareVersions(this.opts.platformVersion, '<', '12.0')) {
    return 'unsupported';
  }

  return this.isSimulator() && (_.isEmpty(this.xcodeVersion)
      || util.compareVersions(`${this.xcodeVersion.major}.${this.xcodeVersion.minor}`, '>=', '11.4'))
    ? await this.opts.device.getAppearance()
    : (await this.proxyCommand('/wda/device/info', 'GET')).userInterfaceStyle;
};


export { commands };
export default commands;
