const extensions = {}, commands = {};

/**
 * Returns ActiveApp info.
 *
 * @returns {Object} The response of `/wda/activeAppInfo'`
 * @throws {Error} if an error raised by command
 */
commands.mobileGetActiveAppInfo = async function mobileGetActiveAppInfo () {
  return await this.proxyCommand('/wda/activeAppInfo', 'GET');
};

Object.assign(extensions, commands);
export { commands };
export default extensions;
