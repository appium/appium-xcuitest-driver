let commands = {}, helpers = {}, extensions = {};

function assertIsSimulator (driver) {
  if (!driver.isSimulator()) {
    throw new Error('Permissions setting can only be performed on Simulator');
  }
}

function assertPermissionOptions (opts = {}) {
  if (!opts.service) {
    throw new Error('Service name is mandatory to set');
  }
  if (!opts.bundleId) {
    throw new Error('Bundle identifier name is mandatory to set');
  }
  return opts;
}

/**
 * @typedef {Object} GetPermissionOptions
 *
 * @property {string} service - One of available service names. The following services are supported:
 * calendar,
 * camera,
 * contacts,
 * homekit,
 * microphone,
 * photos,
 * reminders,
 * medialibrary,
 * motion,
 * health:,
 * siri,
 * speech.
 * @property {string} bundleId - The bundle identifier of the destination app.
 */

/**
 * Gets application permission state on Simulator.
 *
 * @param {GetPermissionOptions} opts - Permission options.
 * @returns {string} Either 'yes', 'no' or 'unset'
 * @throws {Error} If permission getting fails or the device is not a Simulator.
 */
commands.mobileGetPermission = async function mobileGetPermission (opts = {}) {
  const {
    service,
    bundleId,
  } = assertPermissionOptions(opts);

  assertIsSimulator(this);

  return await this.opts.device.getPermission(bundleId, service);
};

Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
