import {utilities} from 'appium-ios-device';
import IOSDeploy from './ios-deploy';
import log from './logger';
import {SAFARI_BUNDLE_ID} from './app-utils';

async function getConnectedDevices() {
  return await utilities.getConnectedDevices();
}

async function getOSVersion(udid) {
  return await utilities.getOSVersion(udid);
}

async function resetRealDevice(device, opts) {
  const {bundleId, fullReset} = opts;
  if (!bundleId) {
    return;
  }

  if (bundleId === SAFARI_BUNDLE_ID) {
    log.debug('Reset requested. About to terminate Safari');
    await device.terminateApp(bundleId);
    return;
  }

  if (!fullReset) {
    return;
  }

  log.debug(`Reset: fullReset requested. Will try to uninstall the app '${bundleId}'.`);
  if (!(await device.isAppInstalled(bundleId))) {
    log.debug('Reset: app not installed. No need to uninstall');
    return;
  }
  try {
    await device.remove(bundleId);
  } catch (err) {
    log.error(`Reset: could not remove '${bundleId}' from device: ${err.message}`);
    throw err;
  }
  log.debug(`Reset: removed '${bundleId}'`);
}

async function runRealDeviceReset(device, opts) {
  if (!opts.noReset || opts.fullReset) {
    log.debug('Reset: running ios real device reset flow');
    if (!opts.noReset) {
      await resetRealDevice(device, opts);
    }
  } else {
    log.debug('Reset: fullReset not set. Leaving as is');
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
 * @param {IOSDeploy} device The device instance
 * @param {string} [app] The app to the path
 * @param {string} [bundleId] The bundle id to ensure it is already installed and uninstall it
 * @param {InstallOptions} [opts]
 */
async function installToRealDevice(device, app, bundleId, opts) {
  if (!device.udid || !app || !bundleId) {
    log.debug('No device id, app or bundle id, not installing to real device.');
    return;
  }

  const {skipUninstall, strategy, timeout} = opts ?? {};

  if (!skipUninstall) {
    log.info(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.remove(bundleId);
  }
  log.debug(`Installing '${app}' on device with UUID '${device.udid}'...`);

  try {
    await device.install(app, timeout, strategy);
    log.debug('The app has been installed successfully.');
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
    log.info(`The application identified by '${bundleId}' cannot be installed because it might ` +
      `be already cached on the device, probably with a different signature. ` +
      `Will try to remove it and install a new copy. Original error: ${e.message}`);
    await device.remove(bundleId);
    await device.install(app, timeout, strategy);
    log.debug('The app has been installed after one retrial.');
  }
}

function getRealDeviceObj(udid) {
  log.debug(`Creating iDevice object with udid '${udid}'`);
  return new IOSDeploy(udid);
}

export {
  getConnectedDevices,
  getOSVersion,
  runRealDeviceReset,
  installToRealDevice,
  getRealDeviceObj,
};
