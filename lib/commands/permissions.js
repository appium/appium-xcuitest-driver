import _ from 'lodash';

/**
 * Mapping of resource name to ID.
 * @see https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc
 */
export const RESOURCE_NAME_TO_ID_MAP = {
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

function requireSimulator(driver) {
  if (!driver.isSimulator()) {
    throw new Error('Permissions-related operations can only be performed on Simulator');
  }
}

export default {
  /**
   * Resets the given permission for the active application under test.
   * Works for both Simulator and real devices using Xcode SDK 11.4+
   *
   * @param {keyof typeof RESOURCE_NAME_TO_ID_MAP|number} service - One of the available service names. This could also be an integer protected resource identifier; see [this list](https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc)
   * @throws {Error} If permission reset fails on the device.
   * @this {XCUITestDriver}
   */
  async mobileResetPermission(service) {
    if (!service) {
      throw new Error(`The 'service' option is expected to be present`);
    }
    let resource;
    if (_.isString(service)) {
      resource = RESOURCE_NAME_TO_ID_MAP[_.toLower(service)];
      if (!resource) {
        throw new Error(
          `The 'service' value must be one of ` +
            `${JSON.stringify(_.keys(RESOURCE_NAME_TO_ID_MAP))}`
        );
      }
    } else if (_.isInteger(service)) {
      resource = service;
    } else {
      throw new Error(
        `The 'service' value must be either a string or an integer. ` +
          `'${service}' is passed instead`
      );
    }

    await this.proxyCommand('/wda/resetAppAuth', 'POST', {resource});
  },

  /**
   * Gets application permission state on Simulator.
   *
   * This method requires WIX applesimutils to be installed on the server host.
   *
   * @param {GetPermissionService} service - Service name
   * @param {string} bundleId - Bundle identifier of the target application
   * @returns {Promise<'yes'|'no'|'unset'|'limited'>} Either 'yes', 'no', 'unset' or 'limited'
   * @throws {Error} If permission getting fails or the device is not a Simulator.
   * @this {XCUITestDriver}
   * @group Simulator Only
   */
  async mobileGetPermission(bundleId, service) {
    if (!service) {
      throw new Error(`The 'service' option is expected to be present`);
    }
    requireSimulator(this);

    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    return await this.opts.device.getPermission(bundleId, service);
  },

  /**
   * Set application permission state on Simulator.
   *
   * @param {Record<Partial<AccessRule>, PermissionState>} access - One or more access rules to set.
   * @param {string} bundleId - Bundle identifier of the target application
   * @since Xcode SDK 11.4
   * @throws {Error} If permission setting fails or the device is not a Simulator.
   * @group Simulator Only
   * @this {XCUITestDriver}
   */
  async mobileSetPermissions(access, bundleId) {
    if (!_.isPlainObject(access)) {
      throw new Error(`The 'access' option is expected to be a map`);
    }
    requireSimulator(this);

    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    await this.opts.device.setPermissions(bundleId, access);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */

/**
 * Access rules for the `mobile: setPermission` execute method.
 *
 * Details:
 *
 * - `all`: Apply the action to all services.
 * - `calendar`: Allow access to calendar.
 * - `contacts-limited`: Allow access to basic contact info.
 * - `contacts`: Allow access to full contact details.
 * - `location`: Allow access to location services when app is in use.
 * - `location-always`: Allow access to location services at all times.
 * - `photos-add`: Allow adding photos to the photo library.
 * - `photos`: Allow full access to the photo library.
 * - `media-library`: Allow access to the media library.
 * - `microphone`: Allow access to audio input.
 * - `motion`: Allow access to motion and fitness data.
 * - `reminders`: Allow access to reminders.
 * - `siri`: Allow use of the app with Siri.
 *
 * @typedef {'all'|'calendar'|'contacts-limited'|'contacts'|'location'|'location-always'|'photos-add'|'photos'|'media-library'|'microphone'|'motion'|'reminders'|'siri'} AccessRule
 */

/**
 * Permission state
 *
 * Details:
 *
 * - `yes`: To grant the permission
 * - `no`: To revoke the permission
 * - `unset`: To reset the permission
 * - `limited`: To grant the permission as limited access (Only for photos)
 * @typedef {'yes'|'no'|'unset'|'limited'} PermissionState
 */

/**
 * @typedef {'calendar'|'camera'|'contacts'|'homekit'|'microphone'|'photos'|'reminders'|'medialibrary'|'motion'|'health'|'siri'|'speech'} GetPermissionService
 */
