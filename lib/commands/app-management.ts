import path from 'node:path';

import type {Simulator} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';
import {fs, util} from 'appium/support.js';

import {InstallationProxyClient} from '../device/installation-proxy-client.js';
import {installToRealDevice, type RealDevice} from '../device/real-device-management.js';
import {installToSimulator} from '../device/simulator-management.js';
import type {AutInstallationState, AutInstallationStateOptions, XCUITestDriver} from '../driver.js';
import type {AppInfoMapping} from '../types.js';
import {onDownloadApp, onPostConfigureApp} from './app-install.js';
import {SUPPORTED_EXTENSIONS} from './constants.js';
import type {AppState} from './enum.js';
import {requireRealDevice} from './helpers/index.js';

/**
 * Determines whether the app under test should be (re)installed, and whether an existing
 * installation should be uninstalled first.
 */
export async function checkAutInstallationState(
  driver: XCUITestDriver,
  opts?: AutInstallationStateOptions,
): Promise<AutInstallationState> {
  const {enforceAppInstall, fullReset, noReset, bundleId, app} = opts ?? driver.opts;

  const wasAppInstalled = !!bundleId && (await driver.device.isAppInstalled(bundleId));
  if (wasAppInstalled) {
    driver.log.info(`App '${bundleId}' is already installed`);
    if (noReset) {
      driver.log.info('noReset is requested. The app will not be be (re)installed');
      return {
        install: false,
        skipUninstall: true,
      };
    }
  } else {
    driver.log.info(
      `App '${bundleId}' is not installed yet or it has an offload and ` +
        'cannot be detected, which might keep the local data.',
    );
  }
  if (enforceAppInstall !== false || fullReset || !wasAppInstalled) {
    return {
      install: true,
      skipUninstall: !wasAppInstalled,
    };
  }

  const candidateBundleVersion = app ? await driver.appInfosCache.extractBundleVersion(app) : undefined;
  driver.log.debug(`CFBundleVersion from Info.plist: ${candidateBundleVersion}`);
  if (!candidateBundleVersion) {
    return {
      install: true,
      skipUninstall: false,
    };
  }

  const appBundleVersion = (
    driver.isRealDevice()
      ? await (driver.device as RealDevice).fetchAppInfo(bundleId)
      : await (driver.device as Simulator).simctl.appInfo(bundleId)
  )?.CFBundleVersion;
  driver.log.debug(`CFBundleVersion from installed app info: ${appBundleVersion}`);
  if (!appBundleVersion) {
    return {
      install: true,
      skipUninstall: false,
    };
  }

  let shouldUpgrade: boolean;
  try {
    shouldUpgrade = util.compareVersions(candidateBundleVersion, '>', appBundleVersion);
  } catch (err) {
    driver.log.warn(`App versions comparison is not possible: ${(err as Error).message}`);
    return {
      install: true,
      skipUninstall: false,
    };
  }
  if (shouldUpgrade) {
    driver.log.info(
      `The installed version of ${bundleId} is lower than the candidate one ` +
        `(${candidateBundleVersion} > ${appBundleVersion}). The app will be upgraded.`,
    );
  } else {
    driver.log.info(
      `The candidate version of ${bundleId} is lower than the installed one ` +
        `(${candidateBundleVersion} <= ${appBundleVersion}). The app won't be reinstalled.`,
    );
  }
  return {
    install: shouldUpgrade,
    skipUninstall: true,
  };
}

/**
 * Installs each app listed in the `otherApps` capability onto the device.
 */
export async function installOtherApps(this: XCUITestDriver, otherApps: string | string[]): Promise<void> {
  let appsList: string[] | undefined;
  try {
    appsList = this.helpers.parseCapsArray(otherApps);
  } catch (e) {
    throw this.log.errorWithException(`Could not parse "otherApps" capability: ${(e as Error).message}`);
  }
  if (!appsList?.length) {
    this.log.info(`Got zero apps from 'otherApps' capability value. Doing nothing`);
    return;
  }

  const appPaths: string[] = await Promise.all(
    appsList.map((app) =>
      this.helpers.configureApp(app, {
        onPostProcess: onPostConfigureApp.bind(this),
        onDownload: onDownloadApp.bind(this),
        supportedExtensions: SUPPORTED_EXTENSIONS,
      } as any),
    ),
  );
  const appIds: string[] = await Promise.all(appPaths.map((appPath) => this.appInfosCache.extractBundleId(appPath)));
  for (const [appId, appPath] of appIds.map((v, i) => [v, appPaths[i]] as const)) {
    if (this.isRealDevice()) {
      await installToRealDevice.bind(this)(appPath, appId, {
        skipUninstall: true, // to make the behavior as same as UIA2
        timeout: this.opts.appPushTimeout,
      });
    } else {
      await installToSimulator.bind(this)(appPath, appId, {
        newSimulator: this.lifecycleData.createSim,
      });
    }
  }
}

/**
 * Installs the given application to the device under test.
 *
 * Please ensure the app is built for a correct architecture and is signed with a proper developer signature (for real devices) prior to calling this.
 * @param app - See docs for `appium:app` capability
 * @param timeoutMs - The maximum time to wait until app install is finished (in ms) on real devices.
 * If not provided, then the value of `appium:appPushTimeout` capability is used. If the capability is not provided then the default is 240000ms (4 minutes).
 * @param checkVersion - If the application installation follows currently installed application's version status if provided.
 * No checking occurs if no this option.
 * @privateRemarks Link to capability docs
 */
export async function mobileInstallApp(
  this: XCUITestDriver,
  app: string,
  timeoutMs?: number,
  checkVersion?: boolean,
): Promise<void> {
  const srcAppPath = await this.helpers.configureApp(app, {
    onPostProcess: onPostConfigureApp.bind(this),
    onDownload: onDownloadApp.bind(this),
    supportedExtensions: SUPPORTED_EXTENSIONS,
  } as any);
  this.log.info(
    `Installing '${srcAppPath}' to the ${this.isRealDevice() ? 'real device' : 'Simulator'} ` +
      `with UDID '${this.device.udid}'`,
  );
  if (!(await fs.exists(srcAppPath))) {
    throw this.log.errorWithException(`The application at '${srcAppPath}' does not exist or is not accessible`);
  }

  const bundleId = await this.appInfosCache.extractBundleId(srcAppPath);
  if (checkVersion) {
    const {install} = await checkAutInstallationState(this, {
      enforceAppInstall: false,
      fullReset: false,
      noReset: false,
      bundleId,
      app: srcAppPath,
    });

    if (!install) {
      this.log.info(`Skipping the installation of '${bundleId}'`);
      return;
    }
  }

  await this.device.installApp(srcAppPath, bundleId, {
    timeoutMs: timeoutMs ?? this.opts.appPushTimeout,
  });
  this.log.info(`Installation of '${srcAppPath}' succeeded`);
}

/**
 * Checks whether the given application is installed on the device under test.
 * Offload app is handled as not installed.
 *
 * @param bundleId - The bundle identifier of the application to be checked
 * @returns `true` if the application is installed; `false` otherwise
 */
export async function mobileIsAppInstalled(this: XCUITestDriver, bundleId: string): Promise<boolean> {
  const installed = await this.device.isAppInstalled(bundleId);
  this.log.info(`App '${bundleId}' is${installed ? '' : ' not'} installed`);
  return installed;
}

/**
 * Removes/uninstalls the given application from the device under test.
 * Offload app data could also be removed.
 *
 * @param bundleId - The bundle identifier of the application to be removed
 * @returns `true` if the application has been removed successfully; `false` otherwise
 */
export async function mobileRemoveApp(this: XCUITestDriver, bundleId: string): Promise<boolean> {
  this.log.info(
    `Uninstalling the application with bundle identifier '${bundleId}' ` +
      `from the ${this.isRealDevice() ? 'real device' : 'Simulator'} with UDID '${this.device.udid}'`,
  );
  try {
    await this.device.removeApp(bundleId);
    this.log.info(`Removal of '${bundleId}' succeeded`);
    return true;
  } catch (err: any) {
    this.log.warn(`Cannot remove '${bundleId}'. Original error: ${err.message}`);
    return false;
  }
}

/**
 * Executes the given app on the device under test.
 *
 * If the app is already running it will be activated. If the app is not installed or cannot be launched then an exception is thrown.
 * @param bundleId - The bundle identifier of the application to be launched
 * @param args - One or more command line arguments for the app. If the app is already running then this argument is ignored.
 * @param environment - Environment variables mapping for the app. If the app is already running then this argument is ignored.
 */
export async function mobileLaunchApp(
  this: XCUITestDriver,
  bundleId: string,
  args?: string | string[],
  environment?: Record<string, any>,
): Promise<void> {
  const launchOptions: {
    bundleId: string;
    arguments?: any[];
    environment?: any;
  } = {bundleId};
  if (args) {
    launchOptions.arguments = Array.isArray(args) ? args : [args];
  }
  if (environment) {
    launchOptions.environment = environment;
  }
  await this.proxyCommand('/wda/apps/launch', 'POST', launchOptions);
}

/**
 * Terminates the given app on the device under test.
 *
 * This command performs termination via [XCTest's `terminate`](https://developer.apple.com/documentation/xctest/xcuiapplication/1500637-terminate) API. If the app is not installed an exception is thrown. If the app is not running then nothing is done.
 * @param bundleId - The bundle identifier of the application to be terminated
 * @returns `true` if the app has been terminated successfully; `false` otherwise
 */
export async function mobileTerminateApp(this: XCUITestDriver, bundleId: string): Promise<boolean> {
  return (await this.proxyCommand('/wda/apps/terminate', 'POST', {bundleId})) as boolean;
}

/**
 * Activate the given app on the device under test.
 *
 * This pushes the app to the foreground if it is running in the background.  An exception is thrown if the app is not install or isn't running.  Nothing is done if the app is already in the foreground.
 *
 * @param bundleId - The bundle identifier of the application to be activated
 */
export async function mobileActivateApp(this: XCUITestDriver, bundleId: string): Promise<void> {
  await this.proxyCommand('/wda/apps/activate', 'POST', {bundleId});
}

/**
 * Kill the given app on the real device under test by instruments service.
 *
 * If the app is not running or kill failed, then nothing is done.
 *
 * @param bundleId - The bundle identifier of the application to be killed
 * @returns `true` if the app has been killed successfully; `false` otherwise
 * @group Real Device Only
 */
export async function mobileKillApp(this: XCUITestDriver, bundleId: string): Promise<boolean> {
  return await requireRealDevice(this, 'Killing app').terminateApp(bundleId);
}

/**
 * Queries the state of an installed application from the device under test.
 *
 * If the app with the given `bundleId` is not installed, an exception will be thrown.
 *
 * @param bundleId - The bundle identifier of the application to be queried
 * @returns The actual application state code
 * @see https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc
 */
export async function mobileQueryAppState(this: XCUITestDriver, bundleId: string): Promise<AppState> {
  return (await this.proxyCommand('/wda/apps/state', 'POST', {bundleId})) as AppState;
}

/**
 * Installs the given application to the device under test.
 *
 * This is a wrapper around {@linkcode mobileInstallApp mobile: installApp}.
 *
 * @param appPath - Path to the application bundle or .ipa/.app file
 * @param opts - Installation options
 * @param opts.timeoutMs - Maximum time to wait for installation to complete (in milliseconds)
 * @param opts.strategy - If `true`, checks the version before installing and skips if already installed
 */
export async function installApp(
  this: XCUITestDriver,
  appPath: string,
  opts: {timeoutMs?: number; strategy?: boolean} = {},
): Promise<void> {
  await this.mobileInstallApp(appPath, opts.timeoutMs, opts.strategy);
}

/**
 * Activates the given app on the device under test.
 *
 * This is a wrapper around {@linkcode mobileLaunchApp mobile: launchApp}. If the app is already
 * running, it will be activated (brought to foreground). If the app is not installed or cannot
 * be launched, an exception is thrown.
 *
 * @param bundleId - The bundle identifier of the application to be activated
 * @param opts - Launch options
 * @param opts.environment - Environment variables mapping for the app
 * @param opts.arguments - Command line arguments for the app
 */
export async function activateApp(
  this: XCUITestDriver,
  bundleId: string,
  opts: {environment?: Record<string, any>; arguments?: string[]} = {},
): Promise<void> {
  const {environment, arguments: args} = opts;
  return await this.mobileLaunchApp(bundleId, args, environment);
}

/**
 * Checks whether the given application is installed on the device under test.
 *
 * This is a wrapper around {@linkcode mobileIsAppInstalled mobile: isAppInstalled}.
 * Offload apps are treated as not installed.
 *
 * @param bundleId - The bundle identifier of the application to be checked
 * @returns `true` if the application is installed; `false` otherwise
 */
export async function isAppInstalled(this: XCUITestDriver, bundleId: string): Promise<boolean> {
  return await this.mobileIsAppInstalled(bundleId);
}

/**
 * Terminates the given app on the device under test.
 *
 * This is a wrapper around {@linkcode mobileTerminateApp mobile: terminateApp}.
 * The command performs termination via XCTest's `terminate` API. If the app is not installed,
 * an exception is thrown. If the app is not running, nothing is done.
 *
 * @param bundleId - The bundle identifier of the application to be terminated
 * @returns `true` if the app has been terminated successfully; `false` otherwise
 */
export async function terminateApp(this: XCUITestDriver, bundleId: string): Promise<boolean> {
  return await this.mobileTerminateApp(bundleId);
}

/**
 * Queries the state of an installed application from the device under test.
 *
 * This is a wrapper around {@linkcode mobileQueryAppState mobile: queryAppState}.
 * If the app with the given `bundleId` is not installed, an exception will be thrown.
 *
 * @param bundleId - The bundle identifier of the application to be queried
 * @returns The actual application state code
 * @see https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc
 */
export async function queryAppState(this: XCUITestDriver, bundleId: string): Promise<AppState> {
  return await this.mobileQueryAppState(bundleId);
}

/**
 * List applications installed on the real device under test
 *
 * Read [Pushing/Pulling files](https://appium.io/docs/en/writing-running-appium/ios/ios-xctest-file-movement/) for more details.
 * @param applicationType - The type of applications to list (default: 'User').
 * @param returnAttributes - Array of attribute names to return for each app (e.g., ["CFBundleIdentifier", "CFBundleName"]).
 *   If not provided, all available attributes are returned.
 * @returns An object mapping bundle identifiers to app properties (e.g., CFBundleName, CFBundleVersion, etc.).
 * @remarks Having `UIFileSharingEnabled` set to `true` in the app properties means the app supports file upload/download in its `documents` container.
 * @group Real Device Only
 */
export async function mobileListApps(
  this: XCUITestDriver,
  applicationType: 'User' | 'System' = 'User',
  returnAttributes?: string[],
): Promise<AppInfoMapping> {
  const device = requireRealDevice(this, 'Listing apps');
  const client = await InstallationProxyClient.create(device.udid, {
    facade: this.remoteXPCFacade,
    logger: this.log,
  });
  try {
    return await client.listApplications({applicationType, returnAttributes});
  } finally {
    await client.close();
  }
}

/**
 * Deletes application data files, so it could start from the clean state next time
 * it is launched.
 * This API only works on a Simulator.
 *
 * @param bundleId Application bundle identifier
 * @returns true if any files from the app's data container have been deleted
 */
export async function mobileClearApp(this: XCUITestDriver, bundleId: string): Promise<boolean> {
  if (this.isRealDevice()) {
    throw new errors.NotImplementedError(
      `This extension is only supported on simulators. ` +
        `The only known way to clear app data on real devices ` +
        `would be to uninstall the app then perform a fresh install of it.`,
    );
  }

  const simctl = (this.device as Simulator).simctl;
  const dataRoot = await simctl.getAppContainer(bundleId, 'data');
  this.log.debug(`Got the data container root of ${bundleId} at '${dataRoot}'`);
  if (!(await fs.exists(dataRoot))) {
    return false;
  }

  await this.mobileTerminateApp(bundleId);
  const items = await fs.readdir(dataRoot);
  if (!items.length) {
    return false;
  }

  await Promise.all(items.map((item) => fs.rimraf(path.join(dataRoot, item))));
  this.log.info(`Cleaned up ${util.pluralize('item', items.length, true)} from ${bundleId}'s data container`);
  return true;
}

/**
 * Closes the app (simulates device home button press).
 *
 * It is possible to restore the app after a timeout or keep it minimized based on the parameter value.
 *
 * @param seconds - Timeout configuration. Accepts:
 *   - A positive number (seconds): app will be restored after the specified number of seconds
 *   - A negative number or zero: app will not be restored (kept minimized)
 *   - `undefined` or `null`: app will not be restored (kept minimized)
 *   - An object with `timeout` property:
 *     - `{timeout: 5000}`: app will be restored after 5 seconds (timeout in milliseconds)
 *     - `{timeout: null}` or `{timeout: -2}`: app will not be restored
 */
export async function background(this: XCUITestDriver, seconds?: number | {timeout?: number | null}): Promise<void> {
  const homescreen = '/wda/homescreen';
  const deactivateApp = '/wda/deactivateApp';

  let endpoint: string | undefined;
  let params: Record<string, any> = {};
  const selectEndpoint = (timeoutSeconds?: number | null) => {
    if (!util.hasValue(timeoutSeconds)) {
      endpoint = homescreen;
    } else if (!isNaN(Number(timeoutSeconds))) {
      const duration = parseFloat(String(timeoutSeconds));
      if (duration >= 0) {
        params = {duration};
        endpoint = deactivateApp;
      } else {
        endpoint = homescreen;
      }
    }
  };
  if (seconds && typeof seconds !== 'number' && Object.hasOwn(seconds, 'timeout')) {
    const timeout = seconds.timeout;
    selectEndpoint(isNaN(Number(timeout)) ? timeout : parseFloat(String(timeout)) / 1000.0);
  } else {
    selectEndpoint(typeof seconds === 'number' ? seconds : undefined);
  }
  if (!endpoint) {
    throw new errors.InvalidArgumentError(
      `Argument value is expected to be a valid number. ` + `${JSON.stringify(seconds)} has been provided instead`,
    );
  }
  return await this.proxyCommand(endpoint, 'POST', params, endpoint !== homescreen);
}
