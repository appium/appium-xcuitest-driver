import {utilities} from 'appium-ios-device';
import RealDevice from './real-device';
import {SAFARI_BUNDLE_ID} from './app-utils';

export async function getConnectedDevices() {
  return await utilities.getConnectedDevices();
}

/**
 * @param {string} udid
 * @returns {Promise<string>}
 */
export async function getOSVersion(udid) {
  return await utilities.getOSVersion(udid);
}

/**
 * @this {import('./driver').XCUITestDriver}
 * @returns {Promise<void>}
 */
export async function resetRealDevice() {
  const {bundleId, fullReset} = this.opts;
  if (!bundleId) {
    return;
  }

  const device = /** @type {RealDevice} */ (this.device);

  if (bundleId === SAFARI_BUNDLE_ID) {
    this.log.debug('Reset requested. About to terminate Safari');
    await device.terminateApp(bundleId, String(this.opts.platformVersion));
    return;
  }

  if (!fullReset) {
    return;
  }

  this.log.debug(`Reset: fullReset requested. Will try to uninstall the app '${bundleId}'.`);
  if (!(await device.isAppInstalled(bundleId))) {
    this.log.debug('Reset: app not installed. No need to uninstall');
    return;
  }

  try {
    await device.remove(bundleId);
  } catch (err) {
    this.log.error(`Reset: could not remove '${bundleId}' from device: ${err.message}`);
    throw err;
  }
  this.log.debug(`Reset: removed '${bundleId}'`);
}

/**
 * @this {import('./driver').XCUITestDriver}
 * @returns {Promise<void>}
 */
export async function runRealDeviceReset() {
  if (!this.opts.noReset || this.opts.fullReset) {
    this.log.debug('Reset: running ios real device reset flow');
    if (!this.opts.noReset) {
      await resetRealDevice.bind(this)();
    }
  } else {
    this.log.debug('Reset: fullReset not set. Leaving as is');
  }
}

/**
 * @typedef {Object} InstallOptions
 *
 * @property {boolean} [skipUninstall] Whether to skip app uninstall before installing it
 * @property {'serial'|'parallel'|'ios-deploy'} [strategy='serial'] One of possible install strategies ('serial', 'parallel', 'ios-deploy')
 * @property {number} [timeout] App install timeout
 * @property {boolean} [shouldEnforceUninstall] Whether to enforce the app uninstallation. e.g. fullReset, or enforceAppInstall is true
 */

/**
 * @this {import('./driver').XCUITestDriver}
 * @param {string} [app] The app to the path
 * @param {string} [bundleId] The bundle id to ensure it is already installed and uninstall it
 * @param {InstallOptions} [opts={}]
 */
export async function installToRealDevice(app, bundleId, opts = {}) {
  const device = /** @type {RealDevice} */ (this.device);

  if (!device.udid || !app || !bundleId) {
    this.log.debug('No device id, app or bundle id, not installing to real device.');
    return;
  }

  const {skipUninstall, strategy, timeout} = opts;

  if (!skipUninstall) {
    this.log.info(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.remove(bundleId);
  }
  this.log.debug(`Installing '${app}' on device with UUID '${device.udid}'...`);

  try {
    await device.install(app, timeout, strategy);
    this.log.debug('The app has been installed successfully.');
  } catch (e) {
    // Want to clarify the device's application installation state in this situation.

    if (!skipUninstall || !e.message.includes('MismatchedApplicationIdentifierEntitlement')) {
      // Other error cases that could not be recoverable by here.
      // Exact error will be in the log.

      // We cannot recover 'ApplicationVerificationFailed' situation since this reason is clearly the app's provisioning profile was invalid.
      // [XCUITest] Error installing app '/path/to.app': Unexpected data: {"Error":"ApplicationVerificationFailed","ErrorDetail":-402620395,"ErrorDescription":"Failed to verify code signature of /path/to.app : 0xe8008015 (A valid provisioning profile for this executable was not found.)"}
      throw e;
    }

    // If the error was by below error case, we could recover the situation
    // by uninstalling the device's app bundle id explicitly regard less the app exists on the device or not (e.g. offload app).
    // [XCUITest] Error installing app '/path/to.app': Unexpected data: {"Error":"MismatchedApplicationIdentifierEntitlement","ErrorDescription":"Upgrade's application-identifier entitlement string (TEAM_ID.com.kazucocoa.example) does not match installed application's application-identifier string (ANOTHER_TEAM_ID.com.kazucocoa.example); rejecting upgrade."}
    this.log.info(`The application identified by '${bundleId}' cannot be installed because it might ` +
      `be already cached on the device, probably with a different signature. ` +
      `Will try to remove it and install a new copy. Original error: ${e.message}`);
    await device.remove(bundleId);
    await device.install(app, timeout, strategy);
    this.log.debug('The app has been installed after one retrial.');
  }
}

/**
 * @this {import('./driver').XCUITestDriver}
 * @returns {RealDevice}
 */
export function getRealDeviceObj() {
  this.log.debug(`Creating iDevice object with udid '${this.opts.udid}'`);
  return new RealDevice(this.opts.udid, this.log);
}
