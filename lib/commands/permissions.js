import _ from 'lodash';


let commands = {}, helpers = {}, extensions = {};

function requireSimulator (driver) {
  if (!driver.isSimulator()) {
    throw new Error('Permissions-related operations can only be performed on Simulator');
  }
}

function requireOptions (opts = {}) {
  if (!opts.bundleId) {
    throw new Error(`The 'bundleId' options must be a valid application bundle identifier`);
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
 * health,
 * siri,
 * speech.
 * @property {string} bundleId - The bundle identifier of the destination app.
 */

/**
 * Gets application permission state on Simulator.
 * This method requires WIX applesimutils to be installed on the server host.
 *
 * @param {GetPermissionOptions} opts - Permission options.
 * @returns {string} Either 'yes', 'no' or 'unset'
 * @throws {Error} If permission getting fails or the device is not a Simulator.
 */
commands.mobileGetPermission = async function mobileGetPermission (opts = {}) {
  const {
    service,
    bundleId,
  } = requireOptions(opts);
  if (!service) {
    throw new Error(`The 'service' option is expected to be present`);
  }
  requireSimulator(this);

  return await this.opts.device.getPermission(bundleId, service);
};

/**
 * @typedef {Object} SetPermissionsOptions
 *
 * @property {Object} access - One or more access rules to set.
 * The following keys are supported:
 * - all: Apply the action to all services.
 * - calendar: Allow access to calendar.
 * - contacts-limited: Allow access to basic contact info.
 * - contacts: Allow access to full contact details.
 * - location: Allow access to location services when app is in use.
 * - location-always: Allow access to location services at all times.
 * - photos-add: Allow adding photos to the photo library.
 * - photos: Allow full access to the photo library.
 * - media-library: Allow access to the media library.
 * - microphone: Allow access to audio input.
 * - motion: Allow access to motion and fitness data.
 * - reminders: Allow access to reminders.
 * - siri: Allow use of the app with Siri.
 * The following values are supported:
 * - yes: To grant the permission
 * - no: To revoke the permission
 * - unset: To reset the permission
 * @property {string} bundleId - The bundle identifier of the destination app.
 */

/**
 * Set application permission state on Simulator.
 *
 * @since Xcode SDK 11.4
 * @param {SetPermissionsOptions} opts - Permissions options.
 * @throws {Error} If permission setting fails or the device is not a Simulator.
 */
commands.mobileSetPermissions = async function mobileSetPermissions (opts = {}) {
  const {
    access,
    bundleId,
  } = requireOptions(opts);
  if (!_.isPlainObject(access)) {
    throw new Error(`The 'access' option is expected to be a map`);
  }
  requireSimulator(this);

  await this.opts.device.setPermissions(bundleId, access);
};


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
