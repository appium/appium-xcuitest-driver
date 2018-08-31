import { fs, tempDir, logger } from 'appium-support';
import { SubProcess } from 'teen_process';
import log from '../logger';
import { encodeBase64OrUpload } from '../utils';
import iProxy from '../wda/iproxy';

let commands = {};

const MAX_RECORDING_TIME_SEC = 60 * 30;
const DEFAULT_RECORDING_TIME_SEC = 60 * 3;
const DEFAULT_MJPEG_SERVER_PORT = 9100;
const MP4_EXT = '.mp4';
const DEFAULT_FPS = 10;
const FFMPEG_BINARY = 'ffmpeg';
const ffmpegLogger = logger.getLogger(FFMPEG_BINARY);

class ScreenRecorder {
  constructor (udid, videoPath, opts = {}) {
    this.videoPath = videoPath;
    this.opts = opts;
    this.udid = udid;
    this.mainProcess = null;
    this.iproxy = null;
    this.timeoutHandler = null;
  }

  async start (timeoutMs) {
    try {
      await fs.which(FFMPEG_BINARY);
    } catch (err) {
      throw new Error(`'${FFMPEG_BINARY}' binary is not found in PATH. Install it using 'brew install ffmpeg'. ` +
        `Check https://www.ffmpeg.org/download.html for more details.`);
    }

    const localPort = this.opts.remotePort;
    if (this.opts.usePortForwarding) {
      await this.startIproxy(localPort);
    }

    const args = [
      '-f', 'mjpeg',
      '-r', this.opts.videoFps,
      '-i', `http://localhost:${localPort}`,
      '-vcodec', 'mjpeg',
      '-y', this.videoPath,
    ];
    this.mainProcess = new SubProcess(FFMPEG_BINARY, args);
    this.mainProcess.on('output', (stdout, stderr) => {
      if (stderr && !stderr.includes('frame=')) {
        ffmpegLogger.info(`${stderr}`);
      }
    });
    // Give ffmpeg some time for init
    await this.mainProcess.start(5000);
    log.info(`Starting screen capture on the device '${this.udid}' with command: '${FFMPEG_BINARY} ${args.join(' ')}'. ` +
      `Will timeout in ${timeoutMs}ms`);

    this.timeoutHandler = setTimeout(async () => {
      if (!await this.interrupt()) {
        log.warn(`Cannot finish the active screen recording on the device '${this.udid}' after ${timeoutMs}ms timeout`);
      }
    }, timeoutMs);
  }

  async startIproxy (localPort) {
    this.iproxy = new iProxy(this.udid, localPort, this.opts.remotePort);
    try {
      await this.iproxy.start();
    } catch (err) {
      log.warn(`Cannot start iproxy. Assuming it is already forwarding the remote port ${this.opts.remotePort} to ${localPort} ` +
        `for the device ${this.udid}. Set the custom value to 'mjpegServerPort' capability if this is an undesired behavior. ` +
        `Original error: ${err.message}`);
      this.iproxy = null;
    }
  }

  async stopIproxy () {
    if (!this.iproxy) {
      return;
    }

    const quitPromise = this.iproxy.quit();
    this.iproxy = null;
    try {
      await quitPromise;
    } catch (err) {
      log.warn(`Cannot stop iproxy. Original error: ${err.message}`);
    }
  }

  async interrupt (force = false) {
    let result = true;

    if (this.timeoutHandler) {
      clearTimeout(this.timeoutHandler);
      this.timeoutHandler = null;
    }

    if (this.mainProcess && this.mainProcess.isRunning) {
      const interruptPromise = this.mainProcess.stop(force ? 'SIGTERM' : 'SIGINT');
      this.mainProcess = null;
      try {
        await interruptPromise;
      } catch (e) {
        log.warn(`Cannot ${force ? 'terminate' : 'interrupt'} ${FFMPEG_BINARY}. ` +
          `Original error: ${e.message}`);
        result = false;
      }
    }

    if (this.opts.usePortForwarding) {
      await this.stopIproxy();
    }

    return result;
  }

  async finish () {
    await this.interrupt();
    return this.videoPath;
  }

  async cleanup () {
    if (await fs.exists(this.videoPath)) {
      await fs.rimraf(this.videoPath);
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
 * @property {?string} videoQuality - The video encoding quality (low, medium, high, photo - defaults to medium).
 * @property {?string} videoFps - The Frames Per Second rate of the recorded video. Change this value if the resulting video
 *                                is too slow or too fast. Defaults to 10.
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
    videoFps = DEFAULT_FPS,
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

  const screenRecorder = new ScreenRecorder(this.opts.device.udid, videoPath, {
    // TODO: Apply type and quality options
    videoType,
    videoQuality,
    videoFps: videoFps || DEFAULT_FPS,
    remotePort: this.opts.mjpegServerPort || DEFAULT_MJPEG_SERVER_PORT,
    usePortForwarding: this.isRealDevice(),
  });
  if (!await screenRecorder.interrupt(true)) {
    log.errorAndThrow('Unable to stop screen recording process');
  }
  if (this._recentScreenRecorder) {
    await this._recentScreenRecorder.cleanup();
    this._recentScreenRecorder = null;
  }

  const timeoutSeconds = parseFloat(timeLimit);
  if (isNaN(timeoutSeconds) || timeoutSeconds > MAX_RECORDING_TIME_SEC || timeoutSeconds <= 0) {
    log.errorAndThrow(`The timeLimit value must be in range [1, ${MAX_RECORDING_TIME_SEC}] seconds. ` +
      `The value of '${timeLimit}' has been passed instead.`);
  }

  try {
    await screenRecorder.start(timeoutSeconds * 1000);
  } catch (e) {
    await screenRecorder.interrupt(true);
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
    await this._recentScreenRecorder.interrupt(true);
    await this._recentScreenRecorder.cleanup();
    this._recentScreenRecorder = null;
  }
};


export { commands };
export default commands;
