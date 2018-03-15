import _ from 'lodash';
import path from 'path';
import { fs, tempDir } from 'appium-support';
import { SubProcess, exec } from 'teen_process';
import log from '../logger';
import { encodeBase64OrUpload } from '../utils';
import { waitForCondition } from 'asyncbox';


let commands = {};

const RECORDERS_CACHE = {};
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const STOP_TIMEOUT_MS = 3 * 60 * 1000;
const START_TIMEOUT_MS = 15 * 1000;
const DEFAULT_PROFILE_NAME= 'Activity Monitor';
const DEFAULT_EXT = '.trace';


async function finishPerfRecord (proc, stopGracefully = true) {
  if (!proc.isRunning) {
    return;
  }
  if (stopGracefully) {
    log.debug(`Sending SIGINT to the running instruments process`);
    return await proc.stop('SIGINT', STOP_TIMEOUT_MS);
  }
  log.debug(`Sending SIGTERM to the running instruments process`);
  await proc.stop();
}

async function uploadTrace (localFile, remotePath = null, uploadOptions = {}) {
  try {
    return await encodeBase64OrUpload(localFile, remotePath, uploadOptions);
  } finally {
    await fs.rimraf(localFile);
  }
}


/**
 * @typedef {Object} StartPerfRecordOptions
 *
 * @property {?number|string} timeout [300000] - The maximum count of milliseconds to record the profiling information.
 * @property {?string} profileName [Activity Monitor] - The name of existing performance profile to apply.
 *                                                      Execute `instruments -s` to show the list of available profiles.
 *                                                      Note, that not all profiles are supported on mobile devices.
 * @property {?string|number} pid - The ID of the process to meassure the performance for.
 *                                  Set it to `current` in order to meassure the performance of
 *                                  the process, which belongs to the currently active application.
 *                                  All processes running on the device are meassured if
 *                                  pid is unset (the default setting).
 */

/**
 * Starts performance profiling for the device under test.
 * The `instruments` developer utility is used for this purpose under the hood.
 * It is possible to record multiple profiles at the same time.
 * Read https://developer.apple.com/library/content/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/Recording,Pausing,andStoppingTraces.html
 * for more details.
 *
 * @param {?StartPerfRecordOptions} opts - The set of possible start record options
 */
commands.mobileStartPerfRecord = async function (opts = {}) {
  if (!this.relaxedSecurityEnabled && !process.env.CI && !this.isRealDevice()) {
    log.errorAndThrow(`Appium server must have relaxed security flag set in order ` +
                      `for Simulator performance measurement to work`);
  }

  const {timeout=DEFAULT_TIMEOUT_MS, profileName=DEFAULT_PROFILE_NAME, pid} = opts;

  // Cleanup the process if it is already running
  const runningRecorders = RECORDERS_CACHE[profileName];
  if (_.isPlainObject(runningRecorders) && runningRecorders[this.opts.device.udid]) {
    const {proc, localPath} = runningRecorders[this.opts.device.udid];
    await finishPerfRecord(proc, false);
    if (await fs.exists(localPath)) {
      await fs.rimraf(localPath);
    }
    delete runningRecorders[this.opts.device.udid];
  }

  if (!await fs.which('instruments')) {
    log.errorAndThrow(`Cannot start performance recording, because 'instruments' ` +
                      `tool cannot be found in PATH. Are Xcode development tools installed?`);
  }

  const localPath = await tempDir.path({
    prefix: `appium_perf_${profileName}_${Date.now()}`.replace(/\W/g, '_'),
    suffix: DEFAULT_EXT,
  });
  const args = [
    '-w', this.opts.device.udid,
    '-t', profileName,
    '-D', localPath,
    '-l', timeout,
  ];
  if (pid) {
    if (`${pid}`.toLowerCase() === 'current') {
      const appInfo = await this.proxyCommand('/wda/activeAppInfo', 'GET');
      args.push('-p', appInfo.pid);
    } else {
      args.push('-p', pid);
    }
  }
  const proc = new SubProcess('instruments', args);
  log.info(`Starting 'instruments' with arguments: ${args.join(' ')}`);
  proc.on('exit', (code) => {
    const msg = `instruments exited with code '${code}'`;
    if (code) {
      log.warn(msg);
    } else {
      log.debug(msg);
    }
  });
  proc.on('output', (stdout, stderr) => {
    (stdout || stderr).split('\n')
      .filter(x => x.length)
      .map(x => log.debug(`[instruments] ${x}`));
  });

  await proc.start(0);
  try {
    await waitForCondition(async () => await fs.exists(localPath), {
      waitMs: START_TIMEOUT_MS,
      intervalMs: 500,
    });
  } catch (err) {
    try {
      await proc.stop('SIGKILL');
    } catch (ign) {}
    log.errorAndThrow(`Cannot start performance monitoring for '${profileName}' profile in ${START_TIMEOUT_MS}ms. ` +
                      `Make sure you can execute it manually.`);
  }
  RECORDERS_CACHE[profileName] = Object.assign({}, (RECORDERS_CACHE[profileName] || {}), {
    [this.opts.device.udid]: {proc, localPath},
  });
};

/**
 * @typedef {Object} StopRecordingOptions
 *
 * @property {?string} remotePath - The path to the remote location, where the resulting zipped .trace file should be uploaded.
 *                                  The following protocols are supported: http/https, ftp.
 *                                  Null or empty string value (the default setting) means the content of resulting
 *                                  file should be zipped, encoded as Base64 and passed as the endpount response value.
 *                                  An exception will be thrown if the generated file is too big to
 *                                  fit into the available process memory.
 * @property {?string} user - The name of the user for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} pass - The password for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} method [PUT] - The http multipart upload method name. Only works if `remotePath` is provided.
 * @property {?string} profileName [Activity Monitor] - The name of an existing performance profile for which the recording has been made.
 */

/**
 * Stops performance profiling for the device under test.
 * The resulting file in .trace format can be either returned
 * directly as base64-encoded zip archive or uploaded to a remote location
 * (such files can be pretty large). Afterwards it is possible to unarchive and
 * open such file with Xcode Dev Tools.
 *
 * @param {?StopRecordingOptions} opts - The set of possible stop record options
 * @return {string} Either an empty string if the upload wqaas successful or base-64 encoded
 * content of zipped .trace file.
 * @throws {Error} If no performance recording with given profile name/device udid combination
 * has been started before or the resulting .trace file has not been generated properly.
 */
commands.mobileStopPerfRecord = async function (opts = {}) {
  if (!this.relaxedSecurityEnabled && !process.env.CI && !this.isRealDevice()) {
    log.errorAndThrow(`Appium server must have relaxed security flag set in order ` +
                      `for Simulator performance measurement to work`);
  }

  const {remotePath, user, pass, method, profileName=DEFAULT_PROFILE_NAME} = opts;
  const runningRecorders = RECORDERS_CACHE[profileName];
  if (!_.isPlainObject(runningRecorders) || !runningRecorders[this.opts.device.udid]) {
    log.errorAndThrow(`There are no records for performance profile '${profileName}' ` +
                      `and device ${this.opts.device.udid}. ` +
                      `Have you started the profiling before?`);
  }

  const {proc, localPath} = runningRecorders[this.opts.device.udid];
  await finishPerfRecord(proc, true);
  if (!await fs.exists(localPath)) {
    log.errorAndThrow(`There is no .trace file found for performance profile '${profileName}' ` +
                      `and device ${this.opts.device.udid}. ` +
                      `Make sure the profile is supported on this device. ` +
                      `You can use 'instruments -s' command to see the list of all available profiles.`);
  }

  const zipPath = `${localPath}.zip`;
  const zipArgs = [
    '-9', '-r', zipPath,
    path.basename(localPath),
  ];
  log.info(`Found perf trace record '${localPath}'. Compressing it with 'zip ${zipArgs.join(' ')}'`);
  try {
    await exec('zip', zipArgs, {
      cwd: path.dirname(localPath),
    });
    return await uploadTrace(zipPath, remotePath, {user, pass, method});
  } finally {
    delete runningRecorders[this.opts.device.udid];
    if (await fs.exists(localPath)) {
      await fs.rimraf(localPath);
    }
  }
};


export { commands };
export default commands;
