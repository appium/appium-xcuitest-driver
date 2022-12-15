import { getSimulator } from 'appium-ios-simulator';
import Simctl from 'node-simctl';
import { resetTestProcesses } from 'appium-webdriveragent';
import _ from 'lodash';
import log from './logger';
import { util } from 'appium/support';
import { PLATFORM_NAME_IOS } from './desired-caps';


const APPIUM_SIM_PREFIX = 'appiumTest';
const SAFARI_OPTS_ALIASES_MAP = {
  safariAllowPopups: [
    ['WebKitJavaScriptCanOpenWindowsAutomatically', 'JavaScriptCanOpenWindowsAutomatically'],
    (x) => Number(Boolean(x)),
  ],
  safariIgnoreFraudWarning: [
    ['WarnAboutFraudulentWebsites'],
    (x) => Number(!x),
  ],
  safariOpenLinksInBackground: [
    ['OpenLinksInBackground'],
    (x) => Number(Boolean(x)),
  ]
};

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
 * @property {string?} deviceName - The name of the device to lookup
 * @property {string!} platformVersion - The platform version string
 * @property {string?} simulatorDevicesSetPath - The full path to the simulator devices set
 */

/**
 * Get a simulator which is already running.
 *
 * @param {SimulatorLookupOptions?} opts
 * @returns {Simulator?} The matched Simulator instance or `null` if no matching  device is found.
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
    if ((deviceName && device.name === deviceName) || !deviceName) {
      return await getSimulator(device.udid, {
        platform: device.platform,
        checkExistence: false,
        devicesSetPath,
      });
    }

    if (device.name.startsWith(APPIUM_SIM_PREFIX)
      && ((deviceName && device.name.endsWith(deviceName)) || !deviceName)) {
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
  const {
    noReset,
    fullReset,
    keychainsExcludePatterns,
    keepKeyChains,
    bundleId,
    app,
    browserName,
    enforceSimulatorShutdown,
  } = opts;
  if (noReset && !fullReset) {
    // noReset === true && fullReset === false
    log.debug('Reset: noReset is on. Leaving simulator as is');
    return;
  }
  if (!device) {
    log.debug('Reset: no device available. Skipping');
    return;
  }

  if (fullReset) {
    log.debug('Reset: fullReset is on. Cleaning simulator');
    await shutdownSimulator(device);
    const isKeychainsBackupSuccessful = (keychainsExcludePatterns || keepKeyChains)
      && await device.backupKeychains();
    await device.clean();
    if (isKeychainsBackupSuccessful) {
      await device.restoreKeychains(keychainsExcludePatterns || []);
      log.info(`Successfully restored keychains after full reset`);
    } else if (keychainsExcludePatterns || keepKeyChains) {
      log.warn('Cannot restore keychains after full reset, because ' +
        'the backup operation did not succeed');
    }
  } else if (bundleId) {
    // fastReset or noReset

    // Terminate the app under test if it is still running on Simulator
    try {
      await device.terminateApp(bundleId);
    } catch (err) {
      log.warn(`Reset: failed to terminate Simulator application with id "${bundleId}"`);
    }

    if (app) {
      log.info('Not scrubbing third party app in anticipation of uninstall');
    } else {
      const isSafari = _.toLower(browserName) === 'safari';
      try {
        if (isSafari) {
          await device.scrubSafari();
        } else {
          await device.scrubApp(bundleId);
        }
      } catch (err) {
        log.debug(err.stack);
        log.warn(err.message);
        log.warn(
          `Reset: could not scrub ${isSafari ? 'Safari browser' : 'application with id "' + opts.bundleId + '"'}. ` +
          `Leaving as is.`
        );
      }
    }

    if (enforceSimulatorShutdown && await device.isRunning()) {
      await shutdownSimulator(device);
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

/**
 * Configures Safari options based on the given session capabilities
 *
 * @param {*} sim Simulator instance
 * @param {object} opts Session capabilities
 * @return {boolean} true if any preferences have been updated
 */
async function setSafariPrefs (sim, opts = {}) {
  const safariSettings = _.cloneDeep(opts.safariGlobalPreferences ?? {});

  for (const [name, [aliases, valueConverter]] of _.toPairs(SAFARI_OPTS_ALIASES_MAP)) {
    if (!_.has(opts, name)) {
      continue;
    }

    for (const alias of aliases) {
      safariSettings[alias] = valueConverter(opts[name]);
    }
  }
  if (_.isEmpty(safariSettings)) {
    return false;
  }

  log.debug(`About to update Safari preferences: ${JSON.stringify(safariSettings)}`);
  await sim.updateSafariSettings(safariSettings);
  return true;
}

/**
 * Changes Simulator localization preferences
 *
 * @param {*} sim Simulator instance
 * @param {object} opts Session capabilities
 * @returns {boolean} True if preferences were changed
 */
async function setLocalizationPrefs (sim, opts = {}) {
  const {
    language,
    locale,
    calendarFormat,
  } = opts;
  const l10nConfig = {};
  if (language) {
    l10nConfig.language = {name: language};
  }
  if (locale) {
    l10nConfig.locale = {name: locale};
    if (calendarFormat) {
      l10nConfig.locale.calendar = calendarFormat;
    }
  }
  if (_.isEmpty(l10nConfig)) {
    return false;
  }

  log.debug(`About to update localization preferences: ${JSON.stringify(l10nConfig)}`);
  await sim.configureLocalization(l10nConfig);
  return true;
}


export {
  createSim, getExistingSim, runSimulatorReset, installToSimulator,
  shutdownSimulator, shutdownOtherSimulators, setSafariPrefs, setLocalizationPrefs
};
