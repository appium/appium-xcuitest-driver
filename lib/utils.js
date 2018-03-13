import B from 'bluebird';
import { fs, util, net } from 'appium-support';
import path from 'path';
import { utils as iosUtils } from 'appium-ios-driver';
import { SubProcess, exec } from 'teen_process';
import xcode from 'appium-xcode';
import _ from 'lodash';
import log from './logger';
import _fs from 'fs';
import url from 'url';

const DEFAULT_TIMEOUT_KEY = 'default';


async function detectUdid () {
  log.debug('Auto-detecting real device udid...');
  let  cmd, args = [];
  try {
    cmd = await fs.which('idevice_id');
    args.push('-l');
    log.debug('Using idevice_id');
  } catch (err) {
    log.debug('Using udidetect');
    cmd = require.resolve('udidetect');
  }
  let udid;
  try {
    let {stdout} = await exec(cmd, args, {timeout: 3000});
    let udids = _.filter(stdout.split('\n'), Boolean);
    udid = _.last(udids);
    if (udids.length > 1) {
      log.warn(`Multiple devices found: ${udids.join(', ')}`);
      log.warn(`Choosing '${udid}'. If this is wrong, manually set with 'udid' desired capability`);
    }
  } catch (err) {
    log.errorAndThrow(`Error detecting udid: ${err.message}`);
  }
  if (!udid || udid.length <= 2) {
    throw new Error('Could not detect udid.');
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

  if (!version.toolsVersion) {
    try {
      version.toolsVersion = await xcode.getCommandLineToolsVersion();
    } catch (ign) {}
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
  let versionNumber;
  try {
    versionNumber = await xcode.getMaxIOSSDK();
  } catch (err) {
    log.errorAndThrow(`Could not determine iOS SDK version: ${err.message}`);
  }
  return versionNumber;
}

async function translateDeviceName (xcodeVersion, platformVersion, devName = '') {
  let deviceName = devName;
  switch (devName.toLowerCase().trim()) {
    case 'iphone simulator':
      deviceName = 'iPhone 6';
      break;
    case 'ipad simulator':
      // no need to worry about floating point comparison because of the
      //   nature of the numbers being compared
      // iPad Retina is no longer available for ios 10.3
      //   so we pick another iPad to use as default
      deviceName = (parseFloat(platformVersion) < 10.3) ? 'iPad Retina' : 'iPad Air';
      break;
    case 'iphone 8':
    case 'iphone 8 plus':
    case 'iphone x':
      // Xcode 9.0(.0) mis-named the new devices
      if (xcodeVersion.major === 9 &&
          xcodeVersion.minor === 0 &&
          (!util.hasValue(xcodeVersion.patch) || xcodeVersion.patch === 0)) {
        const namesMapping = {
          'iphone 8': 'iPhone2017-A',
          'iphone 8 plus': 'iPhone2017-B',
          'iphone x': 'iPhone2017-C'
        };
        deviceName = namesMapping[devName.toLowerCase().trim()];
      }
      break;
  }

  if (deviceName !== devName) {
    log.debug(`Changing deviceName from '${devName}' to '${deviceName}'`);
  }
  return deviceName;
}

// This map contains derived data attachment folders as keys
// and values are stacks of permssion masks
// It is used to synchronize permissions change
// on shared folders
const derivedDataPermissionsStacks = new Map();

async function adjustWDAAttachmentsPermissions (wda, perms) {
  if (!wda || !await wda.retrieveDerivedDataPath()) {
    log.warn('No WebDriverAgent derived data available, so unable to set permissions on WDA attachments folder');
    return;
  }

  const attachmentsFolder = path.join(await wda.retrieveDerivedDataPath(), 'Logs/Test/Attachments');
  const permsStack = derivedDataPermissionsStacks.get(attachmentsFolder) || [];
  if (permsStack.length) {
    if (_.last(permsStack) === perms) {
      permsStack.push(perms);
      log.info(`Not changing permissions of '${attachmentsFolder}' to '${perms}', because they were already set by the other session`);
      return;
    }
    if (permsStack.length > 1) {
      permsStack.pop();
      log.info(`Not changing permissions of '${attachmentsFolder}' to '${perms}', because the other session does not expect them to be changed`);
      return;
    }
  }
  derivedDataPermissionsStacks.set(attachmentsFolder, [perms]);

  if (await fs.exists(attachmentsFolder)) {
    log.info(`Setting '${perms}' permissions to '${attachmentsFolder}' folder`);
    await fs.chmod(attachmentsFolder, perms);
    return;
  }
  log.info(`There is no ${attachmentsFolder} folder, so not changing permissions`);
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
  await cleanupTask.start(0);
  // Do not wait for the task to be completed, since it might take a lot of time
  // We keep it running after Appium process is killed
  cleanupTask.proc.unref();
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
  let stat = await fs.stat(path.resolve(__dirname, '..'));
  let built = stat.mtime.getTime();

  // get the package.json and the version from it
  let pkg = require(__filename.indexOf('build/lib/utils') !== -1 ? '../../package.json' : '../package.json');
  let version = pkg.version;

  let info = {
    built,
    version,
  };
  return info;
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
 * Get the process id of the most recent running application
 * having the particular command line pattern.
 *
 * @param {string} pgrepPattern - pgrep-compatible search pattern.
 * @return {string} Either a process id or null if no matches were found.
 */
async function getPidUsingPattern (pgrepPattern) {
  const args = ['-nif', pgrepPattern];
  try {
    const {stdout} = await exec('pgrep', args);
    const pid = parseInt(stdout, 10);
    if (isNaN(pid)) {
      log.debug(`Cannot parse process id from 'pgrep ${args.join(' ')}' output: ${stdout}`);
      return null;
    }
    return `${pid}`;
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
    if (!await getPidUsingPattern(pgrepPattern)) {
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
 * @param {object} opts - Additional options mapping. Possible keys are:
 *   - {string|number} wdaLocalPort: The number of local port WDA is listening on.
 */
async function resetXCTestProcesses (udid, isSimulator, opts = {}) {
  const processPatterns = [`xcodebuild.*${udid}`];
  if (opts.wdaLocalPort) {
    processPatterns.push(`iproxy ${opts.wdaLocalPort}`);
  } else if (!isSimulator) {
    processPatterns.push(`iproxy.*${udid}`);
  }
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

async function printLibimobiledeviceInfo () {
  try {
    let {stdout} = await exec('brew', ['info', 'libimobiledevice']);
    let match = /libimobiledevice:(.+)/.exec(stdout);
    if (match && match[1]) {
      log.debug(`Current version of libimobiledevice: ${match[1].trim()}`);
    }
  } catch (err) {
    log.debug(`Unable to get version of libimobiledevice: ${err.message}`);
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
 * @throws {Error} If there was upload failure or the file content is too big
 * to fit in the available process memory.
 */
async function encodeBase64OrUpload (localFile, remotePath = null, uploadOptions = {}) {
  if (!await fs.exists(localFile)) {
    log.errorAndThrow(`The file at '${localFile}' does not exist or is not accessible`);
  }

  const {size} = await fs.stat(localFile);
  log.debug(`The size of the file is ${util.toReadableSizeString(size)}`);
  if (_.isEmpty(remotePath)) {
    const memoryUsage = process.memoryUsage();
    const maxMemoryLimit = (memoryUsage.heapTotal - memoryUsage.heapUsed) / 2;
    if (size >= maxMemoryLimit) {
      throw new Error(`Cannot read '${localFile}' to the memory, because the file is too large ` +
                      `(${util.toReadableSizeString(size)} >= ${util.toReadableSizeString(maxMemoryLimit)}). ` +
                      `Try to provide a link to a remote writable location instead.`);
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

export { detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion,
         adjustWDAAttachmentsPermissions, checkAppPresent, getDriverInfo,
         clearSystemFiles, translateDeviceName, normalizeCommandTimeouts,
         DEFAULT_TIMEOUT_KEY, resetXCTestProcesses, getPidUsingPattern,
         markSystemFilesForCleanup, printUser, printLibimobiledeviceInfo,
         getPIDsListeningOnPort, encodeBase64OrUpload };
