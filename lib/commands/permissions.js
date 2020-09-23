import _ from 'lodash';


const commands = {}, helpers = {}, extensions = {};

// https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc
const RESOURCE_NAME_TO_ID_MAP = {
  calendar: 2,
  camera: 6,
  contacts: 1,
  health: -0x40000003,
  homekit: 8,
  keyboardnet: -0x40000001,
  location: -0x40000002,
  medialibrary: 7,
  microphone: 5,
  photos: 4,
  reminders: 3,
  systemroot: 0x40000000,
  userdesktop: 0x40000001,
  userdocuments: 0x40000003,
  userdownloads: 0x40000002,
  bluetooth: -0x40000000,
};

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
 * @typedef {Object} ResetPermissionOptions
 *
 * @property {!string|number} service - One of available service names. See the keys of
 * `RESOURCE_NAME_TO_ID_MAP` to get the list of supported service names.
 * This could also be an integer protected resource identifier taken from
 * https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc
 */

/**
 * Resets the given permission for the active application under test.
 * Works for both Simulator and real devices using Xcode SDK 11.4+
 *
 * @param {ResetPermissionOptions} opts - Permission options.
 * @throws {Error} If permission reset fails on the device.
 */
commands.mobileResetPermission = async function mobileResetPermission (opts = {}) {
  const {
    service,
  } = opts;
  if (!service) {
    throw new Error(`The 'service' option is expected to be present`);
  }
  let resource;
  if (_.isString(service)) {
    resource = RESOURCE_NAME_TO_ID_MAP[_.toLower(service)];
    if (!resource) {
      throw new Error(`The 'service' value must be one of ` +
        `${JSON.stringify(_.keys(RESOURCE_NAME_TO_ID_MAP))}`);
    }
  } else if (_.isInteger(service)) {
    resource = service;
  } else {
    throw new Error(`The 'service' value must be either a string or an integer. ` +
      `'${service}' is passed instead`);
  }

  await this.proxyCommand('/wda/resetAppAuth', 'POST', {resource});
};

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
