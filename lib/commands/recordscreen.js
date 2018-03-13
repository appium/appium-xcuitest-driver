import _ from 'lodash';
import { retryInterval, waitForCondition } from 'asyncbox';
import B from 'bluebird';
import { util, fs, tempDir } from 'appium-support';
import { exec } from 'teen_process';
import log from '../logger';
import { getPidUsingPattern, encodeBase64OrUpload } from '../utils';


let commands = {};

const RETRY_PAUSE = 1000;
const MAX_RECORDING_TIME_SEC = 60 * 10;
const DEFAULT_RECORDING_TIME_SEC = 60 * 3;
const PROCESS_SHUTDOWN_TIMEOUT_SEC = 5;
const REAL_DEVICE_BINARY = 'xrecord';
const REAL_DEVICE_PGREP_PATTERN = (udid) => `${REAL_DEVICE_BINARY}.*${udid}`;
const SIMULATOR_BINARY = 'xcrun';
const SIMULATOR_PGREP_PATTERN = (udid) => `simctl io ${udid} recordVideo`;
const DEFAULT_EXT = '.mp4';

async function extractCurrentRecordingPath (pid) {
  const {output} = await exec('ps', ['o', 'command', '-p', pid]);
  log.debug(`Got the following output from ps: ${output}`);
  const pattern = new RegExp(/[\s="'](\/.*\.mp4)/);
  const matches = pattern.exec(output);
  return _.isEmpty(matches) ? null : _.last(matches);
}

async function finishScreenCapture (pid) {
  try {
    await exec('kill', ['-2', pid]);
  } catch (e) {
    return true;
  }
  try {
    await waitForCondition(async () => {
      try {
        await exec('kill', ['-0', pid]);
      } catch (ign) {
        return true;
      }
      return false;
    }, {waitMs: PROCESS_SHUTDOWN_TIMEOUT_SEC * 1000, intervalMs: 300});
  } catch (e) {
    return false;
  }
  return true;
}

async function uploadRecordedMedia (localFile, remotePath = null, uploadOptions = {}) {
  try {
    return await encodeBase64OrUpload(localFile, remotePath, uploadOptions);
  } finally {
    await fs.rimraf(localFile);
  }
}

/**
 * @typedef {Object} StartRecordingOptions
 *
 * @property {?string} remotePath - The path to the remote location, where the resulting video should be uploaded.
 *                                  The following protocols are supported: http/https, ftp.
 *                                  Null or empty string value (the default setting) means the content of resulting
 *                                  file should be encoded as Base64 and passed as the endpount response value.
 *                                  An exception will be thrown if the generated media file is too big to
 *                                  fit into the available process memory.
 *                                  This option only has an effect if there is screen recording process in progreess
 *                                  and `forceRestart` parameter is not set to `true`.
 * @property {?string} user - The name of the user for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} pass - The password for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} method - The http multipart upload method name. The 'PUT' one is used by default.
 *                              Only works if `remotePath` is provided.
 * @property {?string} videoType - The format of the screen capture to be recorded.
 *                                 Available formats: "h264", "mp4" or "fmp4". Default is "mp4".
 *                                 Only works for Simulator.
 * @property {?string} videoQuality - The video encoding quality (low, medium, high, photo - defaults to medium).
 *                                    Only works for real devices.
 * @property {?boolean} forceRestart - Whether to try to catch and upload/return the currently running screen recording
 *                                     (`false`, the default setting) or ignore the result of it and start a new recording
 *                                     immediately.
 * @property {?string|number} timeLimit - The maximum recording time, in seconds.
 *                                        The default value is 180, the maximum value is 600 (10 minutes).
 */

/**
 * Record the display of devices running iOS Simulator since Xcode 8.3 or real devices since iOS 8
 * (xrecord utility is required: https://github.com/WPO-Foundation/xrecord).
 * It records screen activity to an MPEG-4 file. Audio is not recorded with the video file.
 * If screen recording has been already started then the command will stop it forcefully and start a new one.
 * The previously recorded video file will be deleted.
 *
 * @param {?StartRecordingOptions} options - The available options.
 * @returns {string} Base64-encoded content of the recorded media file if
 *                   any screen recording is currently running or an empty string.
 * @throws {Error} If screen recording has failed to start.
 */
commands.startRecordingScreen = async function (options = {}) {
  const {videoType, timeLimit=DEFAULT_RECORDING_TIME_SEC, videoQuality='medium',
    forceRestart} = options;

  let result = '';
  if (!forceRestart) {
    log.info(`Checking if there is/was a previous screen recording. ` +
             `Set 'forceRestart' option to 'true' if you'd like to skip this step.`);
    result = await this.stopRecordingScreen(options);
  }

  const pgrepPattern = this.isRealDevice() ? REAL_DEVICE_PGREP_PATTERN : SIMULATOR_PGREP_PATTERN;
  const pid = await getPidUsingPattern(pgrepPattern(this.opts.device.udid));
  if (!_.isEmpty(pid)) {
    try {
      await exec('kill', [pid]);
    } catch (err) {
      log.errorAndThrow(`Unable to stop screen recording process: ${err.message}`);
    }
  }
  if (!_.isEmpty(this._recentScreenRecordingPath)) {
    await fs.rimraf(this._recentScreenRecordingPath);
    this._recentScreenRecordingPath = null;
  }

  const localPath = await tempDir.path({
    prefix: `appium_${Math.random().toString(16).substring(2, 8)}`,
    suffix: DEFAULT_EXT
  });

  let binaryName;
  let args;
  if (this.isRealDevice()) {
    binaryName = REAL_DEVICE_BINARY;
    if (!await fs.which(binaryName)) {
      log.errorAndThrow(`'${binaryName}' binary is not found in PATH. Make sure it is present on the system. ` +
                        `Check https://github.com/WPO-Foundation/xrecord for more details.`);
    }
    args = [
      '--quicktime',
      '--id', this.opts.device.udid,
      '--out', localPath,
      `--force`
    ];
    if (util.hasValue(timeLimit)) {
      args.push('--time', `${timeLimit}`);
    }
    if (util.hasValue(videoQuality)) {
      args.push('--quality', `${videoQuality}`);
    }
  } else {
    binaryName = SIMULATOR_BINARY;
    args = [
      'simctl',
      'io',
      this.opts.device.udid,
      'recordVideo'
    ];
    if (util.hasValue(videoType)) {
      args.push('--type', videoType);
    }
    args.push(localPath);
  }

  // wrap in a manual Promise so we can handle errors in exec operation
  return await new B(async (resolve, reject) => {
    let err = null;
    let timeout = Math.floor(parseFloat(timeLimit) * 1000);
    if (timeout > MAX_RECORDING_TIME_SEC * 1000 || timeout <= 0) {
      return reject(new Error(`The timeLimit value must be in range (0, ${MAX_RECORDING_TIME_SEC}] seconds. ` +
                              `The value of ${timeLimit} has been passed instead.`));
    }
    log.debug(`Beginning screen recording with command: '${binaryName} ${args.join(' ')}'` +
              `Will timeout in ${timeout / 1000} s`);
    if (this.isRealDevice()) {
      // xrecord has its owen timer, so we only use this one as a safety precaution
      // although simctl has no built-in timer and we have to be precise in such case
      timeout += PROCESS_SHUTDOWN_TIMEOUT_SEC * 1000 * 2;
    }
    // do not await here, as the call runs in the background and we check for its product
    exec(binaryName, args, {timeout, killSignal: 'SIGINT'}).catch((e) => {
      err = e;
    });

    // there is the delay time to start recording the screen for real devices, so, wait until it is ready.
    // the ready condition is
    //   1. check the movie file is created
    //   2. check the screen capture has been started
    //
    // simctl keeps the file in an internal buffer instead and only creates it when the recording is done.
    if (this.isRealDevice()) {
      try {
        await retryInterval(10, RETRY_PAUSE, async () => {
          if (err) {
            return;
          }

          const {size} = await fs.stat(localPath);
          if (size <= 32) {
            throw new Error(`Remote file '${localPath}' found but it is still too small: ${size} bytes`);
          }
        });
      } catch (e) {
        err = e;
      }
    }

    if (err) {
      log.error(`Error recording screen: ${err.message}`);
      return reject(err);
    }
    this._recentScreenRecordingPath = localPath;
    resolve(result);
  });
};

/**
 * @typedef {Object} StopRecordingOptions
 *
 * @property {?string} remotePath - The path to the remote location, where the resulting video should be uploaded.
 *                                  The following protocols are supported: http/https, ftp.
 *                                  Null or empty string value (the default setting) means the content of resulting
 *                                  file should be encoded as Base64 and passed as the endpount response value.
 *                                  An exception will be thrown if the generated media file is too big to
 *                                  fit into the available process memory.
 * @property {?string} user - The name of the user for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} pass - The password for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} method - The http multipart upload method name. The 'PUT' one is used by default.
 *                              Only works if `remotePath` is provided.
 */

/**
 * Stop recording the screen. If no screen recording process is running then
 * the endpoint will try to get the recently recorded file.
 * If no previously recorded file is found and no active screen recording
 * processes are running then the method returns an empty string.
 *
 * @param {?StopRecordingOptions} options - The available options.
 * @returns {string} Base64-encoded content of the recorded media file if 'remotePath'
 *                   parameter is empty or null or an empty string.
 * @throws {Error} If there was an error while getting the name of a media file
 *                 or the file content cannot be uploaded to the remote location.
 */
commands.stopRecordingScreen = async function (options = {}) {
  const {remotePath, user, pass, method} = options;

  const pgrepPattern = this.isRealDevice() ? REAL_DEVICE_PGREP_PATTERN : SIMULATOR_PGREP_PATTERN;
  const pid = await getPidUsingPattern(pgrepPattern(this.opts.device.udid));
  let localPath = this._recentScreenRecordingPath;
  if (_.isEmpty(pid)) {
    log.info(`Screen recording is not running. There is nothing to stop.`);
  } else {
    localPath = localPath || await extractCurrentRecordingPath(pid);
    try {
      if (_.isEmpty(localPath)) {
        log.errorAndThrow(`Cannot parse the path to the file created by ` +
                          `screen recorder process from 'ps' output. ` +
                          `Did you start screen recording before?`);
      }
    } finally {
      if (!await finishScreenCapture(pid)) {
        log.warn(`Unable to stop screen recording. Continuing anyway`);
      }
    }
  }

  let result = '';
  if (!_.isEmpty(localPath)) {
    try {
      result = await uploadRecordedMedia(localPath, remotePath, {user, pass, method});
    } finally {
      this._recentScreenRecordingPath = null;
    }
  }
  return result;
};


export { commands };
export default commands;
