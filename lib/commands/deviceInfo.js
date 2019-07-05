import { util } from 'appium-support';

let extensions = {}, commands = {};

/**
 * @typedef {Object} DeviceInfo
 *
 * @property {?string} locale - Current device locale. e.g. 'ja_EN' and 'zh-Hant_US'
 * @property {?string} timeZone - TZ database Time Zones format like 'US/Pacific'
 */

/**
 * Returns device info.
 *
 * @returns {DeviceInfo} The current device info
 * @throws {Error} if an error raised by command
 */
commands.mobileGetDeviceInfo = async function mobileGetDeviceInfo () {
  const {ios} = await this.proxyCommand('/status', 'GET');
  const info = {};
  if (util.hasValue(ios.currentLocale)) {
    info.locale = ios.currentLocale;
  }
  if (util.hasValue(ios.timeZone)) {
    info.timeZone = ios.timeZone;
  }
  return info;
};

Object.assign(extensions, commands);
export { commands };
export default extensions;
