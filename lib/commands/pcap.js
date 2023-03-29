import Pyidevice from '../py-ios-device-client';
import {fs, tempDir, logger, util} from 'appium/support';
import {encodeBase64OrUpload} from '../utils';
import {errors} from 'appium/driver';

const MAX_CAPTURE_TIME_SEC = 60 * 60 * 12;
const DEFAULT_CAPTURE_TIME_SEC = 60 * 5;
const DEFAULT_EXT = '.pcap';
const pcapLogger = logger.getLogger('pcapd');

export class TrafficCapture {
  /** @type {import('teen_process').SubProcess|null} */
  mainProcess;
  constructor(udid, log, resultPath) {
    this.udid = udid;
    this.log = log;
    this.resultPath = resultPath;
    this.mainProcess = null;
  }

  async start(timeoutSeconds) {
    this.mainProcess = /** @type {import('teen_process').SubProcess} */(await new Pyidevice(this.udid).collectPcap(this.resultPath));
    this.mainProcess.on('output', (stdout, stderr) => {
      if (stderr) {
        pcapLogger.info(`${stderr}`);
      }
    });
    this.log.info(
      `Starting network traffic capture session on the device '${this.udid}'. ` +
        `Will timeout in ${timeoutSeconds}s`
    );
    setTimeout(async () => await this.interrupt(), timeoutSeconds * 1000);
    this.mainProcess.once('exit', (code, signal) => {
      this.log.debug(
        `The traffic capture session on the device '${this.udid}' has exited ` +
          `with code ${code}, signal ${signal}`
      );
    });
  }

  isCapturing() {
    return !!this.mainProcess?.isRunning;
  }

  async interrupt(force = false) {
    if (this.isCapturing()) {
      const interruptPromise = this.mainProcess?.stop(force ? 'SIGTERM' : 'SIGINT');
      this.mainProcess = null;
      try {
        await interruptPromise;
      } catch (e) {
        this.log.warn(
          `Cannot ${force ? 'terminate' : 'interrupt'} the traffic capture session. ` +
            `Original error: ${e.message}`
        );
        return false;
      }
    }

    return true;
  }

  async finish() {
    await this.interrupt();
    return this.resultPath;
  }

  async cleanup() {
    if (await fs.exists(this.resultPath)) {
      await fs.rimraf(this.resultPath);
    }
  }
}

export default {
  /** @type {TrafficCapture?} */
  _trafficCapture: null,

  /**
   * Records the given network traffic capture into a .pcap file.
   *
   * @param {StartCaptureOptions} [options] - The available options.
   * @throws {Error} If network traffic capture has failed to start.
   * @this {XCUITestDriver}
   */
  async mobileStartPcap(options = {}) {
    if (this.isSimulator()) {
      this.log.errorAndThrow('Network traffic capture only works on real devices');
    }

    const {timeLimitSec = DEFAULT_CAPTURE_TIME_SEC, forceRestart} = options;

    if (this._trafficCapture?.isCapturing()) {
      this.log.info(`There is an active traffic capture process`);
      if (forceRestart) {
        this.log.info(`Stopping it because 'forceRestart' option is set to true`);
        await this._trafficCapture.interrupt(true);
      } else {
        this.log.info(
          `Doing nothing. ` +
            `Set 'forceRestart' option to true if you'd like to start a new traffic capture session`
        );
        return;
      }
    }
    if (this._trafficCapture) {
      await this._trafficCapture.cleanup();
      this._trafficCapture = null;
    }

    const resultPath = await tempDir.path({
      prefix: `appium_${util.uuidV4().substring(0, 8)}`,
      suffix: DEFAULT_EXT,
    });
// @ts-expect-error - do not assign arbitrary properties to `this.opts`
    const trafficCollector = new TrafficCapture(this.opts.device.udid, this.log, resultPath);

    const timeoutSeconds = parseInt(String(timeLimitSec), 10);
    if (isNaN(timeoutSeconds) || timeoutSeconds > MAX_CAPTURE_TIME_SEC || timeoutSeconds <= 0) {
      throw new errors.InvalidArgumentError(
        `The timeLimitSec value must be in range [1, ${MAX_CAPTURE_TIME_SEC}] seconds. ` +
          `The value of '${timeLimitSec}' has been passed instead.`
      );
    }

    try {
      await trafficCollector.start(timeoutSeconds);
    } catch (e) {
      await trafficCollector.interrupt(true);
      await trafficCollector.cleanup();
      throw e;
    }
    this._trafficCapture = trafficCollector;
  },

  /**
   * Stop capture of the device network traffic. If no traffic capture process is running then
   * the endpoint will try to get the recently recorded file.
   * If no previously recorded file is found and no active traffic capture
   * processes are running then the method returns an empty string.
   *
   * @returns {Promise<string>} Base64-encoded content of the recorded pcap file or an
   * empty string if no traffic capture has been started before.
   * @throws {Error} If there was an error while getting the capture file.
   * @this {XCUITestDriver}
   */
  async mobileStopPcap() {
    if (!this._trafficCapture) {
      this.log.info('Network traffic collector has not been started. There is nothing to stop');
      return '';
    }

    let resultPath;
    try {
      resultPath = await this._trafficCapture.finish();
      if (!(await fs.exists(resultPath))) {
        this.log.errorAndThrow(
          `The network traffic capture utility has failed ` +
            `to store the actual traffic capture at '${resultPath}'`
        );
      }
    } catch (e) {
      await this._trafficCapture.interrupt(true);
      await this._trafficCapture.cleanup();
      this._trafficCapture = null;
      throw e;
    }
    return await encodeBase64OrUpload(resultPath);
  },
};

/**
 * @typedef {Object} StartCaptureOptions
 *
 * @property {string|number} [timeLimitSec=180] - The maximum traffic capture time, in seconds.
 * The default value is 180, the maximum value is 43200 (12 hours).
 * @property {boolean} [forceRestart] - Whether to restart audio capture process forcefully when
 * startPcap is called (`true`) or ignore the call until the current network traffic capture is completed.
 */

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
