import _ from 'lodash';
import {fs, util} from 'appium/support';
import {errors} from 'appium/driver';
import {services} from 'appium-ios-device';
import path from 'node:path';
import B from 'bluebird';
import {
  SUPPORTED_EXTENSIONS,
  onPostConfigureApp,
  onDownloadApp,
} from '../app-utils';
import type {XCUITestDriver} from '../driver';
import type {AppState} from './enum';
import type {Simulator} from 'appium-ios-simulator';
import type {RealDevice} from '../device/real-device-management';

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
  });
  this.log.info(
    `Installing '${srcAppPath}' to the ${this.isRealDevice() ? 'real device' : 'Simulator'} ` +
      `with UDID '${this.device.udid}'`,
  );
  if (!(await fs.exists(srcAppPath))) {
    throw this.log.errorWithException(
      `The application at '${srcAppPath}' does not exist or is not accessible`,
    );
  }

  const bundleId = await this.appInfosCache.extractBundleId(srcAppPath);
  if (checkVersion) {
    const {install} = await this.checkAutInstallationState({
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

  await this.device.installApp(
    srcAppPath,
    bundleId,
    {
      timeoutMs: timeoutMs ?? this.opts.appPushTimeout,
    },
  );
  this.log.info(`Installation of '${srcAppPath}' succeeded`);
}

/**
 * Checks whether the given application is installed on the device under test.
 * Offload app is handled as not installed.
 *
 * @param bundleId - The bundle identifier of the application to be checked
 * @returns `true` if the application is installed; `false` otherwise
 */
export async function mobileIsAppInstalled(
  this: XCUITestDriver,
  bundleId: string,
): Promise<boolean> {
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
export async function mobileRemoveApp(
  this: XCUITestDriver,
  bundleId: string,
): Promise<boolean> {
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
export async function mobileTerminateApp(
  this: XCUITestDriver,
  bundleId: string,
): Promise<boolean> {
  return (await this.proxyCommand('/wda/apps/terminate', 'POST', {bundleId})) as boolean;
}

/**
 * Activate the given app on the device under test.
 *
 * This pushes the app to the foreground if it is running in the background.  An exception is thrown if the app is not install or isn't running.  Nothing is done if the app is already in the foreground.
 *
 * @param bundleId - The bundle identifier of the application to be activated
 */
export async function mobileActivateApp(
  this: XCUITestDriver,
  bundleId: string,
): Promise<void> {
  await this.proxyCommand('/wda/apps/activate', 'POST', {bundleId});
}

/**
 * Kill the given app on the real device under test by instruments service.
 *
 * If the app is not running or kill failed, then nothing is done.
 *
 * @remarks `appium-xcuitest-driver` v4.4 does not require `py-ios-device` to be installed.
 * @privateRemarks See implementation at https://github.com/YueChen-C/py-ios-device/blob/51f4683c5c3c385a015858ada07a5f1c62d3cf57/ios_device/cli/base.py#L220
 * @see https://github.com/YueChen-C/py-ios-device
 * @param bundleId - The bundle identifier of the application to be killed
 * @returns `true` if the app has been killed successfully; `false` otherwise
 * @group Real Device Only
 */
export async function mobileKillApp(
  this: XCUITestDriver,
  bundleId: string,
): Promise<boolean> {
  if (!this.isRealDevice()) {
    throw new errors.UnsupportedOperationError('A real device is required');
  }

  return await (this.device as RealDevice).terminateApp(bundleId, String(this.opts.platformVersion));
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
export async function mobileQueryAppState(
  this: XCUITestDriver,
  bundleId: string,
): Promise<AppState> {
  return (await this.proxyCommand('/wda/apps/state', 'POST', {bundleId})) as AppState;
}

/**
 * @param appPath
 * @param opts
 */
export async function installApp(
  this: XCUITestDriver,
  appPath: string,
  opts: {timeoutMs?: number; strategy?: boolean} = {},
): Promise<void> {
  // @ts-ignore Probably a TS bug
  await this.mobileInstallApp(appPath, opts.timeoutMs, opts.strategy);
}

/**
 * @param bundleId
 * @param opts
 */
export async function activateApp(
  this: XCUITestDriver,
  bundleId: string,
  opts: {environment?: Record<string, any>; arguments?: string[]} = {},
): Promise<void> {
  const {environment, arguments: args} = opts;
  // @ts-ignore Probably a TS bug
  return await this.mobileLaunchApp(bundleId, args, environment);
}

/**
 * @param bundleId
 */
export async function isAppInstalled(
  this: XCUITestDriver,
  bundleId: string,
): Promise<boolean> {
  return await this.mobileIsAppInstalled(bundleId);
}

/**
 * @param bundleId
 * @returns
 */
export async function terminateApp(
  this: XCUITestDriver,
  bundleId: string,
): Promise<boolean> {
  return await this.mobileTerminateApp(bundleId);
}

/**
 * @param bundleId
 */
export async function queryAppState(
  this: XCUITestDriver,
  bundleId: string,
): Promise<AppState> {
  return await this.mobileQueryAppState(bundleId);
}

/**
 * List applications installed on the real device under test
 *
 * Read [Pushing/Pulling files](https://appium.io/docs/en/writing-running-appium/ios/ios-xctest-file-movement/) for more details.
 * @param applicationType - The type of applications to list.
 * @returns A list of apps where each item is a mapping of bundle identifiers to maps of platform-specific app properties.
 * @remarks Having `UIFileSharingEnabled` set to `true` in the return app properties map means this app supports file upload/download in its `documents` container.
 * @group Real Device Only
 */
export async function mobileListApps(
  this: XCUITestDriver,
  applicationType: 'User' | 'System' = 'User',
): Promise<Record<string, any>[]> {
  if (!this.isRealDevice()) {
    throw new errors.NotImplementedError(`This extension is only supported on real devices`);
  }

  const service = await services.startInstallationProxyService(this.device.udid);
  try {
    return await service.listApplications({applicationType});
  } finally {
    service.close();
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
export async function mobileClearApp(
  this: XCUITestDriver,
  bundleId: string,
): Promise<boolean> {
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

  await B.all(items.map((item) => fs.rimraf(path.join(dataRoot, item))));
  this.log.info(
    `Cleaned up ${util.pluralize('item', items.length, true)} from ${bundleId}'s data container`,
  );
  return true;
}

/**
 * Close app (simulate device home button). It is possible to restore
 * the app after the timeout or keep it minimized based on the parameter value.
 *
 * @param seconds
 * - any positive number of seconds: come back after X seconds
 * - any negative number of seconds or zero: never come back
 * - undefined/null: never come back
 * - {timeout: 5000}: come back after 5 seconds
 * - {timeout: null}, {timeout: -2}: never come back
 */
export async function background(
  this: XCUITestDriver,
  seconds?: number | {timeout?: number | null},
): Promise<void> {
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
  if (seconds && !_.isNumber(seconds) && _.has(seconds, 'timeout')) {
    const timeout = seconds.timeout;
    selectEndpoint(isNaN(Number(timeout)) ? timeout : parseFloat(String(timeout)) / 1000.0);
  } else {
    selectEndpoint(_.isNumber(seconds) ? seconds : undefined);
  }
  if (!endpoint) {
    throw new errors.InvalidArgumentError(
      `Argument value is expected to be a valid number. ` +
        `${JSON.stringify(seconds)} has been provided instead`,
    );
  }
  return await this.proxyCommand(endpoint, 'POST', params, endpoint !== homescreen);
}

