import _ from 'lodash';
import {PermissionService} from './enum';
import {assertSimulator as _assertSimulator} from '../utils';

const assertSimulator = _.partial(_assertSimulator, 'Permission-related operations');

export default {
  /**
   * Resets the given permission for the active application under test.
   * Works for both Simulator and real devices using Xcode SDK 11.4+
   *
   * @param {PermissionService|number} service - One of the available service names. This could also be an integer protected resource identifier; see [this list](https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc)
   * @throws {Error} If permission reset fails on the device.
   * @this {XCUITestDriver}
   */
  async mobileResetPermission(service) {
    if (!service) {
      throw new Error(`The 'service' option is expected to be present`);
    }
    let resource;
    if (_.isString(service)) {
      resource = PermissionService[_.toLower(service)];
      if (!resource) {
        throw new Error(
          `The 'service' value must be one of ` + `${JSON.stringify(_.keys(PermissionService))}`,
        );
      }
    } else if (_.isInteger(service)) {
      resource = service;
    } else {
      throw new Error(
        `The 'service' value must be either a string or an integer. ` +
          `'${service}' is passed instead`,
      );
    }

    await this.proxyCommand('/wda/resetAppAuth', 'POST', {resource});
  },

  /**
   * Gets application permission state on a simulated device.
   *
   * **This method requires [WIX applesimutils](https://github.com/wix/AppleSimulatorUtils) to be installed on the Appium server host.**
   *
   * @param {string} bundleId - Bundle identifier of the target application
   * @param {import('./enum').PermissionService} service - Service name
   * @returns {Promise<import('./types').PermissionState>} Either 'yes', 'no', 'unset' or 'limited'
   * @throws {Error} If permission getting fails or the device is not a Simulator.
   * @this {XCUITestDriver}
   * @group Simulator Only
   */
  async mobileGetPermission(bundleId, service) {
    if (!service) {
      throw new Error(`The 'service' option is expected to be present`);
    }
    assertSimulator(this);

    return /** @type {import('./types').PermissionState} */ (
      await /** @type {import('../driver').Simulator} */ (this.device).getPermission(
        bundleId, String(service)
      )
    );
  },

  /**
   * Set application permission state on Simulator.
   *
   * @param {Record<Partial<import('./types').AccessRule>, import('./types').PermissionState>} access - One or more access rules to set.
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
    assertSimulator(this);

    await /** @type {import('../driver').Simulator} */ (this.device).setPermissions(bundleId, access);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
