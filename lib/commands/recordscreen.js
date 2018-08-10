import { util, fs, tempDir } from 'appium-support';
import { exec, SubProcess } from 'teen_process';
import log from '../logger';
import { getPidUsingPattern, encodeBase64OrUpload } from '../utils';
import { findAPortNotInUse } from 'portscanner';
import B from 'bluebird';
import net from 'net';
import iProxy from '../wda/iproxy';
import path from 'path';


let commands = {};

const MAX_RECORDING_TIME_SEC = 60 * 10;
const DEFAULT_RECORDING_TIME_SEC = 60 * 3;
const DEFAULT_SCREENCAP_PORT = 9100;
const SIMULATOR_BINARY = 'xcrun';
const SIMULATOR_PGREP_PATTERN = (udid) => `simctl io ${udid} recordVideo`;
const MP4_EXT = '.mp4';
const FFMPEG_BINARY = 'ffmpeg';


class ScreenRecorder {
  constructor (udid, videoPath, opts = {}) {
    this.videoPath = videoPath;
    this.opts = opts;
    this.udid = udid;
  }

  async getPid () {
    throw new Error('Should be overridden in subclasses');
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
  constructor (udid, videoPath, opts = {}) {
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
    if (this.mainProcess && this.mainProcess.isRunning) {
      try {
        await this.mainProcess.stop('SIGINT');
      } catch (e) {
        log.warn(`Cannot interrupt ${this.binaryName}. Original error: ${e.message}`);
        return false;
      }
    }

    return true;
  }

  async terminate () {
    let result = true;
    if (this.mainProcess && this.mainProcess.isRunning) {
      try {
        await this.mainProcess.stop('SIGTERM');
      } catch (e) {
        log.warn(`Cannot terminate ${this.binaryName}. Original error: ${e.message}`);
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
  constructor (udid, videoPath, opts = {}) {
    super(udid, videoPath, opts);
    this.ffmpegBinary = FFMPEG_BINARY;
    this.broadcastClient = null;
    this.frameBuffer = [];
    this.tmpRoot = null;
    this.totalFramesCount = 0;
    this.fps = 10;
    this.iproxy = null;
  }

  async getPid () {
    return null;
  }

  async start (timeout) {
    try {
      await fs.which(this.ffmpegBinary);
    } catch (err) {
      throw new Error(`'${this.ffmpegBinary}' binary is not found in PATH. Install it using 'brew install ffmpeg'` +
        `Check https://www.ffmpeg.org/download.html for more details.`);
    }

    log.info('Starting screen recording on Real device');
    const localPort = await findAPortNotInUse(DEFAULT_SCREENCAP_PORT, DEFAULT_SCREENCAP_PORT + 100);
    log.debug(`Will use the local port #${localPort} and the remote port #${this.opts.remotePort}`);
    this.iproxy = new iProxy(this.udid, localPort, this.opts.remotePort);
    await this.iproxy.start();
    await this.setupBroadcastCapture();
    log.info(`Will timeout in ${timeout}ms`);

    setTimeout(async () => {
      if (!await this.interrupt()) {
        log.warn(`Cannot finish the active screen recording on Real device after ${timeout}ms timeout`);
      }
    }, timeout);
  }

  async setupBroadcastCapture () {
    this.tmpRoot = await tempDir.openDir();
    this.broadcastClient = net.connect({port: this.iproxy.localport});
    return new B((resolve, reject) => {
      this.broadcastClient.on('error', (e) => {
        log.warn(`Got the following error from real device video stream listener on port ${this.iproxy.localport}: ` +
          e.message);
        reject(e);
      });

      this.broadcastClient.on('data', (buffer) => {
        resolve();
        fs.writeFile(path.resolve(this.tmpRoot, `screen_${this.totalFramesCount++}.jpg`), buffer);
      });

      this.broadcastClient.on('close', () => {
        log.info(`Disconnected from real device video stream listener on port ${this.iproxy.localport}`);
        if (this.totalFramesCount) {
          log.info(`Recorded ${this.totalFramesCount} video frames in total`);
        }
      });
    });
  }

  async terminate () {
    return await this.interrupt();
  }

  async interrupt () {
    if (this.iproxy) {
      try {
        await this.iproxy.stop();
      } catch (err) {
        log.warn(`Cannot stop iproxy. Original error: ${err.message}`);
      }
      this.iproxy = null;
    }

    if (!this.broadcastClient) {
      return true;
    }

    try {
      this.broadcastClient.end();
      this.broadcastClient = null;
      return true;
    } catch (err) {
      this.broadcastClient = null;
      return false;
    }
  }

  async finish () {
    await this.interrupt();
    const ffmpegArgs = [
      '-f', 'image2',
      '-i', 'screen_%d.jpg',
      '-r', this.fps,
      '-q', 1,
      '-vcodec', 'mjpeg',
      '-y', this.videoPath,
    ];
    log.info(`Starting ${this.ffmpegBinary} with arguments ${JSON.stringify(ffmpegArgs)}`);
    try {
      const {stdout, stderr} = await exec(this.ffmpegBinary, ffmpegArgs, {
        cwd: this.tmpRoot,
      });
      if (stderr) {
        log.warn(stderr);
      }
      log.debug(stdout);
    } catch (e) {
      throw new Error(`Cannot compile the resulting video. Original error: ${e.stderr}`);
    }
    return this.videoPath;
  }

  async cleanup () {
    await super.cleanup();
    if (this.tmpRoot) {
      await fs.rimraf(this.tmpRoot);
      this.tmpRoot = null;
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
 * (ios-minicap utility is required: https://github.com/openstf/ios-minicap).
 * It records screen activity to a MPEG-4 file. Audio is not recorded with the video file.
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
    videoQuality = 'medium',
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
    suffix: MP4_EXT,
  });

  const screenRecorder = this.isRealDevice()
    ? new RealDeviceScreenRecorder(this.opts.device.udid, videoPath, {
      videoQuality,
      remotePort: this.opts.screencapPort || DEFAULT_SCREENCAP_PORT,
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
