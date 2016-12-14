import { exec } from 'teen_process';
import log from './logger';


async function getConnectedDevices () {
  let {stdout} = await exec('idevice_id', ['-l']);
  return stdout.trim().split('\n');
}

async function resetRealDevice (device, opts) {
  if (opts.bundleId && opts.fullReset) {
    let bundleId = opts.bundleId;
    log.debug(`Full reset requested. Will try to uninstall the app '${bundleId}'.`);
    if (!await device.isInstalled(bundleId)) {
      log.debug('App not installed. No need to uninstall');
      return;
    }
    try {
      await device.remove(bundleId);
    } catch (err) {
      log.error(`Could not remove '${bundleId}' from device`);
      throw err;
    }
    log.debug(`Removed '${bundleId}'`);
  }
}

async function runRealDeviceReset (device, opts) {
  if (!opts.noReset || opts.fullReset) {
    log.debug('Running ios real device reset flow');
    if (!opts.noReset) {
      await resetRealDevice(device, opts);
    }
  } else {
    log.debug("Reset not set, continuing");
  }
}

export { getConnectedDevices, runRealDeviceReset };
