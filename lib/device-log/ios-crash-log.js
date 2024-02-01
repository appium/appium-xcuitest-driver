import {fs, tempDir} from 'appium/support';
import B from 'bluebird';
import log from '../logger';
import {utilities} from 'appium-ios-device';
import path from 'path';
import _ from 'lodash';
import Pyidevice from '../py-ios-device-client';

const REAL_DEVICE_MAGIC = '3620bbb0-fb9f-4b62-a668-896f2edc4d88';
const MAGIC_SEP = '/';
// The file format has been changed from '.crash' to '.ips' since Monterey.
const CRASH_REPORTS_GLOB_PATTERN = '**/*.@(crash|ips)';

/**
 * @typedef {Object} LogRecord
 * @property {number} timestamp
 * @property {string} level
 * @property {string} message
 */

class IOSCrashLog {
  constructor(opts = {}) {
    this.udid = opts.udid;
    this.pyideviceClient = this.udid ? new Pyidevice(this.udid) : null;
    const root = process.env.HOME || '/';
    const logDir = opts.udid
      ? path.resolve(root, 'Library', 'Logs', 'CrashReporter', 'MobileDevice')
      : path.resolve(root, 'Library', 'Logs', 'DiagnosticReports');
    this.logDir = logDir || path.resolve(root, 'Library', 'Logs', 'DiagnosticReports');
    this.prevLogs = [];
    this.logsSinceLastRequest = [];
    this.phoneName = null;
    this.sim = opts.sim;
  }

  /**
   * @returns {Promise<string[]>}
   */
  async _gatherFromRealDevice() {
    if (await this.pyideviceClient?.assertExists(false)) {
      return (await /** @type {Pyidevice} */ (this.pyideviceClient).listCrashes()).map(
        (x) => `${REAL_DEVICE_MAGIC}${MAGIC_SEP}${x}`,
      );
    }

    let crashLogsRoot = this.logDir;
    if (this.udid) {
      this.phoneName = this.phoneName || (await utilities.getDeviceName(this.udid));
      crashLogsRoot = path.resolve(crashLogsRoot, this.phoneName);
    }
    if (!(await fs.exists(crashLogsRoot))) {
      log.debug(`Crash reports root '${crashLogsRoot}' does not exist. Got nothing to gather.`);
      return [];
    }
    return await fs.glob(CRASH_REPORTS_GLOB_PATTERN, {
      cwd: crashLogsRoot,
      absolute: true,
    });
  }

  /**
   * @returns {Promise<string[]>}
   */
  async _gatherFromSimulator() {
    if (!(await fs.exists(this.logDir))) {
      log.debug(`Crash reports root '${this.logDir}' does not exist. Got nothing to gather.`);
      return [];
    }
    const foundFiles = await fs.glob(CRASH_REPORTS_GLOB_PATTERN, {
      cwd: this.logDir,
      absolute: true,
    });
    // For Simulator only include files, that contain current UDID
    return await B.filter(foundFiles, async (x) => {
      try {
        const content = await fs.readFile(x, 'utf8');
        return content.toUpperCase().includes(this.sim.udid.toUpperCase());
      } catch (err) {
        return false;
      }
    });
  }

  /**
   * @returns {Promise<string[]>}
   */
  async getCrashes() {
    return this.udid ? await this._gatherFromRealDevice() : await this._gatherFromSimulator();
  }

  /**
   * @returns {Promise<void>}
   */
  async startCapture() {
    this.prevLogs = await this.getCrashes();
  }

  /**
   * @returns {Promise<void>}
   */
  async stopCapture() {
    // needed for consistent API with other logs
  }

  /**
   * @returns {Promise<LogRecord[]>}
   */
  async getLogs() {
    let crashFiles = await this.getCrashes();
    let diff = _.difference(crashFiles, this.prevLogs, this.logsSinceLastRequest);
    this.logsSinceLastRequest = _.union(this.logsSinceLastRequest, diff);
    return await this.filesToJSON(diff);
  }

  /**
   * @returns {Promise<LogRecord[]>}
   */
  async getAllLogs() {
    let crashFiles = await this.getCrashes();
    let logFiles = _.difference(crashFiles, this.prevLogs);
    return await this.filesToJSON(logFiles);
  }

  /**
   * @param {string[]} paths
   * @returns {Promise<LogRecord[]>}
   */
  async filesToJSON(paths) {
    const tmpRoot = await tempDir.openDir();
    try {
      return /** @type {LogRecord[]} */ ((
        await B.map(paths, async (fullPath) => {
          if (_.includes(fullPath, REAL_DEVICE_MAGIC)) {
            const fileName = /** @type {string} */ (_.last(fullPath.split(MAGIC_SEP)));
            try {
              // @ts-expect-error If pyideviceClient is not defined, then the exception will be caught below
              await this.pyideviceClient.exportCrash(fileName, tmpRoot);
            } catch (e) {
              log.warn(
                `Cannot export the crash report '${fileName}'. Skipping it. ` +
                  `Original error: ${e.message}`,
              );
              return;
            }
            fullPath = path.join(tmpRoot, fileName);
          }
          const stat = await fs.stat(fullPath);
          return {
            timestamp: stat.ctime.getTime(),
            level: 'ALL',
            message: await fs.readFile(fullPath, 'utf8'),
          };
        })
      ).filter(Boolean));
    } finally {
      await fs.rimraf(tmpRoot);
    }
  }
}

export {IOSCrashLog};
export default IOSCrashLog;
