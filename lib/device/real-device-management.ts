import path from 'node:path';

import type {AppiumLogger} from '@appium/types';
import {fs, tempDir, zip, util, timing} from 'appium/support.js';
import {asyncmap} from 'asyncbox';
import {Devicectl} from 'node-devicectl';

import {IPA_EXT} from '../commands/constants.js';
import {buildSafariPreferences, SAFARI_BUNDLE_ID, TimeoutError, withTimeout} from '../commands/helpers/index.js';
import type {XCUITestDriver, XCUITestDriverOpts} from '../driver.js';
import {log as defaultLogger} from '../logger.js';
import {isEmpty, isPlainObject} from '../utils/index.js';
import {AfcClient} from './afc-client.js';
import {AppTerminationClient} from './app-termination-client.js';
import {ConnectedDevicesClient} from './connected-devices-client.js';
import {InstallationProxyClient} from './installation-proxy-client.js';
import {LockdownClient} from './lockdown-client.js';
import {NotificationClient} from './notification-client.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';
import {ZipConduitClient} from './zip-conduit-client.js';

const DEFAULT_APP_INSTALLATION_TIMEOUT_MS = 8 * 60 * 1000;
export const IO_TIMEOUT_MS = 4 * 60 * 1000;
// Mobile devices use NAND memory modules for the storage,
// and the parallelism there is not as performant as on regular SSDs
export const MAX_IO_CHUNK_SIZE = 8;
const APPLICATION_INSTALLED_NOTIFICATION = 'com.apple.mobile.application_installed';
const APPLICATION_NOTIFICATION_TIMEOUT_MS = 30 * 1000;
const INSTALLATION_STAGING_DIR = 'PublicStaging';

export interface AfcTransferOptions {
  log?: AppiumLogger;
}

export interface PushFileOptions extends AfcTransferOptions {
  /** The maximum count of milliseconds to wait until file push is completed. Cannot be lower than 60000ms */
  timeoutMs?: number;
}

export interface PushFolderOptions extends AfcTransferOptions {
  /** The maximum timeout to wait until a single file is copied */
  timeoutMs?: number;
  /** Whether to push files in parallel. This usually gives better performance, but might sometimes be less stable. */
  enableParallelPush?: boolean;
}

export interface PullFileOptions extends AfcTransferOptions {}

export interface PullFolderOptions extends AfcTransferOptions {}

export interface RealDeviceInstallOptions {
  /** Application installation timeout in milliseconds */
  timeoutMs?: number;
}

export interface InstallOrUpgradeOptions {
  /** Install/upgrade timeout in milliseconds */
  timeout: number;
  /** Whether it is an app upgrade or a new install */
  isUpgrade: boolean;
}

export interface ManagementInstallOptions {
  /** Whether to skip app uninstall before installing it */
  skipUninstall?: boolean;
  /** App install timeout */
  timeout?: number;
  /** Whether to enforce the app uninstallation. e.g. fullReset, or enforceAppInstall is true */
  shouldEnforceUninstall?: boolean;
}

interface AfcTransferStats {
  fileCount?: number;
  folderCount?: number;
}

export class RealDevice {
  readonly udid: string;
  readonly devicectl: Devicectl;
  readonly driverOpts: XCUITestDriverOpts;
  private readonly _log: AppiumLogger;
  private remoteXPCFacade: RemoteXPCFacade | null = null;

  constructor(udid: string, driverOpts: XCUITestDriverOpts, logger?: AppiumLogger) {
    this.udid = udid;
    this.driverOpts = driverOpts;
    this._log = logger ?? defaultLogger;
    this.devicectl = new Devicectl(this.udid);
  }

  get log(): AppiumLogger {
    return this._log;
  }

  attachRemoteXPCFacade(facade: RemoteXPCFacade): void {
    this.remoteXPCFacade = facade;
  }

  async remove(bundleId: string): Promise<void> {
    const client = await InstallationProxyClient.create(this.udid, {
      facade: this.remoteXPCFacade,
      logger: this.log,
    });
    try {
      await client.uninstallApplication(bundleId);
    } finally {
      await client.close();
    }
  }

  async removeApp(bundleId: string): Promise<void> {
    await this.remove(bundleId);
  }

  async install(appPath: string, bundleId: string, opts: RealDeviceInstallOptions = {}): Promise<void> {
    const {timeoutMs = IO_TIMEOUT_MS} = opts;
    const timer = new timing.Timer().start();
    const useRemoteXPC = (await this.remoteXPCFacade?.determineAvailability()) ?? false;

    // first try with zip_conduit service for iOS/tvOS 18+ and IPA only
    // fall through to the AFC + installation_proxy path for other cases/zip_conduit failure
    if (useRemoteXPC && (await this.installViaZipConduit(appPath, timeoutMs))) {
      this.log.info(
        `The installation of '${bundleId}' succeeded after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
      );
      return;
    }

    const afcClient = await AfcClient.createForDevice(this.udid, {
      facade: this.remoteXPCFacade,
    });
    try {
      let bundlePathOnPhone: string;
      if ((await fs.stat(appPath)).isFile()) {
        // https://github.com/doronz88/pymobiledevice3/blob/6ff5001f5776e03b610363254e82d7fbcad4ef5f/pymobiledevice3/services/installation_proxy.py#L75
        bundlePathOnPhone = `/${path.basename(appPath)}`;
        await pushFile(afcClient, appPath, bundlePathOnPhone, {
          timeoutMs,
          log: this.log,
        });
      } else {
        bundlePathOnPhone = `${INSTALLATION_STAGING_DIR}/${bundleId}`;
        await pushFolder(afcClient, appPath, bundlePathOnPhone, {
          enableParallelPush: true,
          timeoutMs,
          log: this.log,
        });
      }
      await this.installOrUpgradeApplication(bundlePathOnPhone, {
        timeout: Math.max(timeoutMs - timer.getDuration().asMilliSeconds, 60000),
        isUpgrade: await this.isAppInstalled(bundleId),
      });
    } catch (err) {
      this.log.debug((err as Error).stack);
      let errMessage = `Cannot install the ${bundleId} application`;
      if (err instanceof TimeoutError) {
        errMessage += `. Consider increasing the value of 'appPushTimeout' capability (the current value equals to ${timeoutMs}ms)`;
      }
      errMessage += `. Original error: ${(err as Error).message}`;
      throw new Error(errMessage, {cause: err});
    } finally {
      await afcClient.close();
    }
    this.log.info(
      `The installation of '${bundleId}' succeeded after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
    );
  }

  async installOrUpgradeApplication(bundlePathOnPhone: string, opts: InstallOrUpgradeOptions): Promise<void> {
    const {isUpgrade, timeout} = opts;
    const notificationClient = await NotificationClient.create(this.udid, {
      facade: this.remoteXPCFacade,
      logger: this.log,
    });
    const installationClient = await InstallationProxyClient.create(this.udid, {
      facade: this.remoteXPCFacade,
      logger: this.log,
    });
    const appInstalledNotification = notificationClient.observeNotification(APPLICATION_INSTALLED_NOTIFICATION);
    const clientOptions = {PackageType: 'Developer'};
    try {
      if (isUpgrade) {
        this.log.debug(
          `An upgrade of the existing application is going to be performed. ` +
            `Will timeout in ${timeout.toFixed(0)} ms`,
        );
        await installationClient.upgradeApplication(bundlePathOnPhone, clientOptions, timeout);
      } else {
        this.log.debug(
          `A new application installation is going to be performed. ` + `Will timeout in ${timeout.toFixed(0)} ms`,
        );
        await installationClient.installApplication(bundlePathOnPhone, clientOptions, timeout);
      }
      try {
        await withTimeout(
          appInstalledNotification,
          APPLICATION_NOTIFICATION_TIMEOUT_MS,
          `Could not get the application installed notification within ` +
            `${APPLICATION_NOTIFICATION_TIMEOUT_MS}ms but we will continue`,
        );
      } catch (e) {
        this.log.warn((e as Error).message);
      }
    } finally {
      await installationClient.close();
      await notificationClient.close();
    }
  }

  /**
   * Alias for {@linkcode install}
   */
  async installApp(appPath: string, bundleId: string, opts: RealDeviceInstallOptions = {}): Promise<void> {
    return await this.install(appPath, bundleId, opts);
  }

  /**
   * Return an application object if test app has 'bundleid'.
   * The target bundleid can be User and System apps.
   *
   * @param bundleId The bundleId to ensure it is installed
   * @returns Returns True if the app is installed on the device under test.
   */
  async isAppInstalled(bundleId: string): Promise<boolean> {
    if (process.platform === 'darwin' && isPreferDevicectlEnabled()) {
      return (await this.devicectl.listApps(bundleId)).length > 0;
    }
    return Boolean(await this.fetchAppInfo(bundleId));
  }

  /**
   * Fetches various attributes, like bundle id, version, entitlements etc. of
   * an installed application.
   *
   * @param bundleId the bundle identifier of an app to check
   * @param returnAttributes If provided then
   * only fetches the requested attributes of the app into the resulting object.
   * Some apps may have too many attributes, so it makes sense to limit these
   * by default if you don't need all of them.
   * @returns Either app info as an object or undefined if the app is not found.
   */
  async fetchAppInfo(
    bundleId: string,
    returnAttributes: string | string[] = ['CFBundleIdentifier', 'CFBundleVersion'],
  ): Promise<Record<string, any> | undefined> {
    const client = await InstallationProxyClient.create(this.udid, {
      facade: this.remoteXPCFacade,
      logger: this.log,
    });
    try {
      return (
        await client.lookupApplications({
          bundleIds: bundleId,
          // https://github.com/appium/appium/issues/18753
          returnAttributes: Array.isArray(returnAttributes) ? returnAttributes : [returnAttributes],
        })
      )[bundleId];
    } finally {
      await client.close();
    }
  }

  /**
   * Terminates the application with the given bundle identifier on the real device.
   * Uses RemoteXPC DVT processControl when session access allows it; on connection/execution
   * error falls back to the legacy path (InstallationProxy + devicectl or instrument service).
   *
   * @param bundleId - Bundle identifier of the app to terminate
   * @returns `true` if the app was running and was terminated, `false` otherwise
   */
  async terminateApp(bundleId: string): Promise<boolean> {
    const platformVersion = this.driverOpts.platformVersion ?? (await this.getPlatformVersion());
    const terminationClient = new AppTerminationClient(
      this.udid,
      platformVersion,
      this.devicectl,
      this.log,
      this.remoteXPCFacade,
    );
    return await terminationClient.terminate(bundleId);
  }

  /**
   * Used to locate duplicate WebDriverAgent runner apps.
   *
   * @param bundleName The name of CFBundleName in Info.plist
   * @returns A list of User level apps' bundle ids which has
   * 'CFBundleName' attribute as 'bundleName'.
   */
  async getUserInstalledBundleIdsByBundleName(bundleName: string): Promise<string[]> {
    const client = await InstallationProxyClient.create(this.udid, {
      facade: this.remoteXPCFacade,
      logger: this.log,
    });
    try {
      const applications = await client.listApplications({
        applicationType: 'User',
        returnAttributes: ['CFBundleIdentifier', 'CFBundleName'],
      });
      return Object.entries(applications).reduce((acc: string[], [key, {CFBundleName}]) => {
        if (CFBundleName === bundleName) {
          acc.push(key);
        }
        return acc;
      }, []);
    } finally {
      await client.close();
    }
  }

  async getPlatformVersion(): Promise<string> {
    const lockdown = await LockdownClient.createForDevice(this.udid, {
      facade: this.remoteXPCFacade,
      logger: this.log,
    });
    try {
      return await lockdown.getOSVersion();
    } finally {
      await lockdown.close();
    }
  }

  async reset(opts: {bundleId?: string; fullReset?: boolean}): Promise<void> {
    const {bundleId, fullReset} = opts;
    if (!bundleId || !fullReset || bundleId === SAFARI_BUNDLE_ID) {
      // Safari cannot be removed as system app.
      // Safari process handling will be managed by WDA
      // with noReset, forceAppLaunch or shouldTerminateApp capabilities.
      return;
    }

    this.log.debug(`Reset: fullReset requested. Will try to uninstall the app '${bundleId}'.`);
    if (!(await this.isAppInstalled(bundleId))) {
      this.log.debug('Reset: app not installed. No need to uninstall');
      return;
    }

    try {
      await this.remove(bundleId);
    } catch (err) {
      this.log.error(`Reset: could not remove '${bundleId}' from device: ${(err as Error).message}`);
      throw err;
    }
    this.log.debug(`Reset: removed '${bundleId}'`);
  }

  /**
   * Attempt a streaming zip_conduit install of an `.ipa` over RemoteXPC.
   *
   * @param appPath - Local path to the app package
   * @param timeoutMs - Overall install timeout in milliseconds
   * @returns `true` when the app was installed via zip_conduit; `false` when the
   * package is not an eligible `.ipa`, the service is unavailable, or the
   * streamed install failed. A `false` result tells the caller to fall back to
   * the AFC upload + installation_proxy path.
   */
  private async installViaZipConduit(appPath: string, timeoutMs: number): Promise<boolean> {
    // zip_conduit only accepts .ipa archives. Unpacked .app bundles (and any
    // other non-.ipa package) must use the AFC + installation_proxy
    // path, so anything that is not a regular .ipa file is skipped here.
    if (!appPath.toLowerCase().endsWith(IPA_EXT) || !(await fs.stat(appPath)).isFile()) {
      return false;
    }

    let client: ZipConduitClient | null = null;
    try {
      client = await ZipConduitClient.create(this.udid, this.log, this.remoteXPCFacade);
      if (!client) {
        return false;
      }
      this.log.debug(`Installing '${path.basename(appPath)}' via streaming zip_conduit`);
      await client.install(appPath, {timeoutMs});
      return true;
    } catch (err) {
      this.log.warn(
        `Fast zip_conduit install of '${path.basename(appPath)}' failed; falling back to ` +
          `AFC upload + installation_proxy. Original error: ${(err as Error).message}`,
      );
      return false;
    } finally {
      await client?.close();
    }
  }
}

/**
 * Retrieve a file from a real device
 *
 * @param client AFC client instance
 * @param remotePath Relative path to the file on the device
 * @param opts Pull file options
 * @returns The file content as a buffer
 */
export async function pullFile(client: AfcClient, remotePath: string, opts: PullFileOptions = {}): Promise<Buffer> {
  const log = opts.log ?? defaultLogger;
  const timer = new timing.Timer().start();
  const buffer = await withTimeout(
    client.getFileContents(remotePath),
    IO_TIMEOUT_MS,
    `Timed out after ${IO_TIMEOUT_MS}ms while pulling file from '${remotePath}'`,
  );
  logAfcTransferPerformance(log, 'download', buffer.length, remotePath, timer);
  return buffer;
}

/**
 * Retrieve a folder from a real device
 *
 * @param client AFC client instance
 * @param remoteRootPath Relative path to the folder on the device
 * @param opts Pull folder options
 * @returns The folder content as a zipped base64-encoded buffer
 */
export async function pullFolder(
  client: AfcClient,
  remoteRootPath: string,
  opts: PullFolderOptions = {},
): Promise<Buffer> {
  const log = opts.log ?? defaultLogger;
  const timer = new timing.Timer().start();
  const tmpFolder = await tempDir.openDir();
  let totalBytes = 0;
  try {
    let localTopItem: string | null = null;
    let countFilesSuccess = 0;
    let countFolders = 0;

    await client.pull(remoteRootPath, tmpFolder, {
      recursive: true,
      overwrite: true,
      onEntry: async (_remotePath: string, localPath: string, isDirectory: boolean) => {
        if (!localTopItem || localPath.split(path.sep).length < localTopItem.split(path.sep).length) {
          localTopItem = localPath;
        }
        if (isDirectory) {
          ++countFolders;
        } else {
          ++countFilesSuccess;
          totalBytes += (await fs.stat(localPath)).size;
        }
      },
    });

    logAfcTransferPerformance(log, 'download', totalBytes, remoteRootPath, timer, {
      fileCount: countFilesSuccess,
      folderCount: countFolders,
    });
    return await zip.toInMemoryZip(localTopItem ? path.dirname(localTopItem) : tmpFolder, {
      encodeToBase64: true,
    });
  } finally {
    await fs.rimraf(tmpFolder);
  }
}

/**
 * Pushes a file to a real device
 *
 * @param client AFC client instance
 * @param localPathOrPayload Either full path to the source file
 * or a buffer payload to be written into the remote destination
 * @param remotePath Relative path to the file on the device. The remote
 * folder structure is created automatically if necessary.
 * @param opts Push file options
 */
export async function pushFile(
  client: AfcClient,
  localPathOrPayload: string | Buffer,
  remotePath: string,
  opts: PushFileOptions = {},
): Promise<void> {
  const {timeoutMs = IO_TIMEOUT_MS, log = defaultLogger} = opts;
  const timer = new timing.Timer().start();
  await remoteMkdirp(client, path.dirname(remotePath));

  const pushPromise = Buffer.isBuffer(localPathOrPayload)
    ? client.setFileContents(remotePath, localPathOrPayload)
    : client.writeFromStream(remotePath, fs.createReadStream(localPathOrPayload, {autoClose: true}));

  const actualTimeout = Math.max(timeoutMs, 60000);
  await withTimeout(
    pushPromise,
    actualTimeout,
    `Timed out after ${actualTimeout}ms while pushing file to '${remotePath}'`,
  );

  const fileSize = Buffer.isBuffer(localPathOrPayload)
    ? localPathOrPayload.length
    : (await fs.stat(localPathOrPayload)).size;
  logAfcTransferPerformance(log, 'upload', fileSize, remotePath, timer);
}

/**
 * Pushes a folder to a real device
 *
 * @param client AFC client instance
 * @param srcRootPath The full path to the source folder
 * @param dstRootPath The relative path to the destination folder. The folder
 * will be deleted if already exists.
 * @param opts Push folder options
 */
export async function pushFolder(
  client: AfcClient,
  srcRootPath: string,
  dstRootPath: string,
  opts: PushFolderOptions = {},
): Promise<void> {
  const {timeoutMs = IO_TIMEOUT_MS, enableParallelPush = false, log = defaultLogger} = opts;

  const timer = new timing.Timer().start();
  const allItems = /** @type {import('path-scurry').Path[]} */ /** @type {unknown} */ (
    await fs.glob('**', {
      cwd: srcRootPath,
      withFileTypes: true,
    })
  ) as any[];
  log.debug(`Successfully scanned the tree structure of '${srcRootPath}'`);
  // top-level folders go first
  const foldersToPush: string[] = allItems
    .filter((x) => x.isDirectory())
    .map((x) => x.relative())
    .sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  // larger files go first
  const filesToPush: string[] = allItems
    .filter((x) => !x.isDirectory())
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .map((x) => x.relative());
  const totalBytes = allItems.filter((x) => !x.isDirectory()).reduce((sum, x) => sum + (x.size ?? 0), 0);
  log.debug(
    `Got ${util.pluralize('folder', foldersToPush.length, true)} and ` +
      `${util.pluralize('file', filesToPush.length, true)} to push`,
  );
  // Create the folder structure
  try {
    await client.deleteDirectory(dstRootPath);
  } catch {}

  // do not forget about the root folder
  await client.createDirectory(dstRootPath);
  for (const relativeFolderPath of foldersToPush) {
    let absoluteFolderPath = path.join(dstRootPath, relativeFolderPath);
    while (absoluteFolderPath.endsWith(path.sep)) {
      absoluteFolderPath = absoluteFolderPath.slice(0, -path.sep.length);
    }
    if (absoluteFolderPath) {
      await client.createDirectory(absoluteFolderPath);
    }
  }
  log.debug(
    `Successfully created the remote folder structure ` + `(${util.pluralize('item', foldersToPush.length + 1, true)})`,
  );

  const _pushFile = async (relativePath: string): Promise<void> => {
    const absoluteSourcePath = path.join(srcRootPath, relativePath);
    const readStream = fs.createReadStream(absoluteSourcePath, {autoClose: true});
    const absoluteDestinationPath = path.join(dstRootPath, relativePath);

    const pushPromise = client.writeFromStream(absoluteDestinationPath, readStream);
    const actualTimeout = Math.max(timeoutMs - timer.getDuration().asMilliSeconds, 60000);
    await withTimeout(
      pushPromise,
      actualTimeout,
      `Timed out after ${actualTimeout}ms while pushing '${relativePath}' to '${absoluteDestinationPath}'`,
    );
  };

  if (enableParallelPush) {
    log.debug(`Proceeding to parallel files push (max ${MAX_IO_CHUNK_SIZE} writers)`);
    await withTimeout(
      asyncmap(
        filesToPush,
        async (relativeFilePath) => {
          await _pushFile(relativeFilePath);
          const elapsedMs = timer.getDuration().asMilliSeconds;
          if (elapsedMs > timeoutMs) {
            throw new TimeoutError(`Timed out after ${elapsedMs} ms`);
          }
        },
        {concurrency: MAX_IO_CHUNK_SIZE},
      ),
      Math.max(timeoutMs - timer.getDuration().asMilliSeconds, 60000),
    );
  } else {
    log.debug(`Proceeding to serial files push`);
    for (const relativeFilePath of filesToPush) {
      await _pushFile(relativeFilePath);
      const elapsedMs = timer.getDuration().asMilliSeconds;
      if (elapsedMs > timeoutMs) {
        throw new TimeoutError(`Timed out after ${elapsedMs} ms`);
      }
    }
  }

  logAfcTransferPerformance(log, 'upload', totalBytes, dstRootPath, timer, {
    fileCount: filesToPush.length,
    folderCount: foldersToPush.length,
  });
}

/**
 * Get list of connected devices.

 * @param opts - Driver options; used to decide if tunnel registry is used.
 */
export async function getConnectedDevices(opts: XCUITestDriverOpts): Promise<string[]> {
  const client = await ConnectedDevicesClient.create(opts);
  return await client.getConnectedDevices();
}

/**
 * Install app to real device
 */
export async function installToRealDevice(
  this: XCUITestDriver,
  app: string,
  bundleId?: string,
  opts: ManagementInstallOptions = {},
): Promise<void> {
  const device = this.device as RealDevice;

  if (!device.udid || !app || !bundleId) {
    this.log.debug('No device id, app or bundle id, not installing to real device.');
    return;
  }

  const {skipUninstall, timeout = DEFAULT_APP_INSTALLATION_TIMEOUT_MS} = opts;

  if (!skipUninstall) {
    this.log.info(`Reset requested. Removing app with id '${bundleId}' from the device`);
    await device.remove(bundleId);
  }
  this.log.debug(`Installing '${app}' on the device with UUID '${device.udid}'`);

  try {
    await device.install(app, bundleId, {
      timeoutMs: timeout,
    });
    this.log.debug('The app has been installed successfully.');
  } catch (e) {
    // Want to clarify the device's application installation state in this situation.

    if (!skipUninstall || !(e as Error).message.includes('MismatchedApplicationIdentifierEntitlement')) {
      // Other error cases that could not be recoverable by here.
      // Exact error will be in the log.

      // We cannot recover 'ApplicationVerificationFailed' situation since this reason is clearly the app's provisioning profile was invalid.
      // [XCUITest] Error installing app '/path/to.app': Unexpected data: {"Error":"ApplicationVerificationFailed","ErrorDetail":-402620395,"ErrorDescription":"Failed to verify code signature of /path/to.app : 0xe8008015 (A valid provisioning profile for this executable was not found.)"}
      throw e;
    }

    // If the error was by below error case, we could recover the situation
    // by uninstalling the device's app bundle id explicitly regard less the app exists on the device or not (e.g. offload app).
    // [XCUITest] Error installing app '/path/to.app': Unexpected data: {"Error":"MismatchedApplicationIdentifierEntitlement","ErrorDescription":"Upgrade's application-identifier entitlement string (TEAM_ID.com.kazucocoa.example) does not match installed application's application-identifier string (ANOTHER_TEAM_ID.com.kazucocoa.example); rejecting upgrade."}
    this.log.info(
      `The application identified by '${bundleId}' cannot be installed because it might ` +
        `be already cached on the device, probably with a different signature. ` +
        `Will try to remove it and install a new copy. Original error: ${(e as Error).message}`,
    );
    await device.remove(bundleId);
    await device.install(app, bundleId, {
      timeoutMs: timeout,
    });
    this.log.debug('The app has been installed after one retrial.');
  }
}

/**
 * Run real device reset
 */
export async function runRealDeviceReset(this: XCUITestDriver): Promise<void> {
  if (!this.opts.noReset || this.opts.fullReset) {
    this.log.debug('Reset: running ios real device reset flow');
    if (!this.opts.noReset) {
      await (this.device as RealDevice).reset(this.opts);
    }
  } else {
    this.log.debug('Reset: fullReset not set. Leaving as is');
  }
}

/**
 * Configures Safari startup options based on the given session capabilities.
 *
 * !!! This method mutates driver options.
 *
 * @returns true if process arguments have been modified
 */
export function applySafariStartupArgs(this: XCUITestDriver): boolean {
  const prefs = buildSafariPreferences(this.opts);
  if (isEmpty(prefs)) {
    return false;
  }

  const args = Object.entries(prefs).flatMap(([key, value]) => [key.startsWith('-') ? key : `-${key}`, String(value)]);
  defaultLogger.debug(`Generated Safari command line arguments: ${args.join(' ')}`);
  const processArguments = this.opts.processArguments as {args: string[]} | undefined;
  if (processArguments && isPlainObject(processArguments)) {
    processArguments.args = [...(processArguments.args ?? []), ...args];
  } else {
    this.opts.processArguments = {args};
  }
  return true;
}

/**
 * Auto-detect device UDID
 */
export async function detectUdid(this: XCUITestDriver): Promise<string> {
  this.log.debug('Auto-detecting real device udid...');
  const udids = await getConnectedDevices(this.opts);
  if (isEmpty(udids)) {
    throw new Error('No real devices are connected to the host');
  }
  const udid = udids[udids.length - 1];
  if (udids.length > 1) {
    this.log.info(`Multiple devices found: ${udids.join(', ')}`);
    this.log.info(`Choosing '${udid}'. Consider settings the 'udid' capability if another device must be selected`);
  }
  this.log.debug(`Detected real device udid: '${udid}'`);
  return udid;
}

// #region Private Helper Functions

function logAfcTransferPerformance(
  log: AppiumLogger,
  direction: 'upload' | 'download',
  byteCount: number,
  remotePath: string,
  timer: timing.Timer,
  stats: AfcTransferStats = {},
): void {
  const elapsedMs = timer.getDuration().asMilliSeconds;
  const elapsedSec = elapsedMs / 1000;
  const preposition = direction === 'upload' ? 'to' : 'from';
  const {fileCount, folderCount} = stats;
  const itemSummary =
    fileCount !== undefined || folderCount !== undefined
      ? ` (${util.pluralize('file', fileCount ?? 0, true)}` +
        `${folderCount !== undefined ? ` and ${util.pluralize('folder', folderCount, true)}` : ''})`
      : '';

  log.debug(
    `AFC ${direction} of ${util.toReadableSizeString(byteCount)} ${preposition} '${remotePath}'` +
      `${itemSummary} completed in ${elapsedMs.toFixed(0)}ms`,
  );
  if (elapsedSec >= 1 && byteCount > 0) {
    const bytesPerSec = Math.floor(byteCount / elapsedSec);
    log.debug(`Approximate average AFC ${direction} speed: ${util.toReadableSizeString(bytesPerSec)}/s`);
  }
}

/**
 * If the environment variable enables APPIUM_XCUITEST_PREFER_DEVICECTL.
 * This is a workaround for wireless tvOS.
 * @returns True if the APPIUM_XCUITEST_PREFER_DEVICECTL is set.
 */
function isPreferDevicectlEnabled(): boolean {
  return ['yes', 'true', '1'].includes(String(process.env.APPIUM_XCUITEST_PREFER_DEVICECTL).toLowerCase());
}

/**
 * Creates remote folder path recursively. Noop if the given path
 * already exists
 *
 * @param client AFC client instance
 * @param remoteRoot The relative path to the remote folder structure
 * to be created
 */
async function remoteMkdirp(client: AfcClient, remoteRoot: string): Promise<void> {
  if (remoteRoot === '.' || remoteRoot === '/') {
    return;
  }

  try {
    await client.listDirectory(remoteRoot);
    return;
  } catch {
    // Directory is missing, create parent first
    await remoteMkdirp(client, path.dirname(remoteRoot));
  }

  await client.createDirectory(remoteRoot);
}

// #endregion Private Helper Functions
