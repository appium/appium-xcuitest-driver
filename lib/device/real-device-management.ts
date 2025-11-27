import _ from 'lodash';
import B, {TimeoutError} from 'bluebird';
import {fs, tempDir, mkdirp, zip, util, timing} from 'appium/support';
import path from 'path';
import {services, utilities, INSTRUMENT_CHANNEL} from 'appium-ios-device';
import {buildSafariPreferences, SAFARI_BUNDLE_ID} from '../app-utils';
import defaultLogger from '../logger';
import { Devicectl } from 'node-devicectl';
import type { AppiumLogger } from '@appium/types';
import type { XCUITestDriver } from '../driver';

const DEFAULT_APP_INSTALLATION_TIMEOUT_MS = 8 * 60 * 1000;
export const IO_TIMEOUT_MS = 4 * 60 * 1000;
// Mobile devices use NAND memory modules for the storage,
// and the parallelism there is not as performant as on regular SSDs
const MAX_IO_CHUNK_SIZE = 8;
const APPLICATION_INSTALLED_NOTIFICATION = 'com.apple.mobile.application_installed';
const APPLICATION_NOTIFICATION_TIMEOUT_MS = 30 * 1000;
const INSTALLATION_STAGING_DIR = 'PublicStaging';

//#region Public File System Functions

/**
 * Retrieve a file from a real device
 *
 * @param afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param remotePath Relative path to the file on the device
 * @returns The file content as a buffer
 */
export async function pullFile(afcService: any, remotePath: string): Promise<Buffer> {
  const stream = await afcService.createReadStream(remotePath, {autoDestroy: true});
  const pullPromise = new B((resolve, reject) => {
    stream.on('close', resolve);
    stream.on('error', reject);
  }).timeout(IO_TIMEOUT_MS);
  const buffers: Buffer[] = [];
  stream.on('data', (data: Buffer) => buffers.push(data));
  await pullPromise;
  return Buffer.concat(buffers);
}

/**
 * Retrieve a folder from a real device
 *
 * @param afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param remoteRootPath Relative path to the folder on the device
 * @returns The folder content as a zipped base64-encoded buffer
 */
export async function pullFolder(afcService: any, remoteRootPath: string): Promise<Buffer> {
  const tmpFolder = await tempDir.openDir();
  try {
    let localTopItem: string | null = null;
    let countFilesSuccess = 0;
    let countFilesFail = 0;
    let countFolders = 0;
    const pullPromises: B<void>[] = [];
    await afcService.walkDir(remoteRootPath, true, async (remotePath: string, isDir: boolean) => {
      const localPath = path.join(tmpFolder, remotePath);
      const dirname = isDir ? localPath : path.dirname(localPath);
      if (!(await folderExists(dirname))) {
        await mkdirp(dirname);
      }
      if (!localTopItem || localPath.split(path.sep).length < localTopItem.split(path.sep).length) {
        localTopItem = localPath;
      }
      if (isDir) {
        ++countFolders;
        return;
      }

      const readStream = await afcService.createReadStream(remotePath, {autoDestroy: true});
      const writeStream = fs.createWriteStream(localPath, {autoClose: true});
      pullPromises.push(
        new B<void>((resolve) => {
          writeStream.on('close', () => {
            ++countFilesSuccess;
            resolve();
          });
          const onStreamingError = (e: Error) => {
            readStream.unpipe(writeStream);
            defaultLogger.warn(
              `Cannot pull '${remotePath}' to '${localPath}'. ` +
                `The file will be skipped. Original error: ${e.message}`,
            );
            ++countFilesFail;
            resolve();
          };
          writeStream.on('error', onStreamingError);
          readStream.on('error', onStreamingError);
        }).timeout(IO_TIMEOUT_MS),
      );
      readStream.pipe(writeStream);
      if (pullPromises.length >= MAX_IO_CHUNK_SIZE) {
        await B.any(pullPromises);
        for (let i = pullPromises.length - 1; i >= 0; i--) {
          if (pullPromises[i].isFulfilled()) {
            pullPromises.splice(i, 1);
          }
        }
      }
    });
    // Wait for the rest of files to be pulled
    if (!_.isEmpty(pullPromises)) {
      await B.all(pullPromises);
    }
    defaultLogger.info(
      `Pulled ${util.pluralize('file', countFilesSuccess, true)} out of ` +
        `${countFilesSuccess + countFilesFail} and ${util.pluralize(
          'folder',
          countFolders,
          true,
        )} ` +
        `from '${remoteRootPath}'`,
    );
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
 * @param afcService afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param localPathOrPayload Either full path to the source file
 * or a buffer payload to be written into the remote destination
 * @param remotePath Relative path to the file on the device. The remote
 * folder structure is created automatically if necessary.
 * @param opts Push file options
 */
export async function pushFile(
  afcService: any,
  localPathOrPayload: string | Buffer,
  remotePath: string,
  opts: PushFileOptions = {}
): Promise<void> {
  const {timeoutMs = IO_TIMEOUT_MS} = opts;
  const timer = new timing.Timer().start();
  await remoteMkdirp(afcService, path.dirname(remotePath));
  const source = Buffer.isBuffer(localPathOrPayload)
    ? localPathOrPayload
    : fs.createReadStream(localPathOrPayload, {autoClose: true});
  const writeStream = await afcService.createWriteStream(remotePath, {
    autoDestroy: true,
  });
  writeStream.on('finish', writeStream.destroy);
  let pushError: Error | null = null;
  const filePushPromise = new B<void>((resolve, reject) => {
    writeStream.on('close', () => {
      if (pushError) {
        reject(pushError);
      } else {
        resolve();
      }
    });
    const onStreamError = (e: Error) => {
      if (!Buffer.isBuffer(source)) {
        source.unpipe(writeStream);
      }
      defaultLogger.debug(e);
      pushError = e;
    };
    writeStream.on('error', onStreamError);
    if (!Buffer.isBuffer(source)) {
      source.on('error', onStreamError);
    }
  });
  if (Buffer.isBuffer(source)) {
    writeStream.write(source);
    writeStream.end();
  } else {
    source.pipe(writeStream);
  }
  await filePushPromise.timeout(Math.max(timeoutMs, 60000));
  const fileSize = Buffer.isBuffer(localPathOrPayload)
    ? localPathOrPayload.length
    : (await fs.stat(localPathOrPayload)).size;
  defaultLogger.debug(
    `Successfully pushed the file payload (${util.toReadableSizeString(fileSize)}) ` +
      `to the remote location '${remotePath}' in ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
  );
}

/**
 * Pushes a folder to a real device
 *
 * @param afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param srcRootPath The full path to the source folder
 * @param dstRootPath The relative path to the destination folder. The folder
 * will be deleted if already exists.
 * @param opts Push folder options
 */
export async function pushFolder(
  afcService: any,
  srcRootPath: string,
  dstRootPath: string,
  opts: PushFolderOptions = {}
): Promise<void> {
  const {timeoutMs = IO_TIMEOUT_MS, enableParallelPush = false} = opts;

  const timer = new timing.Timer().start();
  const allItems = /** @type {import('path-scurry').Path[]} */ (
    /** @type {unknown} */ (
      await fs.glob('**', {
        cwd: srcRootPath,
        withFileTypes: true,
      })
    )
  ) as any[];
  defaultLogger.debug(`Successfully scanned the tree structure of '${srcRootPath}'`);
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
  defaultLogger.debug(
    `Got ${util.pluralize('folder', foldersToPush.length, true)} and ` +
      `${util.pluralize('file', filesToPush.length, true)} to push`,
  );
  // create the folder structure first
  try {
    await afcService.deleteDirectory(dstRootPath);
  } catch {}
  await afcService.createDirectory(dstRootPath);
  for (const relativeFolderPath of foldersToPush) {
    // createDirectory does not accept folder names ending with a path separator
    const absoluteFolderPath = _.trimEnd(path.join(dstRootPath, relativeFolderPath), path.sep);
    if (absoluteFolderPath) {
      await afcService.createDirectory(absoluteFolderPath);
    }
  }
  // do not forget about the root folder
  defaultLogger.debug(
    `Successfully created the remote folder structure ` +
      `(${util.pluralize('item', foldersToPush.length + 1, true)})`,
  );

  const _pushFile = async (relativePath: string): Promise<void> => {
    const absoluteSourcePath = path.join(srcRootPath, relativePath);
    const readStream = fs.createReadStream(absoluteSourcePath, {autoClose: true});
    const absoluteDestinationPath = path.join(dstRootPath, relativePath);
    const writeStream = await afcService.createWriteStream(absoluteDestinationPath, {
      autoDestroy: true,
    });
    writeStream.on('finish', writeStream.destroy);
    let pushError: Error | null = null;
    const filePushPromise = new B<void>((resolve, reject) => {
      writeStream.on('close', () => {
        if (pushError) {
          reject(pushError);
        } else {
          resolve();
        }
      });
      const onStreamError = (e: Error) => {
        readStream.unpipe(writeStream);
        defaultLogger.debug(e);
        pushError = e;
      };
      writeStream.on('error', onStreamError);
      readStream.on('error', onStreamError);
    });
    readStream.pipe(writeStream);
    await filePushPromise.timeout(Math.max(timeoutMs - timer.getDuration().asMilliSeconds, 60000));
  };

  if (enableParallelPush) {
    defaultLogger.debug(`Proceeding to parallel files push (max ${MAX_IO_CHUNK_SIZE} writers)`);
    const pushPromises: B<void>[] = [];
    for (const relativeFilePath of filesToPush) {
      pushPromises.push(B.resolve(_pushFile(relativeFilePath)));
      // keep the push queue filled
      if (pushPromises.length >= MAX_IO_CHUNK_SIZE) {
        await B.any(pushPromises);
        const elapsedMs = timer.getDuration().asMilliSeconds;
        if (elapsedMs > timeoutMs) {
          throw new TimeoutError(`Timed out after ${elapsedMs} ms`);
        }
      }
      for (let i = pushPromises.length - 1; i >= 0; i--) {
        if (pushPromises[i].isFulfilled()) {
          pushPromises.splice(i, 1);
        }
      }
    }
    if (!_.isEmpty(pushPromises)) {
      const remainingPromises = pushPromises.filter((p) => !p.isFulfilled());
      if (remainingPromises.length > 0) {
        await B.all(remainingPromises).timeout(
          Math.max(timeoutMs - timer.getDuration().asMilliSeconds, 60000),
        );
      }
    }
  } else {
    defaultLogger.debug(`Proceeding to serial files push`);
    for (const relativeFilePath of filesToPush) {
      await _pushFile(relativeFilePath);
      const elapsedMs = timer.getDuration().asMilliSeconds;
      if (elapsedMs > timeoutMs) {
        throw new TimeoutError(`Timed out after ${elapsedMs} ms`);
      }
    }
  }

  defaultLogger.debug(
    `Successfully pushed ${util.pluralize('folder', foldersToPush.length, true)} ` +
      `and ${util.pluralize('file', filesToPush.length, true)} ` +
      `within ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
  );
}

//#endregion

//#region Public Device Connection Functions

/**
 * Get list of connected devices
 */
export async function getConnectedDevices(): Promise<string[]> {
  if (['yes', 'true', '1'].includes(_.toLower(process.env.APPIUM_XCUITEST_PREFER_DEVICECTL))) {
    return (await new Devicectl('').listDevices())
      .map(({hardwareProperties}) => hardwareProperties?.udid)
      .filter(Boolean);
  }
  return await utilities.getConnectedDevices();
}

//#endregion

//#region Public Real Device Class

export class RealDevice {
  readonly udid: string;
  private readonly _log: AppiumLogger;
  readonly devicectl: Devicectl;

  constructor(udid: string, logger?: AppiumLogger) {
    this.udid = udid;
    this._log = logger ?? defaultLogger;
    this.devicectl = new Devicectl(this.udid);
  }

  get log(): AppiumLogger {
    return this._log;
  }

  async remove(bundleId: string): Promise<void> {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      await service.uninstallApplication(bundleId);
    } finally {
      service.close();
    }
  }

  async removeApp(bundleId: string): Promise<void> {
    await this.remove(bundleId);
  }

  async install(appPath: string, bundleId: string, opts: RealDeviceInstallOptions = {}): Promise<void> {
    const {
      timeoutMs = IO_TIMEOUT_MS,
    } = opts;
    const timer = new timing.Timer().start();
    const afcService = await services.startAfcService(this.udid);
    try {
      let bundlePathOnPhone: string;
      if ((await fs.stat(appPath)).isFile()) {
        // https://github.com/doronz88/pymobiledevice3/blob/6ff5001f5776e03b610363254e82d7fbcad4ef5f/pymobiledevice3/services/installation_proxy.py#L75
        bundlePathOnPhone = `/${path.basename(appPath)}`;
        await pushFile(afcService, appPath, bundlePathOnPhone, {
          timeoutMs,
        });
      } else {
        bundlePathOnPhone = `${INSTALLATION_STAGING_DIR}/${bundleId}`;
        await pushFolder(afcService, appPath, bundlePathOnPhone, {
          enableParallelPush: true,
          timeoutMs,
        });
      }
      await this.installOrUpgradeApplication(
        bundlePathOnPhone,
        {
          timeout: Math.max(timeoutMs - timer.getDuration().asMilliSeconds, 60000),
          isUpgrade: await this.isAppInstalled(bundleId),
        }
      );
    } catch (err) {
      this.log.debug((err as Error).stack);
      let errMessage = `Cannot install the ${bundleId} application`;
      if (err instanceof TimeoutError) {
        errMessage += `. Consider increasing the value of 'appPushTimeout' capability (the current value equals to ${timeoutMs}ms)`;
      }
      errMessage += `. Original error: ${(err as Error).message}`;
      throw new Error(errMessage);
    } finally {
      afcService.close();
    }
    this.log.info(
      `The installation of '${bundleId}' succeeded after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`
    );
  }

  async installOrUpgradeApplication(bundlePathOnPhone: string, opts: InstallOrUpgradeOptions): Promise<void> {
    const {isUpgrade, timeout} = opts;
    const notificationService = await services.startNotificationProxyService(this.udid);
    const installationService = await services.startInstallationProxyService(this.udid);
    const appInstalledNotification = new B<void>((resolve) => {
      notificationService.observeNotification(APPLICATION_INSTALLED_NOTIFICATION, {
        notification: resolve,
      });
    });
    const clientOptions = {PackageType: 'Developer'};
    try {
      if (isUpgrade) {
        this.log.debug(
          `An upgrade of the existing application is going to be performed. ` +
          `Will timeout in ${timeout.toFixed(0)} ms`
        );
        await installationService.upgradeApplication(bundlePathOnPhone, clientOptions, timeout);
      } else {
        this.log.debug(
          `A new application installation is going to be performed. ` +
          `Will timeout in ${timeout.toFixed(0)} ms`
        );
        await installationService.installApplication(bundlePathOnPhone, clientOptions, timeout);
      }
      try {
        await appInstalledNotification.timeout(
          APPLICATION_NOTIFICATION_TIMEOUT_MS,
          `Could not get the application installed notification within ` +
            `${APPLICATION_NOTIFICATION_TIMEOUT_MS}ms but we will continue`,
        );
      } catch (e) {
        this.log.warn((e as Error).message);
      }
    } finally {
      installationService.close();
      notificationService.close();
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
    returnAttributes: string | string[] = ['CFBundleIdentifier', 'CFBundleVersion']
  ): Promise<Record<string, any> | undefined> {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      return (
        await service.lookupApplications({
          bundleIds: bundleId,
          // https://github.com/appium/appium/issues/18753
          returnAttributes,
        })
      )[bundleId];
    } finally {
      service.close();
    }
  }

  async terminateApp(bundleId: string, platformVersion: string): Promise<boolean> {
    let instrumentService: any;
    let installProxyService: any;
    try {
      installProxyService = await services.startInstallationProxyService(this.udid);
      const apps = await installProxyService.listApplications({
        returnAttributes: ['CFBundleIdentifier', 'CFBundleExecutable']
      });
      if (!apps[bundleId]) {
        this.log.info(`The bundle id '${bundleId}' did not exist`);
        return false;
      }
      const executableName = apps[bundleId].CFBundleExecutable;
      this.log.debug(`The executable name for the bundle id '${bundleId}' was '${executableName}'`);

      // 'devicectl' has overhead (generally?) than the instrument service via appium-ios-device,
      // so hre uses the 'devicectl' only for iOS 17+.
      if (util.compareVersions(platformVersion, '>=', '17.0')) {
        this.log.debug(`Calling devicectl to kill the process`);

        const pids = (await this.devicectl.listProcesses())
          .filter(({executable}) => executable.endsWith(`/${executableName}`))
          .map(({processIdentifier}) => processIdentifier);
        if (_.isEmpty(pids)) {
          this.log.info(`The process of the bundle id '${bundleId}' was not running`);
          return false;
        }
        await this.devicectl.sendSignalToProcess(pids[0], 2);
      } else {
        instrumentService = await services.startInstrumentService(this.udid);

        // The result of "runningProcesses" includes `bundle_id` key in iOS 16+ (possibly a specific 16.x+)
        // then here may not be necessary to find a process with `CFBundleExecutable`
        // after dropping older iOS version support.
        const processes = await instrumentService.callChannel(
          INSTRUMENT_CHANNEL.DEVICE_INFO,
          'runningProcesses',
        );
        const process = processes.selector.find((process: any) => process.name === executableName);
        if (!process) {
          this.log.info(`The process of the bundle id '${bundleId}' was not running`);
          return false;
        }
          await instrumentService.callChannel(
          INSTRUMENT_CHANNEL.PROCESS_CONTROL,
          'killPid:',
          `${process.pid}`,
        );
      }
    } catch (err) {
      this.log.warn(`Failed to kill '${bundleId}'. Original error: ${(err as any).stderr || (err as Error).message}`);
      return false;
    } finally {
      if (installProxyService) {
        installProxyService.close();
      }
      if (instrumentService) {
        instrumentService.close();
      }
    }
    return true;
  }

  /**
   * @param bundleName The name of CFBundleName in Info.plist
   *
   * @returns A list of User level apps' bundle ids which has
   *                          'CFBundleName' attribute as 'bundleName'.
   */
  async getUserInstalledBundleIdsByBundleName(bundleName: string): Promise<string[]> {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      const applications = await service.listApplications({
        applicationType: 'User', returnAttributes: ['CFBundleIdentifier', 'CFBundleName']
      });
      return _.reduce(
        applications,
        (acc: string[], {CFBundleName}, key: string) => {
          if (CFBundleName === bundleName) {
            acc.push(key);
          }
          return acc;
        },
        [],
      );
    } finally {
      service.close();
    }
  }

  async getPlatformVersion(): Promise<string> {
    return await utilities.getOSVersion(this.udid);
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
}

//#endregion

//#region Public Device Management Functions

/**
 * Install app to real device
 */
export async function installToRealDevice(
  this: XCUITestDriver,
  app: string,
  bundleId?: string,
  opts: ManagementInstallOptions = {}
): Promise<void> {
  const device = this.device as RealDevice;

  if (!device.udid || !app || !bundleId) {
    this.log.debug('No device id, app or bundle id, not installing to real device.');
    return;
  }

  const {
    skipUninstall,
    timeout = DEFAULT_APP_INSTALLATION_TIMEOUT_MS,
  } = opts;

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
    this.log.info(`The application identified by '${bundleId}' cannot be installed because it might ` +
      `be already cached on the device, probably with a different signature. ` +
      `Will try to remove it and install a new copy. Original error: ${(e as Error).message}`);
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
  if (_.isEmpty(prefs)) {
    return false;
  }

  const args = _.toPairs(prefs)
    .flatMap(([key, value]) => [_.startsWith(key, '-') ? key : `-${key}`, String(value)]);
  defaultLogger.debug(`Generated Safari command line arguments: ${args.join(' ')}`);
  const processArguments = this.opts.processArguments as {args: string[]} | undefined;
  if (processArguments && _.isPlainObject(processArguments)) {
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
  const udids = await getConnectedDevices();
  if (_.isEmpty(udids)) {
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


//#endregion

//#region Private Helper Functions

/**
 * Checks a presence of a local folder.
 *
 * @param folderPath Full path to the local folder
 * @returns True if the folder exists and is actually a folder
 */
async function folderExists(folderPath: string): Promise<boolean> {
  try {
    return (await fs.stat(folderPath)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Creates remote folder path recursively. Noop if the given path
 * already exists
 *
 * @param afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param remoteRoot The relative path to the remote folder structure
 * to be created
 */
async function remoteMkdirp(afcService: any, remoteRoot: string): Promise<void> {
  if (remoteRoot === '.' || remoteRoot === '/') {
    return;
  }
  try {
    await afcService.listDirectory(remoteRoot);
    return;
  } catch {
    // This means that the directory is missing and we got an object not found error.
    // Therefore, we are going to the parent
    await remoteMkdirp(afcService, path.dirname(remoteRoot));
  }
  await afcService.createDirectory(remoteRoot);
}

//#endregion

//#region Type Definitions

export interface PushFileOptions {
  /** The maximum count of milliceconds to wait until file push is completed. Cannot be lower than 60000ms */
  timeoutMs?: number;
}

export interface PushFolderOptions {
  /** The maximum timeout to wait until a single file is copied */
  timeoutMs?: number;
  /** Whether to push files in parallel. This usually gives better performance, but might sometimes be less stable. */
  enableParallelPush?: boolean;
}

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

//#endregion
