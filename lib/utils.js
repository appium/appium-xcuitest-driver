import B from 'bluebird';
import { utilities } from 'appium-ios-device';
import { fs, util, net, plist } from 'appium-support';
import path from 'path';
import { utils as iosUtils } from 'appium-ios-driver';
import { SubProcess, exec } from 'teen_process';
import xcode from 'appium-xcode';
import _ from 'lodash';
import log from './logger';
import iosGenericSimulators from './ios-generic-simulators';
import _fs from 'fs';
import url from 'url';
import v8 from 'v8';
import { PLATFORM_NAME_TVOS } from './desired-caps';
import semver from 'semver';

const DEFAULT_TIMEOUT_KEY = 'default';


async function detectUdid () {
  log.debug('Auto-detecting real device udid...');
  const udids = await utilities.getConnectedDevices();
  if (_.isEmpty(udids)) {
    throw new Error('No device is connected to the host');
  }
  const udid = _.last(udids);
  if (udids.length > 1) {
    log.warn(`Multiple devices found: ${udids.join(', ')}`);
    log.warn(`Choosing '${udid}'. If this is wrong, manually set with 'udid' desired capability`);
  }
  log.debug(`Detected real device udid: '${udid}'`);
  return udid;
}

async function getAndCheckXcodeVersion () {
  let version;
  try {
    version = await xcode.getVersion(true);
  } catch (err) {
    log.debug(err);
    log.errorAndThrow(`Could not determine Xcode version: ${err.message}`);
  }

  // we do not support Xcodes < 7.3,
  if (version.versionFloat < 7.3) {
    log.errorAndThrow(`Xcode version '${version.versionString}'. Support for ` +
                      `Xcode ${version.versionString} is not supported. ` +
                      `Please upgrade to version 7.3 or higher`);
  }
  return version;
}

async function getAndCheckIosSdkVersion () {
  try {
    return await xcode.getMaxIOSSDK();
  } catch (err) {
    log.errorAndThrow(`Could not determine iOS SDK version: ${err.message}`);
  }
}

/**
 * Get the generic simulator for a given IOS version and device type (iPhone, iPad)
 *
 * @param {string|number} platformVersion IOS version. e.g.) 13.0
 * @param {string} deviceName Type of IOS device. Can be iPhone, iPad (possibly more in the future)
 *
 * @returns {string} Generic iPhone or iPad simulator (if applicable)
 */
function getGenericSimulatorForIosVersion (platformVersion, deviceName) {
  let genericSimulators = iosGenericSimulators[deviceName];

  if (genericSimulators) {
    genericSimulators = genericSimulators.sort(([simOne], [simTwo]) => util.compareVersions(simOne, '<', simTwo) ? -1 : 1);

    // Find the highest iOS version in the list that is below the provided version
    let genericIosSimulator;
    for (const [platformVersionFromList, iosSimulator] of genericSimulators) {
      if (util.compareVersions(platformVersionFromList, '>', platformVersion)) {
        break;
      }
      genericIosSimulator = iosSimulator;
    }
    return genericIosSimulator;
  }
}

function translateDeviceName (platformVersion, deviceName = '') {
  const deviceNameTranslated = getGenericSimulatorForIosVersion(platformVersion, deviceName.toLowerCase().trim());
  if (deviceNameTranslated) {
    log.debug(`Changing deviceName from '${deviceName}' to '${deviceNameTranslated}'`);
    return deviceNameTranslated;
  }
  return deviceName;
}

// This map contains derived data logs folders as keys
// and values are the count of times the particular
// folder has been scheduled for removal
const derivedDataCleanupMarkers = new Map();

async function markSystemFilesForCleanup (wda) {
  if (!wda || !await wda.retrieveDerivedDataPath()) {
    log.warn('No WebDriverAgent derived data available, so unable to mark system files for cleanup');
    return;
  }

  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
  let markersCount = 0;
  if (derivedDataCleanupMarkers.has(logsRoot)) {
    markersCount = derivedDataCleanupMarkers.get(logsRoot);
  }
  derivedDataCleanupMarkers.set(logsRoot, ++markersCount);
}

async function clearSystemFiles (wda) {
  // only want to clear the system files for the particular WDA xcode run
  if (!wda || !await wda.retrieveDerivedDataPath()) {
    log.warn('No WebDriverAgent derived data available, so unable to clear system files');
    return;
  }

  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
  if (derivedDataCleanupMarkers.has(logsRoot)) {
    let markersCount = derivedDataCleanupMarkers.get(logsRoot);
    derivedDataCleanupMarkers.set(logsRoot, --markersCount);
    if (markersCount > 0) {
      log.info(`Not cleaning '${logsRoot}' folder, because the other session does not expect it to be cleaned`);
      return;
    }
  }
  derivedDataCleanupMarkers.set(logsRoot, 0);

  // Cleaning up big temporary files created by XCTest: https://github.com/appium/appium/issues/9410
  const cleanupCmd = `find -E /private/var/folders ` +
    `-regex '.*/Session-WebDriverAgentRunner.*\\.log$|.*/StandardOutputAndStandardError\\.txt$' ` +
    `-type f -exec sh -c 'echo "" > "{}"' \\;`;
  const cleanupTask = new SubProcess('bash', ['-c', cleanupCmd], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Do not wait for the task to be completed, since it might take a lot of time
  // We keep it running after Appium process is killed
  await cleanupTask.start(0, true);
  log.debug(`Started background XCTest logs cleanup: ${cleanupCmd}`);

  if (await fs.exists(logsRoot)) {
    log.info(`Cleaning test logs in '${logsRoot}' folder`);
    await iosUtils.clearLogs([logsRoot]);
    return;
  }
  log.info(`There is no ${logsRoot} folder, so not cleaning files`);
}

async function checkAppPresent (app) {
  log.debug(`Checking whether app '${app}' is actually present on file system`);
  if (!(await fs.exists(app))) {
    log.errorAndThrow(`Could not find app at '${app}'`);
  }
  log.debug('App is present');
}

async function getDriverInfo () {
  const stat = await fs.stat(path.resolve(__dirname, '..'));
  const built = stat.mtime.getTime();

  // get the package.json and the version from it
  const pkg = require(__filename.includes('build/lib/utils') ? '../../package.json' : '../package.json');
  const version = pkg.version;

  return {
    built,
    version,
  };
}

function normalizeCommandTimeouts (value) {
  // The value is normalized already
  if (typeof value !== 'string') {
    return value;
  }

  let result = {};
  // Use as default timeout for all commands if a single integer value is provided
  if (!isNaN(value)) {
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
    log.errorAndThrow(`"commandTimeouts" capability should be a valid JSON object. "${value}" was given instead`);
  }
  for (let [cmd, timeout] of _.toPairs(result)) {
    if (!_.isInteger(timeout) || timeout <= 0) {
      log.errorAndThrow(`The timeout for "${cmd}" should be a valid natural number of milliseconds. "${timeout}" was given instead`);
    }
  }
  return result;
}

/**
 * @typedef {Object} PidLookupOptions
 *
 * @property {?boolean} multi [false] - Set it to true if multiple matching
 * pids are expected to be found. Only the newest process id is going to
 * be returned instead
 * @property {?boolean} ignoreCase [true] - Set it to false to make the search
 * case-sensitive
 */

/**
 * Get the process id of the most recent running application
 * having the particular command line pattern.
 *
 * @param {string} pattern - pgrep-compatible search pattern.
 * @param {?PidLookupOptions} opts
 * @return {?string|Array<string>} Either a process id or null if no matches were found.
 * An array of strings is going to be returned if `opts.multi` is set to true
 */
async function getPIDsUsingPattern (pattern, opts = {}) {
  const {
    multi = false,
    ignoreCase = true,
  } = opts;
  const args = [`-${ignoreCase ? 'i' : ''}f${multi ? '' : 'n'}`, pattern];
  try {
    const {stdout} = await exec('pgrep', args);
    if (multi) {
      const result = stdout.split('\n')
        .filter((x) => parseInt(x, 10))
        .map((x) => `${parseInt(x, 10)}`);
      return _.isEmpty(result) ? null : result;
    }
    const pid = parseInt(stdout, 10);
    return isNaN(pid) ? null : `${pid}`;
  } catch (err) {
    log.debug(`'pgrep ${args.join(' ')}' didn't detect any matching processes. Return code: ${err.code}`);
    return null;
  }
}

/**
 * Kill a process having the particular command line pattern.
 * This method tries to send SIGINT, SIGTERM and SIGKILL to the
 * matched processes in this order if the process is still running.
 *
 * @param {string} pgrepPattern - pgrep-compatible search pattern.
 */
async function killAppUsingPattern (pgrepPattern) {
  for (const signal of [2, 15, 9]) {
    if (!await getPIDsUsingPattern(pgrepPattern)) {
      return;
    }
    const args = [`-${signal}`, '-if', pgrepPattern];
    try {
      await exec('pkill', args);
    } catch (err) {
      log.debug(`pkill ${args.join(' ')} -> ${err.message}`);
    }
    await B.delay(100);
  }
}

/**
 * Kills running XCTest processes for the particular device.
 *
 * @param {string} udid - The device UDID.
 * @param {boolean} isSimulator - Equals to true if the current device is a Simulator
 */
async function resetXCTestProcesses (udid, isSimulator) {
  const processPatterns = [`xcodebuild.*${udid}`];
  if (isSimulator) {
    processPatterns.push(`${udid}.*XCTRunner`);
  }
  log.debug(`Killing running processes '${processPatterns.join(', ')}' for the device ${udid}...`);
  for (const pgrepPattern of processPatterns) {
    await killAppUsingPattern(pgrepPattern);
  }
}

async function printUser () {
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
 * @returns {Array<string>} - the list of matched process ids.
 */
async function getPIDsListeningOnPort (port, filteringFunc = null) {
  const result = [];
  try {
    // This only works since Mac OS X El Capitan
    const {stdout} = await exec('lsof', ['-ti', `tcp:${port}`]);
    result.push(...(stdout.trim().split(/\n+/)));
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
 * @property {?string} user - The name of the user for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} pass - The password for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} method - The http multipart upload method name. The 'PUT' one is used by default.
 *                              Only works if `remotePath` is provided.
 */


/**
 * Encodes the given local file to base64 and returns the resulting string
 * or uploads it to a remote server using http/https or ftp protocols
 * if `remotePath` is set
 *
 * @param {string} localFile - The path to an existing local file
 * @param {?string} remotePath - The path to the remote location, where
 *                               this file should be uploaded
 * @param {?UploadOptions} uploadOptions - Set of upload options
 * @returns {string} Either an empty string if the upload was successful or
 * base64-encoded file representation if `remotePath` is falsy
 */
async function encodeBase64OrUpload (localFile, remotePath = null, uploadOptions = {}) {
  if (!await fs.exists(localFile)) {
    log.errorAndThrow(`The file at '${localFile}' does not exist or is not accessible`);
  }

  const {size} = await fs.stat(localFile);
  log.debug(`The size of the file is ${util.toReadableSizeString(size)}`);
  if (_.isEmpty(remotePath)) {
    const maxMemoryLimit = v8.getHeapStatistics().total_available_size / 2;
    if (size >= maxMemoryLimit) {
      log.info(`The file might be too large to fit into the process memory ` +
        `(${util.toReadableSizeString(size)} >= ${util.toReadableSizeString(maxMemoryLimit)}). ` +
        `Provide a link to a remote writable location for video upload ` +
        `(http(s) and ftp protocols are supported) if you experience Out Of Memory errors`);
    }
    const content = await fs.readFile(localFile);
    return content.toString('base64');
  }

  const remoteUrl = url.parse(remotePath);
  let options = {};
  const {user, pass, method} = uploadOptions;
  if (remoteUrl.protocol.startsWith('http')) {
    options = {
      url: remoteUrl.href,
      method: method || 'PUT',
      multipart: [{ body: _fs.createReadStream(localFile) }],
    };
    if (user && pass) {
      options.auth = {user, pass};
    }
  } else if (remoteUrl.protocol === 'ftp:') {
    options = {
      host: remoteUrl.hostname,
      port: remoteUrl.port || 21,
    };
    if (user && pass) {
      options.user = user;
      options.pass = pass;
    }
  }
  await net.uploadFile(localFile, remotePath, options);
  return '';
}

/**
 * Stops and removes all web socket handlers that are listening
 * in scope of the currect session.
 *
 * @param {Object} server - The instance of NodeJs HTTP server,
 * which hosts Appium
 * @param {string} sessionId - The id of the current session
 */
async function removeAllSessionWebSocketHandlers (server, sessionId) {
  if (!server || !_.isFunction(server.getWebSocketHandlers)) {
    return;
  }

  const activeHandlers = await server.getWebSocketHandlers(sessionId);
  for (const pathname of _.keys(activeHandlers)) {
    await server.removeWebSocketHandler(pathname);
  }
}

/**
 * Verify whether the given application is compatible to the
 * platform where it is going to be installed and tested.
 *
 * @param {string} app - The actual path to the application bundle
 * @param {boolean} isSimulator - Should be set to `true` if the test will be executed on Simulator
 * @returns {?boolean} The function returns `null` if the application does not exist or there is no
 * `CFBundleSupportedPlatforms` key in its Info.plist manifest.
 * `true` is returned if the bundle architecture matches the device architecture.
 * @throws {Error} If bundle architecture does not match the device architecture.
 */
async function verifyApplicationPlatform (app, isSimulator, isTvOS) {
  log.debug('Verifying application platform');

  const infoPlist = path.resolve(app, 'Info.plist');
  if (!await fs.exists(infoPlist)) {
    log.debug(`'${infoPlist}' does not exist`);
    return null;
  }

  const {CFBundleSupportedPlatforms} = await plist.parsePlistFile(infoPlist);
  log.debug(`CFBundleSupportedPlatforms: ${JSON.stringify(CFBundleSupportedPlatforms)}`);
  if (!_.isArray(CFBundleSupportedPlatforms)) {
    log.debug(`CFBundleSupportedPlatforms key does not exist in '${infoPlist}'`);
    return null;
  }

  const expectedPlatform = isSimulator
    ? isTvOS ? 'AppleTVSimulator' : 'iPhoneSimulator'
    : isTvOS ? 'AppleTVOS' : 'iPhoneOS';

  const isAppSupported = CFBundleSupportedPlatforms.includes(expectedPlatform);
  if (isAppSupported) {
    return true;
  }
  throw new Error(`${isSimulator ? 'Simulator' : 'Real device'} architecture is unsupported by the '${app}' application. ` +
                  `Make sure the correct deployment target has been selected for its compilation in Xcode.`);
}

/**
 * Return true if the platformName is tvOS
 * @param {string} platformName The name of the platorm
 * @returns {boolean} Return true if the platformName is tvOS
 */
function isTvOS (platformName) {
  return _.toLower(platformName) === _.toLower(PLATFORM_NAME_TVOS);
}

/**
 * Returns true if the urlString is localhost
 * @param {?string} urlString
 * @returns {boolean} Return true if the urlString is localhost
 */
function isLocalHost (urlString) {
  try {
    const {hostname} = url.parse(urlString);
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
function normalizePlatformVersion (originalVersion) {
  const normalizedVersion = util.coerceVersion(originalVersion, false);
  if (!normalizedVersion) {
    throw new Error(`The platform version '${originalVersion}' should be a valid version number`);
  }
  const {major, minor} = new semver.SemVer(normalizedVersion);
  return `${major}.${minor}`;
}

export { detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion,
  checkAppPresent, getDriverInfo,
  clearSystemFiles, translateDeviceName, normalizeCommandTimeouts,
  DEFAULT_TIMEOUT_KEY, resetXCTestProcesses, getPIDsUsingPattern,
  markSystemFilesForCleanup, printUser,
  getPIDsListeningOnPort, encodeBase64OrUpload, removeAllSessionWebSocketHandlers,
  verifyApplicationPlatform, isTvOS, isLocalHost, normalizePlatformVersion };
