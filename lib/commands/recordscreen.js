import _ from 'lodash';
import { fs, tempDir, logger, util } from 'appium-support';
import { SubProcess } from 'teen_process';
import log from '../logger';
import { encodeBase64OrUpload, isLocalHost } from '../utils';
import DEVICE_CONNECTIONS_FACTORY from '../device-connections-factory';
import { WDA_BASE_URL } from 'appium-webdriveragent';
import { waitForCondition } from 'asyncbox';
import url from 'url';

let commands = {};

const MAX_RECORDING_TIME_SEC = 60 * 30;
const DEFAULT_RECORDING_TIME_SEC = 60 * 3;
const DEFAULT_MJPEG_SERVER_PORT = 9100;
const DEFAULT_FPS = 10;
const DEFAULT_QUALITY = 'medium';
const DEFAULT_VCODEC = 'mjpeg';
const MP4_EXT = '.mp4';
const FFMPEG_BINARY = 'ffmpeg';
const ffmpegLogger = logger.getLogger(FFMPEG_BINARY);
const QUALITY_MAPPING = {
  low: 10,
  medium: 25,
  high: 75,
  photo: 100,
};


class ScreenRecorder {
  constructor (udid, videoPath, opts = {}) {
    this.videoPath = videoPath;
    this.opts = opts;
    this.udid = udid;
    this.mainProcess = null;
    this.timeoutHandler = null;
  }

  async start (timeoutMs) {
    try {
      await fs.which(FFMPEG_BINARY);
    } catch (err) {
      throw new Error(`'${FFMPEG_BINARY}' binary is not found in PATH. Install it using 'brew install ffmpeg'. ` +
        `Check https://www.ffmpeg.org/download.html for more details.`);
    }

    const {
      remotePort,
      remoteUrl,
      usePortForwarding,
      videoFps,
      videoType,
      videoScale,
      videoFilters,
      pixelFormat,
    } = this.opts;

    try {
      await DEVICE_CONNECTIONS_FACTORY.requestConnection(this.udid, remotePort, {
        devicePort: remotePort,
        usePortForwarding,
      });
    } catch (err) {
      log.warn(`Cannot forward the local port ${remotePort} to ${remotePort} ` +
        `on the device ${this.udid}. Set the custom value to 'mjpegServerPort' ` +
        `capability if this is an undesired behavior.`);
    }

    const args = [
      '-f', 'mjpeg',
    ];
    //Parameter `-r` is optional. See details: https://github.com/appium/appium/issues/12067
    if (videoFps && videoType === 'libx264') {
      args.push('-r', videoFps);
    }
    const {protocol, hostname} = url.parse(remoteUrl);
    args.push('-i', `${protocol}//${hostname}:${remotePort}`);
    if (videoFilters || videoScale) {
      args.push('-vf', videoFilters || `scale=${videoScale}`);
    }
    // Quicktime compatibility via pixelFormat: 'yuv420p'
    if (pixelFormat) {
      args.push('-pix_fmt', pixelFormat);
    }
    args.push(
      '-vcodec', videoType,
      '-y', this.videoPath
    );

    this.mainProcess = new SubProcess(FFMPEG_BINARY, args);
    let isCaptureStarted = false;
    this.mainProcess.on('output', (stdout, stderr) => {
      if (stderr) {
        if (stderr.trim().startsWith('frame=')) {
          if (!isCaptureStarted) {
            isCaptureStarted = true;
          }
        } else {
          ffmpegLogger.info(`${stderr}`);
        }
      }
    });
    await this.mainProcess.start(0);
    const startupTimeout = 5000;
    try {
      await waitForCondition(() => isCaptureStarted, {
        waitMs: startupTimeout,
        intervalMs: 300,
      });
    } catch (e) {
      log.warn(`Screen capture process did not start within ${startupTimeout}ms. Continuing anyway`);
    }
    if (!this.mainProcess.isRunning) {
      throw new Error(`The screen capture process '${FFMPEG_BINARY}' died unexpectedly. ` +
        `Check server logs for more details`);
    }
    log.info(`Starting screen capture on the device '${this.udid}' with command: '${FFMPEG_BINARY} ${args.join(' ')}'. ` +
      `Will timeout in ${timeoutMs}ms`);

    this.timeoutHandler = setTimeout(async () => {
      if (!await this.interrupt()) {
        log.warn(`Cannot finish the active screen recording on the device '${this.udid}' after ${timeoutMs}ms timeout`);
      }
    }, timeoutMs);
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

    DEVICE_CONNECTIONS_FACTORY.releaseConnection(this.udid, this.opts.remotePort);

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
 *                                  file should be encoded as Base64 and passed as the endpoint response value.
 *                                  An exception will be thrown if the generated media file is too big to
 *                                  fit into the available process memory.
 *                                  This option only has an effect if there is screen recording process in progress
 *                                  and `forceRestart` parameter is not set to `true`.
 * @property {?string} user - The name of the user for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} pass - The password for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} method - The http multipart upload method name. The 'PUT' one is used by default.
 *                              Only works if `remotePath` is provided.
 * @property {?string} videoType - The video codec type used for encoding of the be recorded screen capture.
 *                                 Execute `ffmpeg -codecs` in the terminal to see the list of supported video codecs.
 *                                 'mjpeg' by default.
 * @property {?string|number} videoQuality - The video encoding quality (low, medium, high, photo - defaults to medium).
 * @property {?string|number} videoFps - The Frames Per Second rate of the recorded video. Change this value if the resulting video
 *                                is too slow or too fast. Defaults to 10.
 * @property {?string} videoFilters - The FFMPEG video filters to apply. These filters allow to scale, flip, rotate and do many
 *                                    other useful transformations on the source video stream. The format of the property
 *                                    must comply with https://ffmpeg.org/ffmpeg-filters.html
 * @property {?string} videoScale - The scaling value to apply. Read https://trac.ffmpeg.org/wiki/Scaling for possible values.
 *                                  No scale is applied by default. If both `videoFilters` and `videoScale` are set then
 *                                  only `videoFilters` value will be respected.
 * @property {?string} pixelFormat - Output pixel format. Run `ffmpeg -pix_fmts` to list possible values.
 *                                   For Quicktime compatibility, set to "yuv420p" along with videoType: "libx264".
 * @property {?boolean} forceRestart - Whether to try to catch and upload/return the currently running screen recording
 *                                     (`false`, the default setting) or ignore the result of it and start a new recording
 *                                     immediately.
 * @property {?string|number} timeLimit - The maximum recording time, in seconds.
 *                                        The default value is 180, the maximum value is 600 (10 minutes).
 */

/**
 * Record the display of devices running iOS Simulator since Xcode 9 or real devices since iOS 11
 * (ffmpeg utility is required: 'brew install ffmpeg').
 * It records screen activity to a MPEG-4 file. Audio is not recorded with the video file.
 * If screen recording has been already started then the command will stop it forcefully and start a new one.
 * The previously recorded video file will be deleted.
 *
 * @param {?StartRecordingOptions} options - The available options.
 * @returns {string} Base64-encoded content of the recorded media file if
 *                   any screen recording is currently running or an empty string.
 * @throws {Error} If screen recording has failed to start.
 */
commands.startRecordingScreen = async function startRecordingScreen (options = {}) {
  const {
    videoType = DEFAULT_VCODEC,
    timeLimit = DEFAULT_RECORDING_TIME_SEC,
    videoQuality = DEFAULT_QUALITY,
    videoFps = DEFAULT_FPS,
    videoFilters,
    videoScale,
    forceRestart,
    pixelFormat
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

  const wdaBaseUrl = this.opts.wdaBaseUrl || WDA_BASE_URL;
  const screenRecorder = new ScreenRecorder(this.opts.device.udid, videoPath, {
    remotePort: this.opts.mjpegServerPort || DEFAULT_MJPEG_SERVER_PORT,
    remoteUrl: wdaBaseUrl,
    usePortForwarding: this.isRealDevice() && isLocalHost(wdaBaseUrl),
    videoType,
    videoFilters,
    videoScale,
    videoFps,
    pixelFormat
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

  let {
    mjpegServerScreenshotQuality,
    mjpegServerFramerate,
  } = await this.proxyCommand('/appium/settings', 'GET');
  if (videoQuality) {
    const quality = _.isInteger(videoQuality) ? videoQuality : QUALITY_MAPPING[_.toLower(videoQuality)];
    if (!quality) {
      throw new Error(`videoQuality value should be one of ${JSON.stringify(_.keys(QUALITY_MAPPING))} or a number in range 1..100. ` +
        `'${videoQuality}' is given instead`);
    }
    mjpegServerScreenshotQuality = mjpegServerScreenshotQuality !== quality ? quality : undefined;
  } else {
    mjpegServerScreenshotQuality = undefined;
  }
  if (videoFps) {
    const fps = parseInt(videoFps, 10);
    if (isNaN(fps)) {
      throw new Error(`videoFps value should be a valid number in range 1..60. ` +
        `'${videoFps}' is given instead`);
    }
    mjpegServerFramerate = mjpegServerFramerate !== fps ? fps : undefined;
  } else {
    mjpegServerFramerate = undefined;
  }
  if (util.hasValue(mjpegServerScreenshotQuality) || util.hasValue(mjpegServerFramerate)) {
    await this.proxyCommand('/appium/settings', 'POST', {
      settings: {
        mjpegServerScreenshotQuality,
        mjpegServerFramerate,
      }
    });
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
 *                                  file should be encoded as Base64 and passed as the endpoint response value.
 *                                  An exception will be thrown if the generated media file is too big to
 *                                  fit into the available process memory.
 * @property {?string} user - The name of the user for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} pass - The password for the remote authentication. Only works if `remotePath` is provided.
 * @property {?string} method - The http multipart upload method name. The 'PUT' one is used by default.
 *                              Only works if `remotePath` is provided.
 * @property {?Object} headers - Additional headers mapping for multipart http(s) uploads
 * @property {?string} fileFieldName [file] - The name of the form field, where the file content BLOB should be stored for
 *                                            http(s) uploads
 * @property {?Object|Array<Pair>} formFields - Additional form fields for multipart http(s) uploads
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
commands.stopRecordingScreen = async function stopRecordingScreen (options = {}) {
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
    return await encodeBase64OrUpload(videoPath, options.remotePath, options);
  } finally {
    await this._recentScreenRecorder.interrupt(true);
    await this._recentScreenRecorder.cleanup();
    this._recentScreenRecorder = null;
  }
};


export { commands };
export default commands;
