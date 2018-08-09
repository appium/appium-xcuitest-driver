import { waitForCondition } from 'asyncbox';
import { util, fs, tempDir } from 'appium-support';
import { exec, SubProcess } from 'teen_process';
import log from '../logger';
import { getPidUsingPattern, encodeBase64OrUpload } from '../utils';
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
const FFMPEG_BINARY = 'ffmpeg';


class ScreenRecorder {
  ScreenRecorder (udid, videoPath, opts = {}) {
    this.videoPath = videoPath;
    this.opts = opts;
    this.udid = udid;
  }

  async getPid () {
    throw new Error(`Should be overridden in subclasses`);
  }

  async interrupt () {
    const pid = await this.getPid();
    if (!pid) {
      return true;
    }

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

  async terminate () {
    const pid = await this.getPid();
    if (!pid) {
      return true;
    }

    try {
      await exec('kill', [pid]);
    } catch (e) {
      return false;
    }
    return true;
  }

  async cleanup () {
    if (await fs.exists(this.videoPath)) {
      await fs.rimraf(this.videoPath);
    }
  }
}

class SimulatorScreenRecorder extends ScreenRecorder {
  SimulatorScreenRecorder (udid, videoPath, opts = {}) {
    super(udid, videoPath, opts);
    this.binaryName = SIMULATOR_BINARY;
    this.mainProcess = null;
  }

  async getPid () {
    return await getPidUsingPattern(SIMULATOR_PGREP_PATTERN(this.udid));
  }

  async start (timeout) {
    const args = [
      'simctl',
      'io',
      this.udid,
      'recordVideo'
    ];
    if (util.hasValue(this.opts.videoType)) {
      args.push('--type', this.opts.videoType);
    }
    args.push(this.videoPath);

    this.mainProcess = new SubProcess(this.binaryName, args);
    this.mainProcess.on('output', (stdout, stderr) => {
      if (stdout || stderr) {
        log.debug(`[${this.binaryName}] ${stdout || stderr}`);
      }
    });
    await this.mainProcess.start(0);

    log.info(`Starting screen recording on Simulator with command: '${this.binaryName} ${args.join(' ')}'. ` +
      `Will timeout in ${timeout}ms`);
    setTimeout(async () => {
      if (!this.mainProcess.isRunning) {
        return;
      }

      if (!await this.interrupt()) {
        log.warn(`Cannot finish the active screen recording on Simulator after ${timeout}ms timeout`);
      }
    }, timeout);
  }

  async interrupt () {
    let result = true;
    if (this.mainProcess && this.mainProcess.isRunning) {
      try {
        await this.mainProcess.stop('SIGINT');
      } catch (e) {
        log.warn(`Cannot stop ${this.binaryName}. Original error: ${e.message}`);
        result = false;
      }
    }

    if (!this.mainProcess) {
      return await super.interrupt();
    }

    return result;
  }

  async terminate () {
    let result = true;
    if (this.mainProcess && this.mainProcess.isRunning) {
      try {
        await this.mainProcess.stop('SIGTERM');
      } catch (e) {
        log.warn(`Cannot stop ${this.binaryName}. Original error: ${e.message}`);
        result = false;
      }
    }

    if (!this.mainProcess) {
      return await super.terminate();
    }

    return result;
  }

  async finish () {
    await this.interrupt();
    return this.videoPath;
  }

}

class RealDeviceScreenRecorder extends ScreenRecorder {
  RealDeviceScreenRecorder (udid, videoPath, opts = {}) {
    super(udid, videoPath, opts);
    this.binaryName = REAL_DEVICE_BINARY;
    this.ffmpegBinary = FFMPEG_BINARY;
    this.mainProcess = null;
    this.ffmpegProcess = null;
  }

  async getPid () {
    return await getPidUsingPattern(REAL_DEVICE_PGREP_PATTERN(this.udid));
  }

  async start (timeout) {
    try {
      await fs.which(this.binaryName);
    } catch (err) {
      log.errorAndThrow(`'${this.binaryName}' binary is not found in PATH. ` +
        `Check https://github.com/openstf/ios-minicap for more details.`);
    }

    try {
      await fs.which(this.ffmpegBinary);
    } catch (err) {
      log.errorAndThrow(`'${this.ffmpegBinary}' binary is not found in PATH. Install it using 'brew install ffmpeg'` +
        `Check https://www.ffmpeg.org/download.html for more details.`);
    }

    const ffmpegArgs = [
      '-f', 'image2pipe',
      '-r', '15',
      '-vcodec', 'mjpeg',
      '-i', '-',
      '-y', this.videoPath,
    ];
    this.ffmpegProcess = new SubProcess(this.ffmpegBinary, ffmpegArgs);
    this.ffmpegProcess.on('output', (stdout, stderr) => {
      if (stderr) {
        log.debug(`[${this.ffmpegBinary}] ${stderr}`);
      }
    });
    await this.ffmpegProcess.start(0);
    log.info(`Started ${this.ffmpegBinary} with arguments ${JSON.stringify(ffmpegArgs)}`);

    const port = await findAPortNotInUse(DEFAULT_MINICAP_PORT, DEFAULT_MINICAP_PORT + 100);
    const args = [
      '--udid', this.udid,
      '--port', port,
      '--resolution', this.opts.videoResolution,
    ];

    this.mainProcess = new SubProcess(this.binaryName, args);
    this.mainProcess.on('output', (stdout, stderr) => {
      if (stdout || stderr) {
        log.debug(`[${this.binaryName}] ${stdout || stderr}`);
      }
    });
    await this.mainProcess.start(0);

    log.info(`Starting screen recording on Real device with command: '${this.binaryName} ${args.join(' ')}'`);
    await this.setupBroadcastCapture(port);
    log.info(`Will timeout in ${timeout}ms`);

    setTimeout(async () => {
      if (!this.mainProcess.isRunning && !this.ffmpegProcess.isRunning) {
        return;
      }

      if (!await this.interrupt()) {
        log.warn(`Cannot finish the active screen recording on Real device after ${timeout}ms timeout`);
      }
    }, timeout);
  }

  async setupBroadcastCapture (port) {
    const self = this;
    return await new B((resolve, reject) => {
      (function poll (retry = 0) {
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
          if (self.ffmpegProcess.isRunning) {
            self.ffmpegProcess.proc.stdin.write(frame.buffer);
          }
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

  async terminate () {
    let result = true;
    if (this.mainProcess && this.mainProcess.isRunning) {
      try {
        await this.mainProcess.stop('SIGTERM');
      } catch (e) {
        log.warn(`Cannot stop ${this.binaryName}. Original error: ${e.message}`);
        result = false;
      }
    }

    if (this.ffmpegProcess && this.ffmpegProcess.isRunning) {
      try {
        await this.ffmpegProcess.stop('SIGTERM');
      } catch (e) {
        log.warn(`Cannot stop ${FFMPEG_BINARY}. Original error: ${e.message}`);
      }
    }

    if (!this.mainProcess) {
      return await super.terminate();
    }

    return result;
  }

  async interrupt () {
    let result = true;
    if (this.mainProcess && this.mainProcess.isRunning) {
      try {
        await this.mainProcess.stop('SIGINT');
      } catch (e) {
        log.warn(`Cannot stop ${this.binaryName}. Original error: ${e.message}`);
        result = false;
      }
    }

    if (this.ffmpegProcess && this.ffmpegProcess.isRunning) {
      try {
        await this.ffmpegProcess.stop('SIGINT');
      } catch (e) {
        log.warn(`Cannot stop ${FFMPEG_BINARY}. Original error: ${e.message}`);
      }
    }

    if (!this.mainProcess) {
      return await super.interrupt();
    }

    return result;
  }

  async finish () {
    await this.interrupt();
    return this.videoPath;
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
  const {
    videoType,
    timeLimit = DEFAULT_RECORDING_TIME_SEC,
    videoResolution = '400x600',
    forceRestart,
  } = options;

  let result = '';
  if (!forceRestart) {
    log.info(`Checking if there is/was a previous screen recording. ` +
      `Set 'forceRestart' option to 'true' if you'd like to skip this step.`);
    result = await this.stopRecordingScreen(options);
  }

  const videoPath = await tempDir.path({
    prefix: `appium_${Math.random().toString(16).substring(2, 8)}`,
    suffix: this.isRealDevice() ? WEBP_EXT : MP4_EXT,
  });

  const screenRecorder = this.isRealDevice()
    ? new RealDeviceScreenRecorder(this.opts.device.udid, videoPath, {
      videoResolution,
    })
    : new SimulatorScreenRecorder(this.opts.device.udid, videoPath, {
      videoType,
    });
  if (!await screenRecorder.terminate()) {
    log.errorAndThrow('Unable to stop screen recording process');
  }
  if (this._recentScreenRecorder) {
    await this._recentScreenRecorder.cleanup();
    this._recentScreenRecorder = null;
  }

  const timeout = Math.floor(parseFloat(timeLimit) * 1000);
  if (timeout > MAX_RECORDING_TIME_SEC * 1000 || timeout <= 0) {
    log.errorAndThrow(`The timeLimit value must be in range (0, ${MAX_RECORDING_TIME_SEC}] seconds. ` +
      `The value of ${timeLimit} has been passed instead.`);
  }

  try {
    await screenRecorder.start(timeout);
  } catch (e) {
    await screenRecorder.terminate();
    await screenRecorder.cleanup();
    throw e;
  }
  this._recentScreenRecorder = screenRecorder;

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
  const {
    remotePath,
    user,
    pass,
    method,
  } = options;

  if (!this._recentScreenRecorder) {
    log.info('Screen recording is not running. There is nothing to stop.');
    return '';
  }

  try {
    const videoPath = await this._recentScreenRecorder.finish();
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
    await this._recentScreenRecorder.terminate();
    await this._recentScreenRecorder.cleanup();
    this._recentScreenRecorder = null;
  }
};


export { commands };
export default commands;
