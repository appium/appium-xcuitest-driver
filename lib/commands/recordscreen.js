import _ from 'lodash';
import _fs from 'fs';
import url from 'url';
import { retryInterval } from 'asyncbox';
import B from 'bluebird';
import { util, fs} from 'appium-support';
import { exec } from 'teen_process';
import log from '../logger';
import temp from 'temp';
import request from 'request-promise';
import Ftp from 'jsftp';
import { getPidUsingPattern } from '../utils';


let commands = {};

const RETRY_PAUSE = 1000;
const MAX_RECORDING_TIME_SEC = 60 * 10;
const SCREENRECORD_PGREP_PATTERN = (udid) => `simctl io ${udid}.*recordVideo`;
const DEFAULT_EXT = '.mp4';

async function extractCurrentRecordingPath (pid) {
  const {output} = await exec('ps', ['o', 'command', '-p', pid]);
  log.debug(`Got the following output from ps: ${output}`);
  const pattern = new RegExp(/recordVideo\s+(\/.*\.mp4)/);
  const matches = pattern.exec(output);
  return _.isEmpty(matches) ? null : _.last(matches);
}

async function uploadMediaToHttp (localFileStream, remoteUrl, uploadOptions = {}) {
  const {user, pass, method} = uploadOptions;
  const options = {
    url: remoteUrl.href,
    method: method || 'PUT',
    multipart: [{ body: localFileStream }],
  };
  if (user && pass) {
    options.auth = {user, pass};
  }
  log.debug(`Http upload options: ${JSON.stringify(options)}`);

  const response = await request(options);
  const responseDebugMsg = `Response code: ${response.statusCode}. Response body: ${JSON.stringify(response.body)}`;
  log.debug(responseDebugMsg);
  if (response.statusCode >= 400) {
    throw new Error(`Cannot upload the recorded media to '${remoteUrl.href}'. ${responseDebugMsg}`);
  }
}

async function uploadMediaToFtp (localFileStream, remoteUrl, uploadOptions = {}) {
  const {user, pass} = uploadOptions;
  const options = {
    host: remoteUrl.hostname,
    port: remoteUrl.port || 21,
  };
  if (user && pass) {
    options.user = user;
    options.pass = pass;
  }
  log.debug(`FTP upload options: ${JSON.stringify(options)}`);

  return await new B((resolve, reject) => {
    new Ftp(options).put(localFileStream, remoteUrl.pathname, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function toReadableSizeString (bytes) {
  if (bytes >= 1048576) {
    return `${parseFloat(bytes / 1048576.0).toFixed(2)} MB`;
  } else if (bytes >= 1024) {
    return `${parseFloat(bytes / 1024.0).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

async function uploadRecordedMedia (localFile, remotePath = null, uploadOptions = {}, keepRecordedMedia = false) {
  try {
    const {size} = await fs.stat(localFile);
    log.debug(`The size of the recent screen recording is ${toReadableSizeString(size)}`);
    if (_.isEmpty(remotePath)) {
      const memoryUsage = process.memoryUsage();
      const maxMemoryLimit = (memoryUsage.heapTotal - memoryUsage.heapUsed) / 2;
      if (size >= maxMemoryLimit) {
        throw new Error(`Cannot read the recorded media '${localFile}' to the memory, ` +
                        `because the file is too large (${toReadableSizeString(size)} >= ${toReadableSizeString(maxMemoryLimit)}). ` +
                        `Try to provide a link to a remote writable location instead.`);
      }
      const content = await fs.readFile(localFile);
      return content.toString('base64');
    }

    const remoteUrl = url.parse(remotePath);
    const localFileStream = _fs.createReadStream(localFile);
    const timeStarted = process.hrtime();
    log.info(`Uploading '${localFile}' of ${toReadableSizeString(size)} size to '${remotePath}'...`);
    if (remoteUrl.protocol.startsWith('http')) {
      await uploadMediaToHttp(localFileStream, remoteUrl, uploadOptions);
    } else if (remoteUrl.protocol === 'ftp') {
      await uploadMediaToFtp(localFileStream, remoteUrl, uploadOptions);
    } else {
      throw new Error(`Cannot upload the recorded media '${localFile}' to '${remotePath}'` +
                      `Unsupported remote protocol '${remoteUrl.protocol}'. Only http/https and ftp are supported`);
    }
    log.info(`Uploaded '${localFile}' of ${toReadableSizeString(size)} size in ${process.hrtime(timeStarted)[0]} seconds`);
    return '';
  } finally {
    if (keepRecordedMedia) {
      log.info(`Keeping '${localFile}' on the device as requested`);
    } else {
      await fs.rimraf(localFile);
    }
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
 * @property {?boolean} forceRestart - Whether to try to catch and upload/return the currently running screen recording
 *                                     (`false`, the default setting) or ignore the result of it and start a new recording
 *                                     immediately.
 * @property {?string|number} timeLimit - The maximum recording time, in seconds.
 *                                        The default value is 180, the maximum value is 600 (10 minutes).
 */

/**
 * Record the display of devices running iOS Simulator since Xcode 8.3.
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
  const {remotePath, user, pass, method, videoType,
         timeLimit, forceRestart} = options;
  let result = '';
  if (this.isRealDevice()) {
    throw new Error('Screen recording does not work on real devices');
  }

  // Kill the process if it is already running
  const pid = await getPidUsingPattern(SCREENRECORD_PGREP_PATTERN(this.opts.device.udid));
  if (!_.isEmpty(pid)) {
    log.info(`Detected that screen recorder is currently running. ` +
             `Killing the running one to start a new process...`);
    try {
      if (_.isEmpty(this._recentScreenRecordingPath) && !forceRestart) {
        this._recentScreenRecordingPath = await extractCurrentRecordingPath(pid);
      }
      await exec('kill', ['-2', pid]);
    } catch (err) {
      log.errorAndThrow(`Unable to stop screen recording process: ${err.message}`);
    }
  }

  if (!_.isEmpty(this._recentScreenRecordingPath)) {
    try {
      if (!forceRestart) {
        result = await uploadRecordedMedia(this._recentScreenRecordingPath, remotePath,
          {user, pass, method});
      }
    } catch (err) {
      log.warn(`Cannot get the content of the recent screen record because of: ${err.message}`);
    } finally {
      await fs.rimraf(this._recentScreenRecordingPath);
      this._recentScreenRecordingPath = null;
    }
  }

  const localPath = temp.path({prefix: 'appium', suffix: DEFAULT_EXT});

  const args = ['simctl', 'io', this.opts.device.udid, 'recordVideo', localPath];
  if (util.hasValue(videoType)) {
    args.push('--type', videoType);
  }

  // wrap in a manual Promise so we can handle errors in exec operation
  return await new B(async (resolve, reject) => {
    let err = null;
    const timeoutMs = isNaN(timeLimit) ? 3 * 60 * 1000 : Math.round(parseFloat(timeLimit) * 1000);
    if (timeoutMs > MAX_RECORDING_TIME_SEC * 1000) {
      return reject(new Error(`The timeLimit ${timeLimit} cannot be greater than ` +
                              `${MAX_RECORDING_TIME_SEC} seconds`));
    }
    log.debug(`Beginning screen recording with command: 'xcrun ${args.join(' ')}'` +
              `Will timeout in ${timeoutMs / 1000} s`);
    // do not await here, as the call runs in the background and we check for its product
    exec('xcrun', args, {timeout: timeoutMs, killSignal: 'SIGINT'}).catch((e) => {
      err = e;
    });

    // there is the delay time to start recording the screen, so, wait until it is ready.
    // the ready condition is
    //   1. check the movie file is created
    //   2. check it is started to capture the screen
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
 * @property {?boolean} keepRecordedMedia - Whether to delete the media file after it was uploaded or keep it on the device.
 *                                          `false` by default.  Note, that failed uploads will not keep the media as well unless
 *                                          this option is set to `true`.
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
  const {remotePath, user, pass, method, keepRecordedMedia} = options;
  let result = '';

  const pid = await getPidUsingPattern(SCREENRECORD_PGREP_PATTERN(this.opts.device.udid));
  if (_.isEmpty(pid)) {
    log.info(`Screen recording is not running. There is nothing to stop.`);
    if (!_.isEmpty(this._recentScreenRecordingPath)) {
      result = await uploadRecordedMedia(this._recentScreenRecordingPath, remotePath,
        {user, pass, method}, keepRecordedMedia);
      this._recentScreenRecordingPath = null;
    }
    return result;
  }

  const localPath = this._recentScreenRecordingPath || await extractCurrentRecordingPath(pid);
  try {
    if (_.isEmpty(localPath)) {
      log.errorAndThrow(`Cannot parse the path to the file created by ` +
                        `screen recorder process from lsof output. Did you start screen recording before?`);
    }
  } finally {
    try {
      await exec('kill', ['-2', pid]);
    } catch (err) {
      log.warn(`Unable to stop screen recording: ${err.message}. Continuing anyway`);
    }
  }

  result = await uploadRecordedMedia(localPath, remotePath, {user, pass, method}, keepRecordedMedia);
  this._recentScreenRecordingPath = null;
  return result;
};


export { commands };
export default commands;
