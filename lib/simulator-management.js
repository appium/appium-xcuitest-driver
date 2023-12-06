import {getSimulator} from 'appium-ios-simulator';
import Simctl from 'node-simctl';
import {resetTestProcesses} from 'appium-webdriveragent';
import _ from 'lodash';
import log from './logger';
import {util} from 'appium/support';
import {UDID_AUTO, normalizePlatformName} from './utils';

const APPIUM_SIM_PREFIX = 'appiumTest';
const SAFARI_OPTS_ALIASES_MAP = /** @type {const} */ ({
  safariAllowPopups: [
    ['WebKitJavaScriptCanOpenWindowsAutomatically', 'JavaScriptCanOpenWindowsAutomatically'],
    (x) => Number(Boolean(x)),
  ],
  safariIgnoreFraudWarning: [['WarnAboutFraudulentWebsites'], (x) => Number(!x)],
  safariOpenLinksInBackground: [['OpenLinksInBackground'], (x) => Number(Boolean(x))],
});

/**
 * @typedef {Object} SimulatorCreationOptions
 * @property {string} deviceName - A name for the device
 * @property {string} platformVersion - The version of iOS to use
 * @property {string} [simulatorDevicesSetPath]
 * @property {string} [platformName]
 */
/**
 * Create a new simulator with `appiumTest-` prefix and return the object.
 *
 * @param {Partial<SimulatorCreationOptions>} caps - Capability set by a user. The options available are:
 * @returns {Promise<object>} Simulator object associated with the udid passed in.
 */
async function createSim(caps) {
  const {simulatorDevicesSetPath: devicesSetPath, deviceName, platformVersion} = caps;
  const platform = normalizePlatformName(caps.platformName);
  const simctl = new Simctl({devicesSetPath});
  if (!deviceName) {
    let deviceNames = 'none';
    try {
      deviceNames = await simctl
        .getDevices(platformVersion, platform)
        .map(({deviceName}) => deviceName);
    } catch (ign) {}
    throw new Error(
      `'deviceName' must be provided in order to create a new Simulator for ${platform} platform. ` +
        `Currently available device names: ${deviceNames}`,
    );
  }
  const simName = `${APPIUM_SIM_PREFIX}-${util.uuidV4().toUpperCase()}-${deviceName}`;
  log.debug(`Creating a temporary Simulator device '${simName}'`);
  const udid = await simctl.createDevice(simName, deviceName, platformVersion, {platform});
  return await getSimulator(udid, {
    platform,
    checkExistence: false,
    devicesSetPath,
  });
}

/**
 * @typedef {Object} SimulatorLookupOptions
 * @property {string} [deviceName] - The name of the device to lookup
 * @property {string} platformVersion - The platform version string
 * @property {string} [simulatorDevicesSetPath] - The full path to the simulator devices set
 * @property {string} [udid] - Simulator udid
 * @property {string} [platformName] The name of the current platform
 */

/**
 * Get an existing simulator matching the provided capabilities.
 *
 * @param {SimulatorLookupOptions} opts
 * @returns {Promise<any|null>} The matched Simulator instance or `null` if no matching  device is found.
 */
async function getExistingSim(opts = /** @type {SimulatorLookupOptions} */ ({})) {
  const {platformVersion, deviceName, udid, simulatorDevicesSetPath: devicesSetPath} = opts;

  const platform = normalizePlatformName(opts.platformName);
  const selectSim = async (/** @type {{ udid: string; platform: string; }} */ dev) =>
    await getSimulator(dev.udid, {
      platform,
      checkExistence: false,
      devicesSetPath,
    });

  const simctl = new Simctl({devicesSetPath});
  let devicesMap;
  if (udid && _.toLower(udid) !== UDID_AUTO) {
    log.debug(`Looking for an existing Simulator with UDID '${udid}'`);
    devicesMap = await simctl.getDevices(null, platform);
    for (const device of _.flatMap(_.values(devicesMap))) {
      if (device.udid === udid) {
        return await selectSim(device);
      }
    }
    return null;
  }

  if (!platformVersion) {
    log.debug(
      `Provide 'platformVersion' capability if you prefer an existing Simulator to be selected`,
    );
    return null;
  }

  const devices =
    devicesMap?.[platformVersion] ?? (await simctl.getDevices(platformVersion, platform));
  log.debug(
    `Looking for an existing Simulator with platformName: ${platform}, ` +
      `platformVersion: ${platformVersion}, deviceName: ${deviceName}`,
  );
  for (const device of devices) {
    if ((deviceName && device.name === deviceName) || !deviceName) {
      if (!deviceName) {
        log.debug(
          `The 'deviceName' capability value is empty. ` +
            `Selecting the first matching device '${device.name}' having the ` +
            `'platformVersion' set to ${platformVersion}`,
        );
      }
      return await selectSim(device);
    }
  }
  return null;
}

async function shutdownSimulator(device) {
  // stop XCTest processes if running to avoid unexpected side effects
  await resetTestProcesses(device.udid, true);
  await device.shutdown();
}

async function runSimulatorReset(device, opts) {
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
    const isKeychainsBackupSuccessful =
      (keychainsExcludePatterns || keepKeyChains) && (await device.backupKeychains());
    await device.clean();
    if (isKeychainsBackupSuccessful) {
      await device.restoreKeychains(keychainsExcludePatterns || []);
      log.info(`Successfully restored keychains after full reset`);
    } else if (keychainsExcludePatterns || keepKeyChains) {
      log.warn(
        'Cannot restore keychains after full reset, because ' +
          'the backup operation did not succeed',
      );
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
          `Reset: could not scrub ${
            isSafari ? 'Safari browser' : 'application with id "' + opts.bundleId + '"'
          }. ` + `Leaving as is.`,
        );
      }
    }

    if (enforceSimulatorShutdown && (await device.isRunning())) {
      await shutdownSimulator(device);
    }
  }
}

/**
 * @typedef {Object} InstallOptions
 *
 * @property {boolean} [skipUninstall] Whether to skip app uninstall before installing it
 * @property {boolean} [newSimulator=false] Whether the simulator is brand new
 */

/**
 * @param {any} device The simulator device object
 * @param {string} app The app to the path
 * @param {string} [bundleId] The bundle id to ensure it is already installed and uninstall it
 * @param {InstallOptions} opts
 */
async function installToSimulator(
  device,
  app,
  bundleId,
  opts = /** @type {InstallOptions} */ ({}),
) {
  if (!app) {
    log.debug('No app path is given. Nothing to install.');
    return;
  }

  const {skipUninstall, newSimulator = false} = opts;

  if (!skipUninstall && !newSimulator && bundleId && (await device.isAppInstalled(bundleId))) {
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

async function shutdownOtherSimulators(currentDevice) {
  const simctl = new Simctl({
    devicesSetPath: currentDevice.devicesSetPath,
  });
  const allDevices = _.flatMap(_.values(await simctl.getDevices()));
  const otherBootedDevices = allDevices.filter(
    (device) => device.udid !== currentDevice.udid && device.state === 'Booted',
  );
  if (_.isEmpty(otherBootedDevices)) {
    log.info('No other running simulators have been detected');
    return;
  }
  log.info(
    `Detected ${otherBootedDevices.length} other running ${util.pluralize(
      'Simulator',
      otherBootedDevices.length,
    )}.` + `Shutting them down...`,
  );
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
 * @param {any} sim Simulator instance
 * @param {object} opts Session capabilities
 * @return {Promise<boolean>} true if any preferences have been updated
 */
async function setSafariPrefs(sim, opts = {}) {
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
 * @param {any} sim Simulator instance
 * @param {object} opts Session capabilities
 * @returns {Promise<boolean>} True if preferences were changed
 */
async function setLocalizationPrefs(sim, opts = {}) {
  const {language, locale, calendarFormat, skipSyncUiDialogTranslation} = opts;
  const l10nConfig = {};
  if (language) {
    l10nConfig.language = {name: language, skipSyncUiDialogTranslation };
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
  createSim,
  getExistingSim,
  runSimulatorReset,
  installToSimulator,
  shutdownSimulator,
  shutdownOtherSimulators,
  setSafariPrefs,
  setLocalizationPrefs,
};
