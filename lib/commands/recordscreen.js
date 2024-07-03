import _ from 'lodash';
import {fs, tempDir, logger, util} from 'appium/support';
import {SubProcess} from 'teen_process';
import {encodeBase64OrUpload, isLocalHost} from '../utils';
import DEVICE_CONNECTIONS_FACTORY from '../device-connections-factory';
import {WDA_BASE_URL} from 'appium-webdriveragent';
import {waitForCondition} from 'asyncbox';
import url from 'url';

/**
 * Set max timeout for 'reconnect_delay_max' ffmpeg argument usage.
 * It could have [0 - 4294] range limitation thus this value should be less than that right now
 * to return a better error message.
 */
const MAX_RECORDING_TIME_SEC = 4200;
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
const CAPTURE_START_MARKER = /^\s*frame=/;

export class ScreenRecorder {
  constructor(udid, log, videoPath, opts = {}) {
    this.videoPath = videoPath;
    this.log = log;
    this.opts = opts;
    this.udid = udid;
    this.mainProcess = null;
    this.timeoutHandler = null;
  }

  async start(timeoutMs) {
    try {
      await fs.which(FFMPEG_BINARY);
    } catch (err) {
      throw new Error(
        `'${FFMPEG_BINARY}' binary is not found in PATH. Install it using 'brew install ffmpeg'. ` +
          `Check https://www.ffmpeg.org/download.html for more details.`,
      );
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
      this.log.warn(
        `Cannot forward the local port ${remotePort} to ${remotePort} ` +
          `on the device ${this.udid}. Set the custom value to 'mjpegServerPort' ` +
          `capability if this is an undesired behavior.`,
      );
    }

    const args = [
      '-f',
      'mjpeg',
      // https://github.com/appium/appium/issues/16294
      '-reconnect',
      '1',
      '-reconnect_at_eof',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      `${timeoutMs / 1000 + 1}`,
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
    args.push('-vcodec', videoType, '-y', this.videoPath);

    this.mainProcess = new SubProcess(FFMPEG_BINARY, args);
    let isCaptureStarted = false;
    this.mainProcess.on('line-stderr', (line) => {
      if (CAPTURE_START_MARKER.test(line)) {
        if (!isCaptureStarted) {
          isCaptureStarted = true;
        }
      } else {
        ffmpegLogger.info(line);
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
      this.log.warn(
        `Screen capture process did not start within ${startupTimeout}ms. Continuing anyway`,
      );
    }
    if (!this.mainProcess.isRunning) {
      throw new Error(
        `The screen capture process '${FFMPEG_BINARY}' died unexpectedly. ` +
          `Check server logs for more details`,
      );
    }
    this.log.info(
      `Starting screen capture on the device '${
        this.udid
      }' with command: '${FFMPEG_BINARY} ${args.join(' ')}'. ` + `Will timeout in ${timeoutMs}ms`,
    );

    this.timeoutHandler = setTimeout(async () => {
      if (!(await this.interrupt())) {
        this.log.warn(
          `Cannot finish the active screen recording on the device '${this.udid}' after ${timeoutMs}ms timeout`,
        );
      }
    }, timeoutMs);
  }

  async interrupt(force = false) {
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
        this.log.warn(
          `Cannot ${force ? 'terminate' : 'interrupt'} ${FFMPEG_BINARY}. ` +
            `Original error: ${e.message}`,
        );
        result = false;
      }
    }

    DEVICE_CONNECTIONS_FACTORY.releaseConnection(this.udid, this.opts.remotePort);

    return result;
  }

  async finish() {
    await this.interrupt();
    return this.videoPath;
  }

  async cleanup() {
    if (await fs.exists(this.videoPath)) {
      await fs.rimraf(this.videoPath);
    }
  }
}

export default {
  /** @type {ScreenRecorder?} */
  _recentScreenRecorder: null,
  /**
   * Direct Appium to start recording the device screen
   *
   * Record the display of devices running iOS Simulator since Xcode 9 or real devices since iOS 11
   * (ffmpeg utility is required: 'brew install ffmpeg').
   * It records screen activity to a MPEG-4 file. Audio is not recorded with the video file.
   * If screen recording has been already started then the command will stop it forcefully and start a new one.
   * The previously recorded video file will be deleted.
   *
   * @param {import('./types').StartRecordingScreenOptions} [options] - The available options.
   * @returns {Promise<string>} Base64-encoded content of the recorded media file if
   *                   any screen recording is currently running or an empty string.
   * @throws {Error} If screen recording has failed to start.
   * @this {XCUITestDriver}
   */
  async startRecordingScreen(options = {}) {
    const {
      videoType = DEFAULT_VCODEC,
      timeLimit = DEFAULT_RECORDING_TIME_SEC,
      videoQuality = DEFAULT_QUALITY,
      videoFps = DEFAULT_FPS,
      videoFilters,
      videoScale,
      forceRestart,
      pixelFormat,
    } = options;

    let result = '';
    if (!forceRestart) {
      this.log.info(
        `Checking if there is/was a previous screen recording. ` +
          `Set 'forceRestart' option to 'true' if you'd like to skip this step.`,
      );
      result = (await this.stopRecordingScreen(options)) ?? result;
    }

    const videoPath = await tempDir.path({
      prefix: `appium_${Math.random().toString(16).substring(2, 8)}`,
      suffix: MP4_EXT,
    });

    const wdaBaseUrl = this.opts.wdaBaseUrl || WDA_BASE_URL;
    const screenRecorder = new ScreenRecorder(this.device.udid, this.log, videoPath, {
      remotePort: this.opts.mjpegServerPort || DEFAULT_MJPEG_SERVER_PORT,
      remoteUrl: wdaBaseUrl,
      usePortForwarding: this.isRealDevice() && isLocalHost(wdaBaseUrl),
      videoType,
      videoFilters,
      videoScale,
      videoFps,
      pixelFormat,
    });
    if (!(await screenRecorder.interrupt(true))) {
      this.log.errorAndThrow('Unable to stop screen recording process');
    }
    if (this._recentScreenRecorder) {
      await this._recentScreenRecorder.cleanup();
      this._recentScreenRecorder = null;
    }

    const timeoutSeconds = parseFloat(String(timeLimit));
    if (isNaN(timeoutSeconds) || timeoutSeconds > MAX_RECORDING_TIME_SEC || timeoutSeconds <= 0) {
      this.log.errorAndThrow(
        `The timeLimit value must be in range [1, ${MAX_RECORDING_TIME_SEC}] seconds. ` +
          `The value of '${timeLimit}' has been passed instead.`,
      );
    }

    let {mjpegServerScreenshotQuality, mjpegServerFramerate} =
      /** @type {import('appium-webdriveragent').WDASettings} */ (
        await this.proxyCommand('/appium/settings', 'GET')
      );
    if (videoQuality) {
      const quality = _.isInteger(videoQuality)
        ? videoQuality
        : QUALITY_MAPPING[_.toLower(String(videoQuality))];
      if (!quality) {
        throw new Error(
          `videoQuality value should be one of ${JSON.stringify(
            _.keys(QUALITY_MAPPING),
          )} or a number in range 1..100. ` + `'${videoQuality}' is given instead`,
        );
      }
      mjpegServerScreenshotQuality = mjpegServerScreenshotQuality !== quality ? quality : undefined;
    } else {
      mjpegServerScreenshotQuality = undefined;
    }
    if (videoFps) {
      const fps = parseInt(String(videoFps), 10);
      if (isNaN(fps)) {
        throw new Error(
          `videoFps value should be a valid number in range 1..60. ` +
            `'${videoFps}' is given instead`,
        );
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
        },
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
  },

  /**
   * Direct Appium to stop screen recording and return the video
   *
   * If no screen recording process is running then the endpoint will try to get
   * the recently recorded file. If no previously recorded file is found and no
   * active screen recording processes are running then the method returns an
   * empty string.
   *
   * @param {import('./types').StopRecordingScreenOptions} options - The available
   * options.
   * @returns {Promise<string?>} Base64-encoded content of the recorded media
   * file if `remotePath` parameter is empty or null or an empty string.
   * @throws {Error} If there was an error while getting the name of a media
   *                 file or the file content cannot be uploaded to the remote
   *                 location.
   * @this {XCUITestDriver}
   */
  async stopRecordingScreen(options = {}) {
    if (!this._recentScreenRecorder) {
      this.log.info('Screen recording is not running. There is nothing to stop.');
      return '';
    }

    try {
      const videoPath = await this._recentScreenRecorder.finish();
      if (!(await fs.exists(videoPath))) {
        this.log.errorAndThrow(
          `The screen recorder utility has failed ` +
            `to store the actual screen recording at '${videoPath}'`,
        );
      }
      return await encodeBase64OrUpload(videoPath, options.remotePath, options);
    } finally {
      await this._recentScreenRecorder.interrupt(true);
      await this._recentScreenRecorder.cleanup();
      this._recentScreenRecorder = null;
    }
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
