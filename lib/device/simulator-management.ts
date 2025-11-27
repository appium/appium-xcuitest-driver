import {getSimulator, type Simulator, type LocalizationOptions} from 'appium-ios-simulator';
import {Simctl} from 'node-simctl';
import {resetTestProcesses} from 'appium-webdriveragent';
import _ from 'lodash';
import {util, timing} from 'appium/support';
import {UDID_AUTO, normalizePlatformName} from '../utils';
import {buildSafariPreferences} from '../app-utils';
import type { XCUITestDriver } from '../driver';

const APPIUM_SIM_PREFIX = 'appiumTest';

/**
 * Create a new simulator with `appiumTest-` prefix and return the object.
 *
 * @returns Simulator object associated with the udid passed in.
 */
export async function createSim(this: XCUITestDriver): Promise<Simulator> {
  const {simulatorDevicesSetPath: devicesSetPath, deviceName, platformVersion} = this.opts;
  const platform = normalizePlatformName(this.opts.platformName);
  const simctl = new Simctl({devicesSetPath});
  if (!deviceName) {
    let deviceNames: string | string[] = 'none';
    try {
      deviceNames = (await simctl
        .getDevices(platformVersion, platform))
        .map(({deviceName}) => deviceName);
    } catch {}
    throw new Error(
      `'deviceName' must be provided in order to create a new Simulator for ${platform} platform. ` +
        `Currently available device names: ${deviceNames}`,
    );
  }

  if (!platformVersion) {
    throw new Error(`'platformVersion' is required.`);
  }

  const simName = `${APPIUM_SIM_PREFIX}-${util.uuidV4().toUpperCase()}-${deviceName}`;
  this.log.debug(`Creating a temporary Simulator device '${simName}'`);
  const udid = await simctl.createDevice(simName, deviceName, platformVersion, {platform});
  return await getSimulator(udid, {
    platform,
    checkExistence: false,
    devicesSetPath,
    // @ts-ignore This is ok
    logger: this.log,
  });
}

/**
 * Get an existing simulator matching the provided capabilities.
 *
 * @returns The matched Simulator instance or `null` if no matching device is found.
 */
export async function getExistingSim(this: XCUITestDriver): Promise<Simulator | null> {
  const {
    platformVersion,
    deviceName,
    udid,
    simulatorDevicesSetPath: devicesSetPath,
    platformName,
  } = this.opts;

  const platform = normalizePlatformName(platformName);
  const selectSim = async (dev: { udid: string; platform: string; }): Promise<Simulator> =>
    await getSimulator(dev.udid, {
      platform,
      checkExistence: false,
      devicesSetPath,
      // @ts-ignore This is ok
      logger: this.log,
    });

  const simctl = new Simctl({devicesSetPath});
  let devicesMap: Record<string, any[]> | undefined;
  if (udid && _.toLower(udid) !== UDID_AUTO) {
    this.log.debug(`Looking for an existing Simulator with UDID '${udid}'`);
    devicesMap = await simctl.getDevices(null, platform);
    for (const device of _.flatMap(_.values(devicesMap))) {
      if (device.udid === udid) {
        return await selectSim(device);
      }
    }
    return null;
  }

  if (!platformVersion) {
    this.log.debug(
      `Provide 'platformVersion' capability if you prefer an existing Simulator to be selected`,
    );
    return null;
  }

  const devices =
    devicesMap?.[platformVersion] ?? (await simctl.getDevices(platformVersion, platform));
  this.log.debug(
    `Looking for an existing Simulator with platformName: ${platform}, ` +
      `platformVersion: ${platformVersion}, deviceName: ${deviceName}`,
  );
  for (const device of devices) {
    if ((deviceName && device.name === deviceName) || !deviceName) {
      if (!deviceName) {
        this.log.debug(
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

/**
 * Shutdown simulator
 */
export async function shutdownSimulator(this: XCUITestDriver): Promise<void> {
  const device = this.device as Simulator;
  // stop XCTest processes if running to avoid unexpected side effects
  await resetTestProcesses(device.udid, true);
  await device.shutdown();
}

/**
 * Run simulator reset
 * @param enforceSimulatorShutdown Whether to enforce simulator shutdown
 */
export async function runSimulatorReset(
  this: XCUITestDriver,
  enforceSimulatorShutdown: boolean = false
): Promise<void> {
  const {
    noReset,
    fullReset,
    keychainsExcludePatterns,
    keepKeyChains,
    bundleId,
    app,
    browserName,
  } = this.opts;
  if (noReset && !fullReset) {
    // noReset === true && fullReset === false
    this.log.debug('Reset: noReset is on. Leaving simulator as is');
    return;
  }
  const device = this.device as Simulator;

  if (!this.device) {
    this.log.debug('Reset: no device available. Skipping');
    return;
  }

  if (fullReset) {
    this.log.debug('Reset: fullReset is on. Cleaning simulator');
    await shutdownSimulator.bind(this)();
    const isKeychainsBackupSuccessful = (keychainsExcludePatterns || keepKeyChains) && (await device.backupKeychains());
    await device.clean();
    if (isKeychainsBackupSuccessful) {
      await device.restoreKeychains(keychainsExcludePatterns?.split(',')?.map(_.trim) || []);
      this.log.info(`Successfully restored keychains after full reset`);
    } else if (keychainsExcludePatterns || keepKeyChains) {
      this.log.warn(
        'Cannot restore keychains after full reset, because ' +
          'the backup operation did not succeed',
      );
    }
  } else if (bundleId) {
    // fastReset or noReset

    // Terminate the app under test if it is still running on Simulator
    try {
      await device.terminateApp(bundleId);
    } catch {
      this.log.warn(`Reset: failed to terminate Simulator application with id "${bundleId}"`);
    }

    if (app) {
      this.log.info('Not scrubbing third party app in anticipation of uninstall');
    } else {
      const isSafari = _.toLower(browserName) === 'safari';
      try {
        if (isSafari) {
          await device.scrubSafari(true);
        } else {
          await device.scrubApp(bundleId);
        }
      } catch (err) {
        this.log.debug((err as Error).stack);
        this.log.warn((err as Error).message);
        this.log.warn(
          `Reset: could not scrub ${
            isSafari ? 'Safari browser' : 'application with id "' + this.opts.bundleId + '"'
          }. ` + `Leaving as is.`,
        );
      }
    }

    if (enforceSimulatorShutdown && (await device.isRunning())) {
      await shutdownSimulator.bind(this)();
    }
  }
}

/**
 * Install app to simulator
 * @param app The app to the path
 * @param bundleId The bundle id to ensure it is already installed and uninstall it
 * @param opts Install options
 */
export async function installToSimulator(
  this: XCUITestDriver,
  app: string,
  bundleId?: string,
  opts: SimulatorInstallOptions = {},
): Promise<void> {
  if (!app) {
    this.log.debug('No app path is given. Nothing to install.');
    return;
  }

  const {skipUninstall, newSimulator = false} = opts;
  const device = this.device as Simulator;

  if (!skipUninstall && !newSimulator && bundleId && (await device.isAppInstalled(bundleId))) {
    this.log.debug(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.removeApp(bundleId);
  }

  this.log.debug(`Installing '${app}' on Simulator with UUID '${device.udid}'...`);
  const timer = new timing.Timer().start();
  await device.installApp(app);
  this.log.info(`The app has been successfully installed in ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
}

/**
 * Shutdown other simulators
 */
export async function shutdownOtherSimulators(this: XCUITestDriver): Promise<void> {
  const device = this.device as Simulator;
  const simctl = new Simctl({
    devicesSetPath: device.devicesSetPath,
  });
  const allDevices = _.flatMap(_.values(await simctl.getDevices()));
  const otherBootedDevices = allDevices
    .filter(({udid, state}) => udid !== device.udid && state === 'Booted');
  if (_.isEmpty(otherBootedDevices)) {
    this.log.info('No other running simulators have been detected');
    return;
  }
  this.log.info(
    `Detected ${util.pluralize(
      'other running Simulator',
      otherBootedDevices.length,
      true
    )}. Shutting them down...`,
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
 * @returns true if any preferences have been updated
 */
export async function setSafariPrefs(this: XCUITestDriver): Promise<boolean> {
  const prefs = buildSafariPreferences(this.opts);
  if (_.isEmpty(prefs)) {
    return false;
  }

  this.log.debug(`About to update Safari preferences: ${JSON.stringify(prefs)}`);
  await (this.device as Simulator).updateSafariSettings(prefs);
  return true;
}

/**
 * Changes Simulator localization preferences
 *
 * @returns True if preferences were changed
 */
export async function setLocalizationPrefs(this: XCUITestDriver): Promise<boolean> {
  const {language, locale, calendarFormat, skipSyncUiDialogTranslation} = this.opts;
  const l10nConfig: LocalizationOptions = {};
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

  this.log.debug(`About to update localization preferences: ${JSON.stringify(l10nConfig)}`);
  await (this.device as Simulator).configureLocalization(l10nConfig);
  return true;
}

//#region Type Definitions

export interface SimulatorLookupOptions {
  /** The name of the device to lookup */
  deviceName?: string;
  /** The platform version string */
  platformVersion: string;
  /** The full path to the simulator devices set */
  simulatorDevicesSetPath?: string;
  /** Simulator udid */
  udid?: string;
  /** The name of the current platform */
  platformName?: string;
}

export interface SimulatorInstallOptions {
  /** Whether to skip app uninstall before installing it */
  skipUninstall?: boolean;
  /** Whether the simulator is brand new */
  newSimulator?: boolean;
}

//#endregion
