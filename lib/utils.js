import B from 'bluebird';
import { fs } from 'appium-support';
import path from 'path';
import { utils as iosUtils } from 'appium-ios-driver';
import { exec } from 'teen_process';
import xcode from 'appium-xcode';
import _ from 'lodash';
import log from './logger';
import pkgObj from '../../package.json'; // eslint-disable-line import/no-unresolved


const DRIVER_VER = pkgObj.version;
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

async function translateDeviceName (pv, dn = '') {
  let deviceName = dn;
  if (dn.toLowerCase() === 'iphone simulator') {
    deviceName = 'iPhone 6';
  } else if (dn.toLowerCase() === 'ipad simulator') {
    if (parseFloat(pv).toFixed(1) < "10.3") {
      deviceName = 'iPad Retina';
    } else {
      /* iPad Retina is no longer available for ios 10.3
      so we pick another iPad to use as default */
      deviceName = 'iPad Air';
    }
  }
  if (deviceName !== dn) {
    log.debug(`Changing deviceName from '${dn}' to '${deviceName}'`);
  }
  return deviceName;
}

async function adjustWDAAttachmentsPermissions (wda, perms) {
  if (!wda || !await wda.retrieveDerivedDataPath()) {
    log.warn('No WebDriverAgent derived data available, so unable to set permissions on WDA attachments folder');
    return;
  }
  const attachmentsFolder = path.join(await wda.retrieveDerivedDataPath(), 'Logs/Test/Attachments');
  if (await fs.exists(attachmentsFolder)) {
    log.info(`Setting '${perms}' permissions to '${attachmentsFolder}' folder`);
    return await fs.chmod(attachmentsFolder, perms);
  }
  log.info(`There is no ${attachmentsFolder} folder, so not changing permissions`);
}

async function clearSystemFiles (wda) {
  // only want to clear the system files for the particular WDA xcode run
  if (!wda || !await wda.retrieveDerivedDataPath()) {
    log.warn('No WebDriverAgent derived data available, so unable to clear system files');
    return;
  }
  const logsRoot = path.resolve(await wda.retrieveDerivedDataPath(), 'Logs');
  if (await fs.exists(logsRoot)) {
    log.info(`Cleaning test logs in '${logsRoot}' folder`);
    return await iosUtils.clearLogs([logsRoot]);
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
  let info = {
    built,
    version: DRIVER_VER,
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
    processPatterns.push(`iproxy ${opts.wdaLocalPort} `);
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

export { detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion,
         adjustWDAAttachmentsPermissions, checkAppPresent, getDriverInfo,
         clearSystemFiles, translateDeviceName, normalizeCommandTimeouts,
         DEFAULT_TIMEOUT_KEY, resetXCTestProcesses, getPidUsingPattern };
