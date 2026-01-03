import _ from 'lodash';
import {PermissionService} from './enum';
import {assertSimulator as _assertSimulator} from '../utils';
import type {XCUITestDriver} from '../driver';
import type {PermissionState} from './types';
import type {Simulator} from 'appium-ios-simulator';

/**
 * Resets the given permission for the active application under test.
 * Works for both Simulator and real devices using Xcode SDK 11.4+
 *
 * @param service - One of the available service names. This could also be an integer protected resource identifier; see [this list](https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc)
 * @throws If permission reset fails on the device.
 */
export async function mobileResetPermission(
  this: XCUITestDriver,
  service: PermissionService | number,
): Promise<void> {
  if (!service) {
    throw new Error(`The 'service' option is expected to be present`);
  }
  let resource: number;
  if (_.isString(service)) {
    resource = PermissionService[_.toLower(service) as keyof typeof PermissionService];
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
}

/**
 * Gets application permission state on a simulated device.
 *
 * **This method requires [WIX applesimutils](https://github.com/wix/AppleSimulatorUtils) to be installed on the Appium server host.**
 *
 * @param bundleId - Bundle identifier of the target application
 * @param service - Service name
 * @returns Either 'yes', 'no', 'unset' or 'limited'
 * @throws If permission getting fails or the device is not a Simulator.
 * @group Simulator Only
 */
export async function mobileGetPermission(
  this: XCUITestDriver,
  bundleId: string,
  service: PermissionService,
): Promise<PermissionState> {
  if (!service) {
    throw new Error(`The 'service' option is expected to be present`);
  }
  assertSimulator(this);

  return await (this.device as Simulator).getPermission(
    bundleId, String(service)
  ) as PermissionState;
}

/**
 * Set application permission state on Simulator.
 *
 * @param access - One or more access rules to set.
 * @param bundleId - Bundle identifier of the target application
 * @since Xcode SDK 11.4
 * @throws If permission setting fails or the device is not a Simulator.
 * @group Simulator Only
 */
export async function mobileSetPermissions(
  this: XCUITestDriver,
  access: Record<string, PermissionState>,
  bundleId: string,
): Promise<void> {
  if (!_.isPlainObject(access)) {
    throw new Error(`The 'access' option is expected to be a map`);
  }
  assertSimulator(this);

  await (this.device as Simulator).setPermissions(bundleId, access);
}

const assertSimulator = (driver: XCUITestDriver) => _assertSimulator.call(driver, 'Permission-related operations');
