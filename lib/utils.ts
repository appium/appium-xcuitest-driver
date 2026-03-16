import * as xcode from 'appium-xcode';
import {errors} from 'appium/driver';
import {fs, net, util} from 'appium/support';
import B from 'bluebird';
import _ from 'lodash';
import os from 'node:os';
import path from 'node:path';
import * as semver from 'semver';
import {exec} from 'teen_process';
import {log} from './logger';
import {PLATFORM_NAME_TVOS, PLATFORM_NAME_IOS} from './desired-caps';
import type {XCUITestDriverOpts, XCUITestDriver} from './driver';
import type {XcodeVersion} from 'appium-xcode';
import type {Simulator} from 'appium-ios-simulator';
import type {RealDevice} from './device/real-device-management';
import type {HTTPHeaders} from '@appium/types';
import type {Method} from 'axios';

export const UDID_AUTO = 'auto';
const MODULE_NAME = 'appium-xcuitest-driver';
export const DEFAULT_TIMEOUT_KEY = 'default';
const XCTEST_LOG_FILES_PATTERNS = [
  /^Session-WebDriverAgentRunner.*\.log$/i,
  /^StandardOutputAndStandardError\.txt$/i,
];
const XCTEST_LOGS_CACHE_FOLDER_PREFIX = 'com.apple.dt.XCTest';
export const NATIVE_WIN = 'NATIVE_APP';

export async function getAndCheckXcodeVersion(): Promise<XcodeVersion> {
  try {
    return await xcode.getVersion(true);
  } catch (err: any) {
    throw log.errorWithException(`Could not determine Xcode version: ${err.message}`);
  }
}

export async function getAndCheckIosSdkVersion(): Promise<string | null> {
  try {
    return await xcode.getMaxIOSSDK();
  } catch (err: any) {
    throw log.errorWithException(`Could not determine iOS SDK version: ${err.message}`);
  }
}

export async function clearLogs(locations: string[]): Promise<void> {
  log.debug('Clearing log files');
  const cleanupPromises: Promise<void>[] = [];
  for (const location of locations) {
    if (!(await fs.exists(location))) {
      continue;
    }

    cleanupPromises.push(
      (async () => {
        let size: string | undefined;
        try {
          const {stdout} = await exec('du', ['-sh', location]);
          size = stdout.trim().split(/\s+/)[0];
        } catch {}
        try {
          log.debug(`Deleting '${location}'. ${size ? `Freeing ${size}.` : ''}`);
          await fs.rimraf(location);
        } catch (err: any) {
          log.warn(`Unable to delete '${location}': ${err.message}`);
        }
      })(),
    );
  }
  if (!_.isEmpty(cleanupPromises)) {
    await B.all(cleanupPromises);
  }
  log.debug('Finished clearing log files');
}

// This map contains derived data logs folders as keys
// and values are the count of times the particular
// folder has been scheduled for removal
const derivedDataCleanupMarkers = new Map<string, number>();

export async function markSystemFilesForCleanup(wda: any): Promise<void> {
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    log.warn(
      'No WebDriverAgent derived data available, so unable to mark system files for cleanup',
    );
    return;
  }

  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
  let markersCount = 0;
  const existingCount = derivedDataCleanupMarkers.get(logsRoot);
  if (existingCount !== undefined) {
    markersCount = existingCount;
  }
  derivedDataCleanupMarkers.set(logsRoot, ++markersCount);
}

export async function clearSystemFiles(wda: any): Promise<void> {
  // only want to clear the system files for the particular WDA xcode run
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    log.warn('No WebDriverAgent derived data available, so unable to clear system files');
    return;
  }

  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
  const existingCount = derivedDataCleanupMarkers.get(logsRoot);
  if (existingCount !== undefined) {
    let markersCount = existingCount;
    derivedDataCleanupMarkers.set(logsRoot, --markersCount);
    if (markersCount > 0) {
      log.info(
        `Not cleaning '${logsRoot}' folder, because the other session does not expect it to be cleaned`,
      );
      return;
    }
  }
  derivedDataCleanupMarkers.set(logsRoot, 0);

  // Cleaning up big temporary files created by XCTest: https://github.com/appium/appium/issues/9410
  const globPattern = `${os.tmpdir()}/${XCTEST_LOGS_CACHE_FOLDER_PREFIX}*/`;
  const dstFolders = await fs.glob(globPattern);
  if (_.isEmpty(dstFolders)) {
    log.debug(`Did not find the temporary XCTest logs root at '${globPattern}'`);
  } else {
    // perform the cleanup asynchronously
    const promises: Promise<void>[] = [];
    for (const dstFolder of dstFolders) {
      const promise = (async () => {
        try {
          await fs.walkDir(dstFolder, true, (itemPath, isDir) => {
            if (isDir) {
              return;
            }
            const fileName = path.basename(itemPath);
            if (XCTEST_LOG_FILES_PATTERNS.some((p) => p.test(fileName))) {
              fs.rimraf(itemPath);
            }
          });
        } catch (e: any) {
          log.debug(e.stack);
          log.info(e.message);
        }
      })();
      promises.push(promise);
    }
    log.debug(`Started XCTest logs cleanup in '${dstFolders}'`);
    if (promises.length) {
      await B.all(promises);
    }
  }

  if (await fs.exists(logsRoot)) {
    log.info(`Cleaning test logs in '${logsRoot}' folder`);
    await clearLogs([logsRoot]);
    return;
  }
  log.info(`There is no ${logsRoot} folder, so not cleaning files`);
}

export async function checkAppPresent(app: string): Promise<void> {
  log.debug(`Checking whether app '${app}' is actually present on file system`);
  if (!(await fs.exists(app))) {
    throw log.errorWithException(`Could not find app at '${app}'`);
  }
  log.debug('App is present');
}

/**
 * Reads the content to the current module's package.json
 *
 * @returns The full path to module root
 * @throws If the current module's package.json cannot be determined
 */
const getModuleManifest = _.memoize(async function getModuleManifest(): Promise<
  Record<string, any>
> {
  // Start from the directory containing the compiled output (build/lib) or source (lib)
  // and walk up to find package.json
  let currentDir = path.resolve(__dirname, '..');
  let isAtFsRoot = false;
  while (!isAtFsRoot) {
    const manifestPath = path.join(currentDir, 'package.json');
    try {
      if (await fs.exists(manifestPath)) {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        if (manifest.name === MODULE_NAME) {
          return manifest;
        }
      }
    } catch {}
    const parentDir = path.dirname(currentDir);
    isAtFsRoot = currentDir.length <= parentDir.length;
    currentDir = parentDir;
  }
  throw new Error(`Cannot find the package manifest of the ${MODULE_NAME} Node.js module`);
});

/**
 * @typedef {Object} DriverInfo
 * @property {string} version Driver version string
 * @property {string} built Driver build timestamp
 */

export interface DriverInfo {
  version: string;
  built: string;
}

/**
 * @returns
 */
export const getDriverInfo = _.memoize(async function getDriverInfo(): Promise<DriverInfo> {
  const [stat, manifest] = await B.all([
    fs.stat(path.resolve(__dirname, '..')),
    getModuleManifest(),
  ]);
  return {
    built: stat.mtime.toString(),
    version: manifest.version,
  };
});

export function normalizeCommandTimeouts(
  value: string | Record<string, number>,
): Record<string, number> {
  // The value is normalized already
  if (typeof value !== 'string') {
    return value;
  }

  let result: Record<string, number> = {};
  // Use as default timeout for all commands if a single integer value is provided
  if (!isNaN(Number(value))) {
    result[DEFAULT_TIMEOUT_KEY] = _.toInteger(value);
    return result;
  }

  // JSON object has been provided. Let's parse it
  try {
    result = JSON.parse(value);
    if (!_.isPlainObject(result)) {
      throw new Error();
    }
  } catch {
    throw log.errorWithException(
      `"commandTimeouts" capability should be a valid JSON object. "${value}" was given instead`,
    );
  }
  for (const [cmd, timeout] of _.toPairs(result)) {
    if (!_.isInteger(timeout) || timeout <= 0) {
      throw log.errorWithException(
        `The timeout for "${cmd}" should be a valid natural number of milliseconds. "${timeout}" was given instead`,
      );
    }
  }
  return result;
}

export async function printUser(): Promise<void> {
  try {
    const {stdout} = await exec('whoami');
    log.debug(`Current user: '${stdout.trim()}'`);
  } catch (err: any) {
    log.debug(`Unable to get username running server: ${err.message}`);
  }
}

/**
 * Get the IDs of processes listening on the particular system port.
 * It is also possible to apply additional filtering based on the
 * process command line.
 *
 * @param port - The port number.
 * @param filteringFunc - Optional lambda function, which
 *                                    receives command line string of the particular process
 *                                    listening on given port, and is expected to return
 *                                    either true or false to include/exclude the corresponding PID
 *                                    from the resulting array.
 * @returns - the list of matched process ids.
 */
export async function getPIDsListeningOnPort(
  port: string | number,
  filteringFunc: ((cmdLine: string) => boolean | Promise<boolean>) | null = null,
): Promise<string[]> {
  const result: string[] = [];
  try {
    // This only works since Mac OS X El Capitan
    const {stdout} = await exec('lsof', ['-ti', `tcp:${port}`]);
    result.push(...stdout.trim().split(/\n+/));
  } catch {
    return result;
  }

  if (!_.isFunction(filteringFunc)) {
    return result;
  }
  return await B.filter(result, async (x) => {
    const {stdout} = await exec('ps', ['-p', x, '-o', 'command']);
    return await filteringFunc(stdout);
  });
}

/**
 * @typedef {Object} UploadOptions
 *
 * @property {string} [user] - The name of the user for the remote authentication. Only works if `remotePath` is provided.
 * @property {string} [pass] - The password for the remote authentication. Only works if `remotePath` is provided.
 * @property {import('axios').Method} [method] - The http multipart upload method name. The 'PUT' one is used by default.
 *                              Only works if `remotePath` is provided.
 * @property {import('@appium/types').HTTPHeaders} [headers] - Additional headers mapping for multipart http(s) uploads
 * @property {string} [fileFieldName] [file] - The name of the form field, where the file content BLOB should be stored for
 *                                            http(s) uploads
 * @property {Record<string, any> | [string, any][]} [formFields] - Additional form fields for multipart http(s) uploads
 */

export interface UploadOptions {
  user?: string;
  pass?: string;
  method?: Method;
  headers?: HTTPHeaders;
  fileFieldName?: string;
  formFields?: Record<string, any> | [string, any][];
}

/**
 * Encodes the given local file to base64 and returns the resulting string
 * or uploads it to a remote server using http/https or ftp protocols
 * if `remotePath` is set
 *
 * @param localPath - The path to an existing local file
 * @param remotePath - The path to the remote location, where
 *                               this file should be uploaded
 * @param uploadOptions - Set of upload options
 * @returns Either an empty string if the upload was successful or
 * base64-encoded file representation if `remotePath` is falsy
 */
export async function encodeBase64OrUpload(
  localPath: string,
  remotePath: string | null = null,
  uploadOptions: UploadOptions = {},
): Promise<string> {
  if (!(await fs.exists(localPath))) {
    throw log.errorWithException(`The file at '${localPath}' does not exist or is not accessible`);
  }

  if (_.isEmpty(remotePath)) {
    const {size} = await fs.stat(localPath);
    log.debug(`The size of the file is ${util.toReadableSizeString(size)}`);
    return (await util.toInMemoryBase64(localPath)).toString();
  }

  const {user, pass, method, headers, fileFieldName, formFields} = uploadOptions;
  const options: net.HttpUploadOptions & net.NetOptions = {
    method: method || 'PUT',
    headers,
    fileFieldName,
    formFields,
  };
  if (user && pass) {
    options.auth = {user, pass};
  }
  await net.uploadFile(localPath, remotePath as string, options);
  return '';
}

/**
 * Stops and removes all web socket handlers that are listening
 * in scope of the current session.
 *
 * @this {XCUITestDriver}
 * @returns
 */
export async function removeAllSessionWebSocketHandlers(this: XCUITestDriver): Promise<void> {
  if (!this.sessionId || !_.isFunction(this.server?.getWebSocketHandlers)) {
    return;
  }

  const activeHandlers = await this.server.getWebSocketHandlers(this.sessionId);
  for (const pathname of _.keys(activeHandlers)) {
    await this.server.removeWebSocketHandler(pathname);
  }
}

const LOCALHOST_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  // WHATWG URL normalizes IPv6 hostnames with brackets and hex (e.g. ::ffff:127.0.0.1 -> ::ffff:7f00:1)
  '[::1]',
  '[::ffff:7f00:1]',
];

/**
 * Returns true if the urlString is localhost
 * @param urlString
 * @returns Return true if the urlString is localhost
 */
export function isLocalHost(urlString: string): boolean {
  try {
    const hostname = new URL(urlString).hostname;
    return LOCALHOST_HOSTNAMES.includes(hostname);
  } catch {
    log.warn(`'${urlString}' cannot be parsed as a valid URL`);
  }
  return false;
}

/**
 * Normalizes platformVersion to a valid iOS version string
 *
 * @param originalVersion - Loose version number, that can be parsed by semver
 * @return iOS version number in <major>.<minor> format
 * @throws if the version number cannot be parsed
 */
export function normalizePlatformVersion(originalVersion: string): string {
  const normalizedVersion = semver.coerce(originalVersion);
  if (!normalizedVersion) {
    throw new Error(`The platform version '${originalVersion}' should be a valid version number`);
  }
  return `${normalizedVersion.major}.${normalizedVersion.minor}`;
}

/**
 * Assert the presence of particular keys in the given object
 *
 * @param argNames one or more key names
 * @param opts the object to check
 * @returns the same given object
 */
export function requireArgs(
  argNames: string | string[],
  opts: Record<string, any> = {},
): Record<string, any> {
  for (const argName of _.isArray(argNames) ? argNames : [argNames]) {
    if (!_.has(opts, argName)) {
      throw new errors.InvalidArgumentError(`'${argName}' argument must be provided`);
    }
  }
  return opts;
}

/**
 * Requires that the given driver is running on a Simulator and return
 * the simlator instance.
 *
 * @param driver - The driver instance
 * @param action - Description of action
 */
export function requireSimulator(driver: XCUITestDriver, action: string): Simulator {
  if (!driver.isSimulator()) {
    throw new Error(`${_.upperFirst(action)} can only be performed on Simulator`);
  }
  return driver.device as Simulator;
}

/**
 * Requires that the given driver is running on a real device and return
 * the real device instance.
 *
 * @param driver - The driver instance
 * @param action - Description of action
 */
export function requireRealDevice(driver: XCUITestDriver, action: string): RealDevice {
  if (!driver.isRealDevice()) {
    throw new Error(`${_.upperFirst(action)} can only be performed on a real device`);
  }
  return driver.device as RealDevice;
}

/**
 * Check if platform name is the TV OS one.
 */
export function isTvOs(platformName: string | null | undefined): boolean {
  return _.toLower(platformName ?? '') === _.toLower(PLATFORM_NAME_TVOS);
}

/**
 * Return normalized platform name.
 */
export function normalizePlatformName(platformName: string | null | undefined): string {
  return isTvOs(platformName) ? PLATFORM_NAME_TVOS : PLATFORM_NAME_IOS;
}

export function shouldSetInitialSafariUrl(opts: XCUITestDriverOpts): boolean {
  return (
    !(opts.safariInitialUrl === '' || (opts.noReset && _.isNil(opts.safariInitialUrl))) &&
    !opts.initialDeeplinkUrl
  );
}

export function isIos17OrNewer(opts: XCUITestDriverOpts): boolean {
  return !!opts.platformVersion && util.compareVersions(opts.platformVersion, '>=', '17.0');
}

export function isIos18OrNewer(opts: XCUITestDriverOpts): boolean {
  return !!opts.platformVersion && util.compareVersions(opts.platformVersion, '>=', '18.0');
}
