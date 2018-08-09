import _ from 'lodash';
import { waitForCondition } from 'asyncbox';
import { util, fs, tempDir } from 'appium-support';
import { exec, SubProcess } from 'teen_process';
import log from '../logger';
import { getPidUsingPattern, encodeBase64OrUpload } from '../utils';
import Whammy from 'whammy';
import sharp from 'sharp';
import { findAPortNotInUse } from 'portscanner';
import B from 'bluebird';
import net from 'net';
import { Parser } from 'minicap';

let commands = {};

const MAX_RECORDING_TIME_SEC = 60 * 10;
const DEFAULT_RECORDING_TIME_SEC = 60 * 3;
const PROCESS_SHUTDOWN_TIMEOUT_SEC = 5;
const REAL_DEVICE_BINARY = 'ios_minicap';
const REAL_DEVICE_PGREP_PATTERN = (udid) => `${REAL_DEVICE_BINARY}.*${udid}`;
const DEFAULT_MINICAP_PORT = 9002;
const SIMULATOR_BINARY = 'xcrun';
const SIMULATOR_PGREP_PATTERN = (udid) => `simctl io ${udid} recordVideo`;
const MP4_EXT = '.mp4';
const WEBP_EXT = '.webp';

async function interruptScreenCapture (pid) {
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

function hrtimeDiffToMs (hrtimeDiff) {
  const [seconds, nanos] = hrtimeDiff;
  return seconds * 1000 + nanos / 1000000;
}

async function startRealDeviceScreenCapture (encoder, port) {
  return await new B((resolve, reject) => {
    (function poll (retry = 0) {
      let previousFrame = null;
      const stream = net.connect({port});
      stream.on('error', (e) => {
        log.warn(`Got the following error from real device video stream listener on port ${port}: ` +
          e.message);
        if (retry < 10) {
          ++retry;
          log.info(`Will reconnect to the real device video stream listener on port ${port} ` +
            `in 2 seconds (retry number ${retry})`);
          setTimeout(() => poll(retry), 2000);
        } else {
          reject(e);
        }
      });

      function onBannerAvailable (banner) {
        resolve();
        log.debug(`Minicap protocol version: ${banner.version}`);
        log.debug(`Minicap header length: ${banner.length} B`);
        log.debug(`PID: ${banner.pid}`);
        log.debug(`Real screen WxH: ${banner.realWidth}x${banner.realHeight}`);
        log.debug(`Virtual screen WxH: ${banner.virtualWidthh}x${banner.virtualHeight}`);
        log.debug(`Display orientation: ${banner.orientation}`);
        log.debug(`Quirk bitflags: ${banner.quirks}`);
      }

      function onFrameAvailable (frame) {
        resolve();
        if (previousFrame && previousFrame.buffer) {
          encoder.add(`data:image/webp;base64,${previousFrame.buffer.toString('base64')}`,
            hrtimeDiffToMs(process.hrtime(previousFrame.timestamp)));
        }
        previousFrame = {
          timestamp: process.hrtime(),
        };
        sharp(Buffer.from(frame.buffer))
          .toFormat(sharp.format.webp)
          .toBuffer((err, buf) => {
            previousFrame.buffer = buf;
          });
      }

      const parser = new Parser({
        onBannerAvailable,
        onFrameAvailable
      });

      function tryParse () {
        for (let chunk; (chunk = stream.read());) {
          parser.parse(chunk);
        }
      }
      stream.on('readable', tryParse);

      stream.on('close', () => {
        log.info(`Disconnected from real device video stream listener on port ${port}`);
      });
    })();
  });
}

async function finishRealDeviceScreenCapture (encoder, dstPath) {
  log.info(`Compiling the resulting WEBM video into '${dstPath}'`);
  await fs.writeFile(dstPath, Buffer.from(encoder.compile(true)));
  log.info('Compilation finished');
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
 * @property {?string} videoResolution - The desired video resolution <w>x<h>. 400x600 by default.
 *                                       Only works for real devices.
 * @property {?boolean} forceRestart - Whether to try to catch and upload/return the currently running screen recording
 *                                     (`false`, the default setting) or ignore the result of it and start a new recording
 *                                     immediately.
 * @property {?string|number} timeLimit - The maximum recording time, in seconds.
 *                                        The default value is 180, the maximum value is 600 (10 minutes).
 */

/**
 * Record the display of devices running iOS Simulator since Xcode 8.3 or real devices since iOS 8
 * (ios-minicap utility is required: https://github.com/openstf/ios-minicap).
 * It records screen activity to a MPEG-4 (Simulator) or WEBP (Real device) file. Audio is not recorded with the video file.
 * If screen recording has been already started then the command will stop it forcefully and start a new one.
 * The previously recorded video file will be deleted.
 *
 * @param {?StartRecordingOptions} options - The available options.
 * @returns {string} Base64-encoded content of the recorded media file if
 *                   any screen recording is currently running or an empty string.
 * @throws {Error} If screen recording has failed to start.
 */
commands.startRecordingScreen = async function (options = {}) {
  const {videoType, timeLimit=DEFAULT_RECORDING_TIME_SEC, videoResolution='400x600',
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
  if (!_.isEmpty(this._screenRecordingProperties)) {
    await fs.rimraf(this._screenRecordingProperties.videoPath);
    this._screenRecordingProperties = null;
  }

  const videoPath = await tempDir.path({
    prefix: `appium_${Math.random().toString(16).substring(2, 8)}`,
    suffix: this.isRealDevice() ? WEBP_EXT : MP4_EXT,
  });

  let binaryName;
  let args;
  let port;
  if (this.isRealDevice()) {
    binaryName = REAL_DEVICE_BINARY;
    try {
      await fs.which(binaryName);
    } catch (err) {
      log.errorAndThrow(`'${binaryName}' binary is not found in PATH. ` +
        `Check https://github.com/openstf/ios-minicap for more details.`);
    }
    port = await findAPortNotInUse(DEFAULT_MINICAP_PORT, DEFAULT_MINICAP_PORT + 100);
    args = [
      '--udid', this.opts.device.udid,
      '--port', port,
      '--resolution', videoResolution,
    ];
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
    args.push(videoPath);
  }

  const timeout = Math.floor(parseFloat(timeLimit) * 1000);
  if (timeout > MAX_RECORDING_TIME_SEC * 1000 || timeout <= 0) {
    throw new Error(`The timeLimit value must be in range (0, ${MAX_RECORDING_TIME_SEC}] seconds. ` +
                    `The value of ${timeLimit} has been passed instead.`);
  }
  const recorderProc = new SubProcess(binaryName, args);
  recorderProc.on('output', (stdout, stderr) => {
    if (stdout || stderr) {
      log.debug(`[${binaryName}] ${stdout || stderr}`);
    }
  });
  await recorderProc.start(0);

  const encoder = new Whammy.Video();
  this._screenRecordingProperties = {
    encoder,
    videoPath,
  };
  if (this.isRealDevice()) {
    try {
      await startRealDeviceScreenCapture(encoder, port);
    } catch (e) {
      try {
        if (recorderProc.isRunning) {
          await recorderProc.stop('SIGTERM');
        }
      } catch (ign) {}
      this._screenRecordingProperties = null;
      throw e;
    }
  }

  log.info(`Beginning screen recording with command: '${binaryName} ${args.join(' ')}'` +
    `Will timeout in ${timeout / 1000} s`);
  setTimeout(async () => {
    if (!recorderProc.isRunning) {
      return;
    }

    try {
      await recorderProc.stop('SIGINT');
    } catch (err) {
      log.warn(`Cannot finish the active screen recording after ${timeout}ms timeout. ` +
        `Original error: ${err.message}`);
    }
  }, timeout);

  return result;
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
  if (_.isEmpty(pid)) {
    log.info('Screen recording is not running. There is nothing to stop.');
  } else {
    try {
      if (_.isEmpty(this._screenRecordingProperties)) {
        log.errorAndThrow(`Cannot parse the path to the file created by ` +
                          `screen recorder process. ` +
                          `Did you start screen recording not from Appium before?`);
      }
    } finally {
      if (!await interruptScreenCapture(pid)) {
        log.warn(`Unable to stop screen recording. Continuing anyway`);
      }
    }
  }

  if (_.isEmpty(this._screenRecordingProperties)) {
    return '';
  }

  const {
    encoder,
    videoPath,
  } = this._screenRecordingProperties;

  if (this.isRealDevice()) {
    await finishRealDeviceScreenCapture(encoder, videoPath);
  }

  try {
    if (!await fs.exists(videoPath)) {
      log.errorAndThrow(`The screen recorder utility has failed ` +
        `to store the actual screen recording at '${videoPath}'`);
    }
    return await encodeBase64OrUpload(videoPath, remotePath, {
      user,
      pass,
      method
    });
  } finally {
    if (await fs.exists(videoPath)) {
      await fs.rimraf(videoPath);
    }
    this._screenRecordingProperties = null;
  }
};


export { commands };
export default commands;
