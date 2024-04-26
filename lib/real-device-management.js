import _ from 'lodash';
import {buildSafariPreferences} from './app-utils';
import {utilities} from 'appium-ios-device';

const DEFAULT_APP_INSTALLATION_TIMEOUT_MS = 8 * 60 * 1000;

/**
 * @typedef {Object} InstallOptions
 *
 * @property {boolean} [skipUninstall] Whether to skip app uninstall before installing it
 * @property {number} [timeout=480000] App install timeout
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

  const {
    skipUninstall,
    timeout = DEFAULT_APP_INSTALLATION_TIMEOUT_MS,
  } = opts;

  if (!skipUninstall) {
    this.log.info(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.remove(bundleId);
  }
  this.log.debug(`Installing '${app}' on the device with UUID '${device.udid}'`);

  try {
    await device.install(app, bundleId, {
      timeoutMs: timeout,
    });
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
    await device.install(app, bundleId, {
      timeoutMs: timeout,
    });
    this.log.debug('The app has been installed after one retrial.');
  }
}

/**
 * @this {import('./driver').XCUITestDriver}
 * @returns {Promise<void>}
 */
export async function runRealDeviceReset() {
  if (!this.opts.noReset || this.opts.fullReset) {
    this.log.debug('Reset: running ios real device reset flow');
    if (!this.opts.noReset) {
      await /** @type {RealDevice} */ (this.device).reset(this.opts);
    }
  } else {
    this.log.debug('Reset: fullReset not set. Leaving as is');
  }
}

/**
 * Configures Safari startup options based on the given session capabilities.
 *
 * !!! This method mutates driver options.
 *
 * @this {import('./driver').XCUITestDriver}
 * @return {boolean} true if process arguments have been modified
 */
export function applySafariStartupArgs() {
  const prefs = buildSafariPreferences(this.opts);
  if (_.isEmpty(prefs)) {
    return false;
  }

  const args = _.toPairs(prefs)
    .flatMap(([key, value]) => [_.startsWith(key, '-') ? key : `-${key}`, String(value)]);
  this.log.debug(`Generated Safari command line arguments: ${args.join(' ')}`);
  if (_.isPlainObject(this.opts.processArguments)) {
    this.opts.processArguments.args = [...(this.opts.processArguments.args ?? []), ...args];
  } else {
    this.opts.processArguments = {args};
  }
  return true;
}

/**
 * @this {XCUITestDriver}
 * @returns {Promise<string>}
 */
export async function detectUdid() {
  this.log.debug('Auto-detecting real device udid...');
  const udids = await utilities.getConnectedDevices();
  if (_.isEmpty(udids)) {
    throw new Error('No real devices are connected to the host');
  }
  const udid = _.last(udids);
  if (udids.length > 1) {
    this.log.info(`Multiple devices found: ${udids.join(', ')}`);
    this.log.info(`Choosing '${udid}'. Consider settings the 'udid' capability if another device must be selected`);
  }
  this.log.debug(`Detected real device udid: '${udid}'`);
  return udid;
}

/**
 * @typedef {import('./real-device').RealDevice} RealDevice}
 * @typedef {import('./driver').XCUITestDriver} XCUITestDriver
 */
