import { getSimulator } from 'appium-ios-simulator';
import Simctl from 'node-simctl';
import { resetTestProcesses } from 'appium-webdriveragent';
import _ from 'lodash';
import log from './logger';
import { util } from 'appium-support';
import { PLATFORM_NAME_IOS } from './desired-caps';


const APPIUM_SIM_PREFIX = 'appiumTest';
const SETTINGS_CAPS = [
  'locationServicesEnabled',
  'locationServicesAuthorized',
];
const SAFARI_SETTINGS_CAPS = [
  'safariAllowPopups',
  'safariIgnoreFraudWarning',
  'safariOpenLinksInBackground',
];

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
  const devicesSetPath = caps.simulatorDevicesSetPath;
  const udid = await new Simctl({devicesSetPath}).createDevice(
    `${APPIUM_SIM_PREFIX}-${util.uuidV4().toUpperCase()}-${caps.deviceName}`,
    caps.deviceName,
    caps.platformVersion,
    {platform},
  );
  return await getSimulator(udid, {
    platform,
    checkExistence: false,
    devicesSetPath,
  });
}

/**
 * @typedef {Object} SimulatorLookupOptions
 * @property {!string} deviceName - The name of the device to lookup
 * @property {!string} platformVersion - The platform version string
 * @property {?string} simulatorDevicesSetPath - The full path to the simulator devices set
 */

/**
 * Get a simulator which is already running.
 *
 * @param {?SimulatorLookupOptions} opts
 * @returns {?Simulator} The matched Simulator instance or `null` if no matching  device is found.
 */
async function getExistingSim (opts = {}) {
  const {
    platformVersion,
    deviceName,
    simulatorDevicesSetPath: devicesSetPath,
  } = opts;

  let appiumTestDevice;
  const simctl = new Simctl({devicesSetPath});
  for (const device of _.values(await simctl.getDevices(platformVersion))) {
    if (device.name === deviceName) {
      return await getSimulator(device.udid, {
        platform: device.platform,
        checkExistence: false,
        devicesSetPath,
      });
    }

    if (device.name.startsWith(APPIUM_SIM_PREFIX) && device.name.endsWith(deviceName)) {
      appiumTestDevice = device;
      // choose the first booted simulator
      if (device.state === 'Booted') {
        break;
      }
    }
  }

  if (appiumTestDevice) {
    log.warn(`Unable to find device '${deviceName}'. ` +
      `Found '${appiumTestDevice.name}' (udid: '${appiumTestDevice.udid}') instead`);
    return await getSimulator(appiumTestDevice.udid, {
      platform: appiumTestDevice.platform,
      checkExistence: false,
      devicesSetPath,
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
 * @param {string} bundleId The bundle id to ensure it is already installed and uninstall it
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
  const simctl = new Simctl({
    devicesSetPath: currentDevice.devicesSetPath
  });
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

async function launchAndQuitSimulator (sim, opts = {}) {
  log.debug('No simulator directories found.');
  const { safari, timeout } = opts;
  return timeout
    ? await sim.launchAndQuit(safari, timeout)
    : await sim.launchAndQuit(safari);
}

function checkPreferences (settings, opts = {}) {
  for (let setting of settings) {
    if (_.has(opts, setting)) {
      return true;
    }
  }
  return false;
}

async function setLocaleAndPreferences (sim, opts, safari = false, shutdownFn = _.noop) {
  const localConfig = await setLocale(sim, opts, {}, safari);
  const prefsUpdated = await setPreferences(sim, opts, safari);
  if (localConfig._updated || prefsUpdated) {
    log.debug('Updated settings. Rebooting the simulator if it is already open');
    await shutdownFn(sim);
  } else {
    log.debug('Setting did not need to be updated');
  }
  delete localConfig._updated;
  return localConfig;
}

// pass in the simulator so that other systems that use the function can supply
// whatever they have
async function setLocale (sim, opts, localeConfig = {}, safari = false) {
  if (!opts.language && !opts.locale && !opts.calendarFormat) {
    log.debug('No reason to set locale');
    return {
      _updated: false,
    };
  }

  // we need the simulator to have its directories in place
  if (await sim.isFresh()) {
    await launchAndQuitSimulator(sim, {
      safari,
      timeout: opts.simulatorStartupTimeout,
    });
  }

  log.debug('Setting locale information');
  localeConfig = {
    language: opts.language || localeConfig.language,
    locale: opts.locale || localeConfig.locale,
    calendarFormat: opts.calendarFormat || localeConfig.calendarFormat,
    _updated: false,
  };

  try {
    let updated = await sim.updateLocale(opts.language, opts.locale, opts.calendarFormat);
    if (updated) {
      localeConfig._updated = true;
    }
  } catch (e) {
    log.errorAndThrow(`Appium was unable to set locale info: ${e}`);
  }

  return localeConfig;
}

async function setPreferences (sim, opts, safari = false) {
  let needToSetPrefs = checkPreferences(SETTINGS_CAPS, opts);
  let needToSetSafariPrefs = checkPreferences(SAFARI_SETTINGS_CAPS, opts);
  if (!needToSetPrefs && !needToSetSafariPrefs) {
    log.debug('No iOS / app preferences to set');
    return false;
  }

  log.debug('Setting iOS and app preferences');

  if (await sim.isFresh()) {
    await launchAndQuitSimulator(sim, {
      safari,
      timeout: opts.simulatorStartupTimeout,
    });
  }

  let updated = false;
  try {
    if (needToSetPrefs) {
      updated = await setLocServicesPrefs(sim, opts);
    }
  } catch (e) {
    log.error('Error setting location services preferences, prefs will not work');
    log.error(e);
  }

  try {
    if (needToSetSafariPrefs) {
      updated = await setSafariPrefs(sim, opts) || updated;
    }
  } catch (e) {
    log.error('Error setting safari preferences, prefs will not work');
    log.error(e);
  }

  return updated;
}

async function setLocServicesPrefs (sim, opts = {}) {
  let locServ = _.find([opts.locationServicesEnabled, opts.locationServicesAuthorized], (c) => !_.isUndefined(c));
  if (!_.isUndefined(locServ)) {
    locServ = locServ ? 1 : 0;
    log.debug(`Setting location services to ${locServ}`);
    await sim.updateSettings('locationServices', {
      LocationServicesEnabled: locServ,
      'LocationServicesEnabledIn7.0': locServ,
      'LocationServicesEnabledIn8.0': locServ
    });
  }
  if (!_.isUndefined(opts.locationServicesAuthorized)) {
    if (!opts.bundleId) {
      let msg = "Can't set location services for app without bundle ID";
      log.errorAndThrow(msg);
    }
    let locAuth = !!opts.locationServicesAuthorized;
    if (locAuth) {
      log.debug('Authorizing location services for app');
    } else {
      log.debug('De-authorizing location services for app');
    }
    await sim.updateLocationSettings(opts.bundleId, locAuth);
  }
}

async function setSafariPrefs (sim, opts = {}) {
  let safariSettings = {};

  if (_.has(opts, 'safariAllowPopups')) {
    const val = !!opts.safariAllowPopups;
    log.debug(`Setting javascript window opening to '${val}'`);
    safariSettings.WebKitJavaScriptCanOpenWindowsAutomatically = val;
    safariSettings.JavaScriptCanOpenWindowsAutomatically = val;
  }
  if (_.has(opts, 'safariIgnoreFraudWarning')) {
    const val = !opts.safariIgnoreFraudWarning;
    log.debug(`Setting fraudulent website warning to '${val}'`);
    safariSettings.WarnAboutFraudulentWebsites = val;
  }
  if (_.has(opts, 'safariOpenLinksInBackground')) {
    const val = opts.safariOpenLinksInBackground ? 1 : 0;
    log.debug(`Setting opening links in background to '${!!val}'`);
    safariSettings.OpenLinksInBackground = val;
  }
  return (_.size(safariSettings) > 0)
    ? await sim.updateSafariSettings(safariSettings)
    : false;
}

export {
  createSim, getExistingSim, runSimulatorReset, installToSimulator,
  shutdownSimulator, shutdownOtherSimulators,
  setLocale, setPreferences, setLocaleAndPreferences,
};
