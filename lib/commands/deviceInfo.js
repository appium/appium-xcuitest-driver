let extensions = {}, commands = {};

/**
 * Returns device info.
 *
 * @returns {Object} The response of `/appium/device/info'`
 * @throws {Error} if an error raised by command
 */
commands.mobileGetDeviceInfo = async function mobileGetDeviceInfo () {
  return await this.proxyCommand('/appium/device/info', 'GET');
};

Object.assign(extensions, commands);
export { commands };
export default extensions;
