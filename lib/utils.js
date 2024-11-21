import xcode from 'appium-xcode';
import {errors} from 'appium/driver';
import {fs, net, util} from 'appium/support';
import B from 'bluebird';
import _ from 'lodash';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import semver from 'semver';
import {exec} from 'teen_process';
import iosGenericSimulators from './ios-generic-simulators';
import log from './logger';
import {PLATFORM_NAME_TVOS, PLATFORM_NAME_IOS} from './desired-caps';

export const UDID_AUTO = 'auto';
const MODULE_NAME = 'appium-xcuitest-driver';
const DEFAULT_TIMEOUT_KEY = 'default';
const XCTEST_LOG_FILES_PATTERNS = [
  /^Session-WebDriverAgentRunner.*\.log$/i,
  /^StandardOutputAndStandardError\.txt$/i,
];
const XCTEST_LOGS_CACHE_FOLDER_PREFIX = 'com.apple.dt.XCTest';
export const NATIVE_WIN = 'NATIVE_APP';

/**
 * @privateRemarks Is the minimum version really Xcode 7.3?
 * @returns {Promise<XcodeVersion>}
 */
async function getAndCheckXcodeVersion() {
  /** @type {XcodeVersion} */
  let version;
  try {
    version = /** @type {XcodeVersion} */ (await xcode.getVersion(true));
  } catch (err) {
    log.error(err);
    throw new Error(`Could not determine Xcode version: ${err.message}`);
  }

  // we do not support Xcodes < 7.3,
  if (version.versionFloat < 7.3) {
    const msg = `Xcode ${version.versionString} is not supported. Please upgrade to version 7.3 or higher`;
    log.error(msg);
    throw new Error(msg);
  }
  return version;
}

/**
 * @returns {Promise<string|null>}
 */
async function getAndCheckIosSdkVersion() {
  try {
    return await xcode.getMaxIOSSDK();
  } catch (err) {
    throw log.errorWithException(`Could not determine iOS SDK version: ${err.message}`);
  }
}

/**
 * Get the generic simulator for a given IOS version and device type (iPhone, iPad)
 *
 * @param {string|number} platformVersion IOS version. e.g.) 13.0
 * @param {string} deviceName Type of IOS device. Can be iPhone, iPad (possibly more in the future)
 *
 * @returns {string?} Generic iPhone or iPad simulator (if applicable)
 */
function getGenericSimulatorForIosVersion(platformVersion, deviceName) {
  const genericSimulators = iosGenericSimulators[deviceName];
  if (!genericSimulators) {
    return null;
  }

  // Find the highest iOS version in the list that is below the provided version
  let result = null;
  const compareVersions = ([simOne], [simTwo]) =>
    util.compareVersions(simOne, '<', simTwo) ? -1 : 1;
  for (const [platformVersionFromList, iosSimulator] of genericSimulators.sort(compareVersions)) {
    if (util.compareVersions(platformVersionFromList, '>', String(platformVersion))) {
      break;
    }
    result = iosSimulator;
  }
  return result;
}

/**
 *
 * @param {string} platformVersion
 * @param {string} deviceName
 * @returns {string}
 */
function translateDeviceName(platformVersion, deviceName) {
  if (!deviceName) {
    return deviceName;
  }
  const deviceNameTranslated = getGenericSimulatorForIosVersion(
    platformVersion,
    `${deviceName}`.toLowerCase().trim(),
  );
  if (!deviceNameTranslated) {
    return deviceName;
  }

  log.debug(`Changing deviceName from '${deviceName}' to '${deviceNameTranslated}'`);
  return deviceNameTranslated;
}

/**
 * @param {string[]} locations
 * @returns {Promise<void>}
 */
async function clearLogs(locations) {
  log.debug('Clearing log files');
  const cleanupPromises = [];
  for (const location of locations) {
    if (!(await fs.exists(location))) {
      continue;
    }

    cleanupPromises.push(
      (async () => {
        let size;
        try {
          const {stdout} = await exec('du', ['-sh', location]);
          size = stdout.trim().split(/\s+/)[0];
        } catch (ign) {}
        try {
          log.debug(`Deleting '${location}'. ${size ? `Freeing ${size}.` : ''}`);
          await fs.rimraf(location);
        } catch (err) {
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
const derivedDataCleanupMarkers = new Map();

async function markSystemFilesForCleanup(wda) {
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    log.warn(
      'No WebDriverAgent derived data available, so unable to mark system files for cleanup',
    );
    return;
  }

  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
  let markersCount = 0;
  if (derivedDataCleanupMarkers.has(logsRoot)) {
    markersCount = derivedDataCleanupMarkers.get(logsRoot);
  }
  derivedDataCleanupMarkers.set(logsRoot, ++markersCount);
}

async function clearSystemFiles(wda) {
  // only want to clear the system files for the particular WDA xcode run
  if (!wda || !(await wda.retrieveDerivedDataPath())) {
    log.warn('No WebDriverAgent derived data available, so unable to clear system files');
    return;
  }

  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
  if (derivedDataCleanupMarkers.has(logsRoot)) {
    let markersCount = derivedDataCleanupMarkers.get(logsRoot);
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
    /** @type {Promise[]} */
    const promises = [];
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
        } catch (e) {
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

async function checkAppPresent(app) {
  log.debug(`Checking whether app '${app}' is actually present on file system`);
  if (!(await fs.exists(app))) {
    log.errorAndThrow(`Could not find app at '${app}'`);
  }
  log.debug('App is present');
}

/**
 * Reads the content to the current module's package.json
 *
 * @returns {Promise<Record<string, any>>} The full path to module root
 * @throws {Error} If the current module's package.json cannot be determined
 */
const getModuleManifest = _.memoize(async function getModuleManifest() {
  let currentDir = path.dirname(path.resolve(__filename));
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
    } catch (ign) {}
    currentDir = path.dirname(currentDir);
    isAtFsRoot = currentDir.length <= path.dirname(currentDir).length;
  }
  throw new Error(`Cannot find the package manifest of the ${MODULE_NAME} Node.js module`);
});

/**
 * @typedef {Object} DriverInfo
 * @property {string} version Driver version string
 * @property {string} built Driver build timestamp
 */

/**
 * @returns {DriverInfo}
 */
const getDriverInfo = _.memoize(async function getDriverInfo() {
  const [stat, manifest] = await B.all([
    fs.stat(path.resolve(__dirname, '..')),
    getModuleManifest(),
  ]);
  return {
    built: stat.mtime.toString(),
    version: manifest.version,
  };
});

function normalizeCommandTimeouts(value) {
  // The value is normalized already
  if (typeof value !== 'string') {
    return value;
  }

  let result = {};
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
  } catch (err) {
    log.errorAndThrow(
      `"commandTimeouts" capability should be a valid JSON object. "${value}" was given instead`,
    );
  }
  for (let [cmd, timeout] of _.toPairs(result)) {
    if (!_.isInteger(timeout) || timeout <= 0) {
      log.errorAndThrow(
        `The timeout for "${cmd}" should be a valid natural number of milliseconds. "${timeout}" was given instead`,
      );
    }
  }
  return result;
}

async function printUser() {
  try {
    let {stdout} = await exec('whoami');
    log.debug(`Current user: '${stdout.trim()}'`);
  } catch (err) {
    log.debug(`Unable to get username running server: ${err.message}`);
  }
}

/**
 * Get the IDs of processes listening on the particular system port.
 * It is also possible to apply additional filtering based on the
 * process command line.
 *
 * @param {string|number} port - The port number.
 * @param {?Function} filteringFunc - Optional lambda function, which
 *                                    receives command line string of the particular process
 *                                    listening on given port, and is expected to return
 *                                    either true or false to include/exclude the corresponding PID
 *                                    from the resulting array.
 * @returns {Promise<string[]>} - the list of matched process ids.
 */
async function getPIDsListeningOnPort(port, filteringFunc = null) {
  const result = [];
  try {
    // This only works since Mac OS X El Capitan
    const {stdout} = await exec('lsof', ['-ti', `tcp:${port}`]);
    result.push(...stdout.trim().split(/\n+/));
  } catch (e) {
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

/**
 * Encodes the given local file to base64 and returns the resulting string
 * or uploads it to a remote server using http/https or ftp protocols
 * if `remotePath` is set
 *
 * @param {string} localPath - The path to an existing local file
 * @param {string|null} [remotePath] - The path to the remote location, where
 *                               this file should be uploaded
 * @param {UploadOptions} uploadOptions - Set of upload options
 * @returns {Promise<string>} Either an empty string if the upload was successful or
 * base64-encoded file representation if `remotePath` is falsy
 */
async function encodeBase64OrUpload(localPath, remotePath = null, uploadOptions = {}) {
  if (!(await fs.exists(localPath))) {
    log.errorAndThrow(`The file at '${localPath}' does not exist or is not accessible`);
  }

  if (_.isEmpty(remotePath)) {
    const {size} = await fs.stat(localPath);
    log.debug(`The size of the file is ${util.toReadableSizeString(size)}`);
    return (await util.toInMemoryBase64(localPath)).toString();
  }

  const {user, pass, method, headers, fileFieldName, formFields} = uploadOptions;
  const options = {
    method: method || 'PUT',
    headers,
    fileFieldName,
    formFields,
  };
  if (user && pass) {
    options.auth = {user, pass};
  }
  await net.uploadFile(localPath, /** @type {string} */ (remotePath), options);
  return '';
}

/**
 * Stops and removes all web socket handlers that are listening
 * in scope of the currect session.
 *
 * @param {Object} server - The instance of NodeJs HTTP server,
 * which hosts Appium
 * @param {string|null} sessionId - The id of the current session
 */
async function removeAllSessionWebSocketHandlers(server, sessionId) {
  if (!server || !_.isFunction(server.getWebSocketHandlers)) {
    return;
  }

  const activeHandlers = await server.getWebSocketHandlers(sessionId);
  for (const pathname of _.keys(activeHandlers)) {
    await server.removeWebSocketHandler(pathname);
  }
}

/**
 * Returns true if the urlString is localhost
 * @param {string} urlString
 * @returns {boolean} Return true if the urlString is localhost
 */
function isLocalHost(urlString) {
  try {
    const hostname = /** @type {string} */ (url.parse(urlString).hostname);
    return ['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(hostname);
  } catch (ign) {
    log.warn(`'${urlString}' cannot be parsed as a valid URL`);
  }
  return false;
}

/**
 * Normalizes platformVersion to a valid iOS version string
 *
 * @param {string} originalVersion - Loose version number, that can be parsed by semver
 * @return {string} iOS version number in <major>.<minor> format
 * @throws {Error} if the version number cannot be parsed
 */
function normalizePlatformVersion(originalVersion) {
  const normalizedVersion = semver.coerce(originalVersion);
  if (!normalizedVersion) {
    throw new Error(`The platform version '${originalVersion}' should be a valid version number`);
  }
  return `${normalizedVersion.major}.${normalizedVersion.minor}`;
}

/**
 * Assert the presence of particular keys in the given object
 *
 * @param {string|Array<string>} argNames one or more key names
 * @param {Object} opts the object to check
 * @returns {Object} the same given object
 */
function requireArgs(argNames, opts = {}) {
  for (const argName of _.isArray(argNames) ? argNames : [argNames]) {
    if (!_.has(opts, argName)) {
      throw new errors.InvalidArgumentError(`'${argName}' argument must be provided`);
    }
  }
  return opts;
}

/**
 * Asserts that the given driver is running on a Simulator.
 *
 * @param {string} action - Description of action
 * @param {import('./driver').XCUITestDriver} driver
 */
export function assertSimulator(action, driver) {
  if (!driver.isSimulator()) {
    throw new Error(`${_.upperFirst(action)} can only be performed on Simulator`);
  }
}

/**
 * Check if platform name is the TV OS one.
 *
 * @param {string|null|undefined} platformName
 * @returns {boolean}
 */
export function isTvOs(platformName) {
  return _.toLower(platformName ?? '') === _.toLower(PLATFORM_NAME_TVOS);
}

/**
 * Return normalized platform name.
 *
 * @param {string|null|undefined} platformName
 * @returns {string}
 */
export function normalizePlatformName(platformName) {
  return isTvOs(platformName) ? PLATFORM_NAME_TVOS : PLATFORM_NAME_IOS;
}

/**
 * @param {import('./driver').XCUITestDriverOpts} opts
 * @returns {boolean}
 */
export function shouldSetInitialSafariUrl(opts) {
  return !(opts.safariInitialUrl === '' || (opts.noReset && _.isNil(opts.safariInitialUrl)))
    && !opts.initialDeeplinkUrl;
}

/**
 * @param {import('./driver').XCUITestDriverOpts} opts
 * @returns {boolean}
 */
export function isIos17OrNewer(opts) {
  return !!opts.platformVersion && util.compareVersions(opts.platformVersion, '>=', '17.0');
}

export {
  getAndCheckXcodeVersion,
  getAndCheckIosSdkVersion,
  checkAppPresent,
  getDriverInfo,
  clearSystemFiles,
  translateDeviceName,
  normalizeCommandTimeouts,
  DEFAULT_TIMEOUT_KEY,
  markSystemFilesForCleanup,
  printUser,
  getPIDsListeningOnPort,
  encodeBase64OrUpload,
  removeAllSessionWebSocketHandlers,
  isLocalHost,
  normalizePlatformVersion,
  clearLogs,
  requireArgs,
};

/**
 * @typedef {import('appium-xcode').XcodeVersion} XcodeVersion
 */
