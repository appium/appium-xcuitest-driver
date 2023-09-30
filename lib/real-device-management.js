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
  if (!device.udid || !app) {
    log.debug('No device id or app, not installing to real device.');
    return;
  }

  const {skipUninstall, strategy, timeout, shouldEnforceUninstall} = opts ?? {};
  const shouldUninstallApp = !skipUninstall && bundleId;

  if (shouldUninstallApp) {
    log.debug(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.remove(bundleId);
  }
  log.debug(`Installing '${app}' on device with UUID '${device.udid}'...`);

  try {
    await device.install(app, timeout, strategy);
  } catch (e) {
    // Do nothing if the session did not require to enforce uninstalling the application.
    if (!shouldEnforceUninstall) {
      throw e;
    }

    if (!bundleId) {
      log.warn(`An error occurred during installing '${app}'. No bundle id was given, ` +
      `thus Appium have not tried to uninstall the app. Original error: ${e.message}`);
      throw e;
    }

    // Want to clarify the device's application installation state in this situation.
    if (!e.message.includes('MismatchedApplicationIdentifierEntitlement')) {
      const appInstalled = await device.isAppInstalled(bundleId);
      if (shouldUninstallApp) {
        if (appInstalled) {
          log.warn(`An error occurred during installing '${app}'. '${bundleId}' ` +
            `should have been uninstalled since Appium tried to uninstall the app. ` +
            `Original error: ${e.message}`);
        } else {
          log.warn(`An error occurred during installing '${app}'. '${bundleId}' might ` +
            `be offload state, or cached temporary while Appium tried to uninstall the app. ` +
            `Original error: ${e.message}`);
        }
      } else {
        if (appInstalled) {
          log.warn(`An error occurred during installing '${app}'. '${bundleId}' exists ` +
            `since no request to remove '${bundleId}' was given before installing the app. ` +
            `Original error: ${e.message}`);
        } else {
          log.warn(`An error occurred during installing '${app}'. '${bundleId}' may not exist ` +
            `and no request to remove '${bundleId}' was given before installing the app. ` +
            `Original error: ${e.message}`);
        }
      }
      throw e;
    }

    // This case occurs only when the app installation is failed as different signature.
    log.info(`The application ${bundleId} might be remained as a cache or offload state with different application identifier. ` +
      'Going to uninstall the application explicitly to clear the data and retrying to install the given application again.');

    await device.remove(bundleId);
    await device.install(app, timeout, strategy);
  }
  log.debug('The app has been installed successfully.');
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
