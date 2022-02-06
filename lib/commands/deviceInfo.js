import { utilities } from 'appium-ios-device';

const extensions = {}, commands = {};

/**
 * Returns device info.
 *
 * @returns {Object} The response of `/wda/device/info'`
 * @throws {Error} if an error raised by command
 */
commands.mobileGetDeviceInfo = async function mobileGetDeviceInfo () {
  const infoByWda = await this.proxyCommand('/wda/device/info', 'GET');

  if (this.isRealDevice()) {
    const infoByLockdown = await utilities.getDeviceInfo(this.opts.device.udid);
    return {...infoByWda, ...{lockdownInfo: infoByLockdown}};
  }

  return infoByWda;
};

Object.assign(extensions, commands);
export { commands };
export default extensions;
