import { Pyidevice } from '../real-device-clients/py-ios-device-client';
import {fs, tempDir, util} from 'appium/support';
import {encodeBase64OrUpload} from '../utils';
import {errors} from 'appium/driver';

const MAX_CAPTURE_TIME_SEC = 60 * 60 * 12;
const DEFAULT_EXT = '.pcap';

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
    this.mainProcess = /** @type {import('teen_process').SubProcess} */ (
      await new Pyidevice(this.udid).collectPcap(this.resultPath)
    );
    this.mainProcess.on('line-stderr', (line) => this.log.info(`[Pcap] ${line}`));
    this.log.info(
      `Starting network traffic capture session on the device '${this.udid}'. ` +
        `Will timeout in ${timeoutSeconds}s`,
    );
    setTimeout(async () => await this.interrupt(), timeoutSeconds * 1000);
    this.mainProcess.once('exit', (code, signal) => {
      this.log.debug(
        `The traffic capture session on the device '${this.udid}' has exited ` +
          `with code ${code}, signal ${signal}`,
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
            `Original error: ${e.message}`,
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
  /**
   * Records the given network traffic capture into a .pcap file.
   *
   * @param {number} timeLimitSec - The maximum recording time, in seconds. The maximum value is `43200` (12 hours).
   * @param {boolean} forceRestart - Whether to restart traffic capture process forcefully when startPcap is called (`true`) or ignore the call until the current traffic capture is completed (`false`, the default value).
   * @throws {Error} If network traffic capture has failed to start.
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   */
  async mobileStartPcap(timeLimitSec = 180, forceRestart = false) {
    if (this.isSimulator()) {
      this.log.errorAndThrow('Network traffic capture only works on real devices');
    }

    if (this._trafficCapture?.isCapturing()) {
      this.log.info(`There is an active traffic capture process`);
      if (forceRestart) {
        this.log.info(`Stopping it because 'forceRestart' option is set to true`);
        await this._trafficCapture.interrupt(true);
      } else {
        this.log.info(
          `Doing nothing. ` +
            `Set 'forceRestart' option to true if you'd like to start a new traffic capture session`,
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
    const trafficCollector = new TrafficCapture(this.device.udid, this.log, resultPath);

    const timeoutSeconds = parseInt(String(timeLimitSec), 10);
    if (isNaN(timeoutSeconds) || timeoutSeconds > MAX_CAPTURE_TIME_SEC || timeoutSeconds <= 0) {
      throw new errors.InvalidArgumentError(
        `The timeLimitSec value must be in range [1, ${MAX_CAPTURE_TIME_SEC}] seconds. ` +
          `The value of '${timeLimitSec}' has been passed instead.`,
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
   * Stops network traffic capture.
   *
   * If no traffic capture process is running, then the endpoint will try to get the recently recorded file.
   *
   * If no previously recorded file is found and no active traffic capture processes are running, then the method returns an empty string.
   *
   * @remarks Network capture files can be viewed in [Wireshark](https://www.wireshark.org/) and other similar applications.
   * @returns {Promise<string>} Base64-encoded content of the recorded pcap file or an empty string if no traffic capture has been started before.
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
            `to store the actual traffic capture at '${resultPath}'`,
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
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
