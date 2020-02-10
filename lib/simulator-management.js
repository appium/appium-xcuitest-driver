import { getSimulator } from 'appium-ios-simulator';
import Simctl from 'node-simctl';
import { resetTestProcesses } from 'appium-webdriveragent';
import _ from 'lodash';
import log from './logger';
import UUID from 'uuid-js';
import { util } from 'appium-support';
import { PLATFORM_NAME_IOS } from './desired-caps';


const APPIUM_SIM_PREFIX = 'appiumTest';

/**
 * Capability set by a user
 *
 * @property {string} deviceName - A name for the device
 * @property {string} platformVersion - The version of iOS to use
 */
/**
 * Create a new simulator with `appiumTest-` prefix and return the object.
 *
 * @param {object} SimCreationCaps - Capability set by a user. The options available are:
 * @property {string} platform [iOS] - Platform name in order to specify runtime such as 'iOS', 'tvOS', 'watchOS'
 * @returns {object} Simulator object associated with the udid passed in.
 */
async function createSim (caps, platform = PLATFORM_NAME_IOS) {
  const udid = await new Simctl().createDevice(
    `${APPIUM_SIM_PREFIX}-${UUID.create().toString().toUpperCase()}-${caps.deviceName}`,
    caps.deviceName,
    caps.platformVersion,
    {platform},
  );
  return await getSimulator(udid, {
    platform,
    checkExistence: false,
  });
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
  let appiumTestDevice;

  for (const device of _.values(await new Simctl().getDevices(opts.platformVersion))) {
    if (device.name === opts.deviceName) {
      return await getSimulator(device.udid, {
        platform: device.platform,
        checkExistence: false,
      });
    }

    if (device.name.startsWith(APPIUM_SIM_PREFIX) && device.name.endsWith(opts.deviceName)) {
      appiumTestDevice = device;
      // choose the first booted simulator
      if (device.state === 'Booted') {
        break;
      }
    }
  }

  if (appiumTestDevice) {
    log.warn(`Unable to find device '${opts.deviceName}'. Found '${appiumTestDevice.name}' (udid: '${appiumTestDevice.udid}') instead`);
    return await getSimulator(appiumTestDevice.udid, {
      platform: appiumTestDevice.platform,
      checkExistence: false,
    });
  }
  return null;
}

async function shutdownSimulator (device) {
  // stop XCTest processes if running to avoid unexpected side effects
  await resetTestProcesses(device.udid, true);
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
    // fastReset or noReset

    // Terminate the app under test if it is still running on Simulator
    // Termination is not needed if Simulator is not running
    if (await device.isRunning()) {
      if (opts.enforceSimulatorShutdown) {
        await shutdownSimulator(device);
      } else {
        try {
          await device.simctl.terminateApp(opts.bundleId);
        } catch (err) {
          log.warn(`Reset: failed to terminate Simulator application with id "${opts.bundleId}"`);
        }
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
        // iOS 8+ does not need basename
        await device.scrubCustomApp('', opts.bundleId);
      }
    } catch (err) {
      log.warn(err.message);
      log.warn(`Reset: could not scrub ${isSafari ? 'Safari browser' : 'application with id "' + opts.bundleId + '"'}. Leaving as is.`);
    }
  }
}

/**
 * @typedef {Object} InstallOptions
 *
 * @property {?boolean} noReset [false] Whether to disable reset
 * @property {?boolean} newSimulator [false] Whether the simulator is brand new
 */

/**
 * @param {object} device The simulator device object
 * @param {?string} app The app to the path
 * @param {string} bundleId The bundle id to ensure
 *                          it is already installed and uninstall it
 * @param {?InstallOptions} opts
 */
async function installToSimulator (device, app, bundleId, opts = {}) {
  if (!app) {
    log.debug('No app path is given. Nothing to install.');
    return;
  }

  const {
    noReset = true,
    newSimulator = false,
  } = opts;

  if (!newSimulator && bundleId && await device.isAppInstalled(bundleId)) {
    if (noReset) {
      log.debug(`App '${bundleId}' is already installed. No need to reinstall.`);
      return;
    }
    log.debug(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.removeApp(bundleId);
  }

  log.debug(`Installing '${app}' on Simulator with UUID '${device.udid}'...`);
  try {
    await device.installApp(app);
  } catch (e) {
    // it sometimes fails on Xcode 10 because of a race condition
    log.info(`Got an error on '${app}' install: ${e.message}`);
    log.info('Retrying application install');
    await device.installApp(app);
  }
  log.debug('The app has been installed successfully.');
}

async function shutdownOtherSimulators (currentDevice) {
  const simctl = new Simctl();
  const allDevices = _.flatMap(_.values(await simctl.getDevices()));
  const otherBootedDevices = allDevices.filter((device) => device.udid !== currentDevice.udid && device.state === 'Booted');
  if (_.isEmpty(otherBootedDevices)) {
    log.info('No other running simulators have been detected');
    return;
  }
  log.info(`Detected ${otherBootedDevices.length} other running ${util.pluralize('Simulator', otherBootedDevices.length)}.` +
    `Shutting them down...`);
  for (const {udid} of otherBootedDevices) {
    // It is necessary to stop the corresponding xcodebuild process before killing
    // the simulator, otherwise it will be automatically restarted
    await resetTestProcesses(udid, true);
    simctl.udid = udid;
    await simctl.shutdownDevice();
  }
}

export { createSim, getExistingSim, runSimulatorReset, installToSimulator,
  shutdownSimulator, shutdownOtherSimulators };
