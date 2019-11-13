import { utilities } from 'appium-ios-device';
import IOSDeploy from './ios-deploy';
import log from './logger';


async function getConnectedDevices () {
  return await utilities.getConnectedDevices();
}

async function getOSVersion (udid) {
  return await utilities.getOSVersion(udid);
}

async function resetRealDevice (device, opts) {
  if (!opts.bundleId || !opts.fullReset) {
    return;
  }

  let bundleId = opts.bundleId;
  log.debug(`Reset: fullReset requested. Will try to uninstall the app '${bundleId}'.`);
  if (!await device.isAppInstalled(bundleId)) {
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

async function runRealDeviceReset (device, opts) {
  if (!opts.noReset || opts.fullReset) {
    log.debug('Reset: running ios real device reset flow');
    if (!opts.noReset) {
      await resetRealDevice(device, opts);
    }
  } else {
    log.debug('Reset: fullReset not set. Leaving as is');
  }
}

async function installToRealDevice (device, app, bundleId, opts = {}) {
  if (!device.udid || !app) {
    log.debug('No device id or app, not installing to real device.');
    return;
  }

  const {
    noReset = false,
    timeout,
  } = opts;

  if (await device.isAppInstalled(bundleId)) {
    if (noReset) {
      log.debug(`App '${bundleId}' is already installed. No need to reinstall.`);
      return;
    }
    log.debug(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.remove(bundleId);
  }
  log.debug(`Installing '${app}' on device with UUID '${device.udid}'...`);
  await device.install(app, timeout);
  log.debug('The app has been installed successfully.');
}

function getRealDeviceObj (udid) {
  log.debug(`Creating iDevice object with udid '${udid}'`);
  return new IOSDeploy(udid);
}

export { getConnectedDevices, getOSVersion, runRealDeviceReset, installToRealDevice,
  getRealDeviceObj };
