import { exec } from 'teen_process';
import IOSDeploy from './ios-deploy';
import log from './logger';


async function getConnectedDevices () {
  try {
    let {stdout} = await exec('idevice_id', ['-l']);
    return stdout.trim().split('\n');
  } catch (err) {
    if (err.message.indexOf(`Command 'idevice_id' not found`) === -1) {
      throw err;
    }
    let msg = `The 'idevice_id' program is not installed. If you are running ` +
              `a real device test it is necessary. Install with 'brew install ` +
              `libimobiledevice --HEAD'`;
    log.warn(msg);
    return [];
  }
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

async function installToRealDevice (device, app, bundleId, noReset = true) {
  if (!device.udid || !app) {
    log.debug('No device id or app, not installing to real device.');
    return;
  }

  if (await device.isAppInstalled(bundleId)) {
    if (noReset) {
      log.debug(`App '${bundleId}' is already installed. No need to reinstall.`);
      return;
    }
    log.debug(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.remove(bundleId);
  }
  log.debug(`Installing '${app}' on device with UUID '${device.udid}'...`);
  await device.install(app);
  log.debug('The app has been installed successfully.');
}

async function getRealDeviceObj (udid) {
  log.debug(`Creating iDevice object with udid '${udid}'`);
  try {
    //This iDevice object could be ideviceinstaller (node-idevice) for future once we have ideviceinstaller working for ios 10
    let device = new IOSDeploy(udid);
    await device.checkStatus();
    return device;
  } catch (e) {
    let msg = 'Could not initialize ios-deploy make sure it is installed ' +
              '(npm install -g ios-deploy) and works on your system.';
    log.errorAndThrow(msg);
  }
}

export { getConnectedDevices, runRealDeviceReset, installToRealDevice,
         getRealDeviceObj };
