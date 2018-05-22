import path from 'path';
import { getSimulator } from 'appium-ios-simulator';
import { createDevice, getDevices, terminate, shutdown } from 'node-simctl';
import { resetXCTestProcesses } from './utils';
import _ from 'lodash';
import log from './logger';

/**
 * Create a new simulator with `appiumTest-` prefix and return the object.
 *
 * @param {object} caps - Capability set by a user. The options available are:
 *   - `deviceName` - a name for the device
 *   - `platformVersion` - the version of iOS to use
 * @returns {object} Simulator object associated with the udid passed in.
 */
async function createSim (caps) {
  const appiumTestDeviceName = `appiumTest-${caps.deviceName}`;
  const udid = await createDevice(appiumTestDeviceName, caps.deviceName, caps.platformVersion);
  return await getSimulator(udid);
}

/**
 * Get a simulator which is already running.
 *
 * @param {object} opts - Capability set by a user. The options available are:
 *   - `deviceName` - a name for the device
 *   - `platformVersion` - the version of iOS to use
 * @returns {?object} Simulator object associated with the udid passed in. Or null if no device is running.
 */
async function getExistingSim (opts) {
  const devices = await getDevices(opts.platformVersion);
  const appiumTestDeviceName = `appiumTest-${opts.deviceName}`;

  let appiumTestDevice;

  for (const device of _.values(devices)) {
    if (device.name === opts.deviceName) {
      return await getSimulator(device.udid);
    }

    if (device.name === appiumTestDeviceName) {
      appiumTestDevice = device;
    }
  }

  if (appiumTestDevice) {
    log.warn(`Unable to find device '${opts.deviceName}'. Found '${appiumTestDevice.name}' (udid: '${appiumTestDevice.udid}') instead`);
    return await getSimulator(appiumTestDevice.udid);
  }
  return null;
}

async function shutdownSimulator (device) {
  // stop XCTest processes if running to avoid unexpected side effects
  await resetXCTestProcesses(device.udid, true);
  await device.shutdown();
}

async function runSimulatorReset (device, opts) {
  if (opts.noReset && !opts.fullReset) {
    // noReset === true && fullReset === false
    log.debug('Reset: noReset is on. Leaving simulator as is');
    return;
  }

  if (!device) {
    log.debug('Reset: no device available. Skipping');
    return;
  }

  if (opts.fullReset) {
    log.debug('Reset: fullReset is on. Cleaning simulator');
    await shutdownSimulator(device);
    let isKeychainsBackupSuccessful = false;
    if (opts.keychainsExcludePatterns || opts.keepKeyChains) {
      isKeychainsBackupSuccessful = await device.backupKeychains();
    }
    await device.clean();
    if (isKeychainsBackupSuccessful) {
      await device.restoreKeychains(opts.keychainsExcludePatterns || []);
      log.info(`Successfully restored keychains after full reset`);
    } else if (opts.keychainsExcludePatterns || opts.keepKeyChains) {
      log.warn('Cannot restore keychains after full reset, because ' +
               'the backup operation did not succeed');
    }
  } else if (opts.bundleId) {
    // Terminate the app under test if it is still running on Simulator
    // Termination is not needed if Simulator is not running
    if (await device.isRunning()) {
      if (device.xcodeVersion.major >= 8) {
        try {
          await terminate(device.udid, opts.bundleId);
        } catch (err) {
          log.warn(`Reset: failed to terminate Simulator application with id "${opts.bundleId}"`);
        }
      } else {
        await shutdownSimulator(device);
      }
    }
    if (opts.app) {
      log.info('Not scrubbing third party app in anticipation of uninstall');
      return;
    }
    const isSafari = (opts.browserName || '').toLowerCase() === 'safari';
    try {
      if (isSafari) {
        await device.cleanSafari();
      } else {
        await device.scrubCustomApp(path.basename(opts.app), opts.bundleId);
      }
    } catch (err) {
      log.warn(err.message);
      log.warn(`Reset: could not scrub ${isSafari ? 'Safari browser' : 'application with id "' + opts.bundleId + '"'}. Leaving as is.`);
    }
  }
}

async function installToSimulator (device, app, bundleId, noReset = true) {
  if (!app) {
    log.debug('No app path is given. Nothing to install.');
    return;
  }

  if (bundleId) {
    if (await device.isAppInstalled(bundleId)) {
      if (noReset) {
        log.debug(`App '${bundleId}' is already installed. No need to reinstall.`);
        return;
      }
      log.debug(`Reset requested. Removing app with id '${bundleId}' from the device`);
      await device.removeApp(bundleId);
    }
  }
  log.debug(`Installing '${app}' on Simulator with UUID '${device.udid}'...`);
  await device.installApp(app);
  log.debug('The app has been installed successfully.');
}

async function shutdownOtherSimulators (currentDevice) {
  const allDevices = _.flatMap(_.values(await getDevices()));
  const otherBootedDevices = allDevices.filter((device) => device.udid !== currentDevice.udid && device.state === 'Booted');
  if (_.isEmpty(otherBootedDevices)) {
    log.info('No other running simulators have been detected');
    return;
  }
  log.info(`Detected ${otherBootedDevices.length} other running Simulator${otherBootedDevices.length === 1 ? '' : 's'}.` +
           `Shutting ${otherBootedDevices.length === 1 ? 'it' : 'them'} down...`);
  for (const {udid} of otherBootedDevices) {
    // It is necessary to stop the corresponding xcodebuild process before killing
    // the simulator, otherwise it will be automatically restarted
    await resetXCTestProcesses(udid, true);
    await shutdown(udid);
  }
}

export { createSim, getExistingSim, runSimulatorReset, installToSimulator,
         shutdownSimulator, shutdownOtherSimulators };
