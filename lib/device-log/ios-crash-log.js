import { fs, tempDir } from 'appium-support';
import B from 'bluebird';
import log from '../logger';
import { utilities } from 'appium-ios-device';
import path from 'path';
import _ from 'lodash';
import Pyidevice from '../py-ios-device-client';

const REAL_DEVICE_MAGIC = '3620bbb0-fb9f-4b62-a668-896f2edc4d88';
const MAGIC_SEP = '/';


class IOSCrashLog {
  constructor (opts = {}) {
    this.udid = opts.udid;
    this.pyideviceClient = this.udid ? new Pyidevice(this.udid) : null;
    const logDir = opts.udid
      ? path.resolve(process.env.HOME, 'Library', 'Logs', 'CrashReporter', 'MobileDevice')
      : path.resolve(process.env.HOME, 'Library', 'Logs', 'DiagnosticReports');
    this.logDir = logDir
      || path.resolve(process.env.HOME || '/', 'Library', 'Logs', 'DiagnosticReports');
    this.prevLogs = [];
    this.logsSinceLastRequest = [];
    this.phoneName = null;
    this.sim = opts.sim;
  }

  async _gatherFromRealDevice () {
    if (await this.pyideviceClient.assertExists(false)) {
      return (await this.pyideviceClient.listCrashes())
        .map((x) => `${REAL_DEVICE_MAGIC}${MAGIC_SEP}${x}`);
    }

    let crashLogsRoot = this.logDir;
    if (this.udid) {
      this.phoneName = this.phoneName || await utilities.getDeviceName(this.udid);
      crashLogsRoot = path.resolve(crashLogsRoot, this.phoneName);
    }
    if (!await fs.exists(crashLogsRoot)) {
      log.debug(`Crash reports root '${crashLogsRoot}' does not exist. Got nothing to gather.`);
      return [];
    }
    const foundFiles = await fs.glob(`${crashLogsRoot}/**/*.crash`, {
      strict: false
    });
    return foundFiles;
  }

  async _gatherFromSimulator () {
    if (!await fs.exists(this.logDir)) {
      log.debug(`Crash reports root '${this.logDir}' does not exist. Got nothing to gather.`);
      return [];
    }
    const foundFiles = await fs.glob(`${this.logDir}/**/*.crash`, {
      strict: false
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

  async getCrashes () {
    return this.udid
      ? await this._gatherFromRealDevice()
      : await this._gatherFromSimulator();
  }

  async startCapture () {
    this.prevLogs = await this.getCrashes();
  }

  async stopCapture () {
    // needed for consistent API with other logs
  }

  async getLogs () {
    let crashFiles = await this.getCrashes();
    let diff = _.difference(crashFiles, this.prevLogs, this.logsSinceLastRequest);
    this.logsSinceLastRequest = _.union(this.logsSinceLastRequest, diff);
    return await this.filesToJSON(diff);
  }

  async getAllLogs () {
    let crashFiles = await this.getCrashes();
    let logFiles = _.difference(crashFiles, this.prevLogs);
    return await this.filesToJSON(logFiles);
  }

  async filesToJSON (paths) {
    const tmpRoot = await tempDir.openDir();
    try {
      return (await B.map(paths, async (fullPath) => {
        if (_.includes(fullPath, REAL_DEVICE_MAGIC)) {
          const fileName = _.last(fullPath.split(MAGIC_SEP));
          try {
            await this.pyideviceClient.exportCrash(fileName, tmpRoot);
          } catch (e) {
            log.warn(`Cannot export the crash report '${fileName}'. Skipping it. ` +
              `Original error: ${e.message}`);
            return;
          }
          fullPath = path.join(tmpRoot, fileName);
        }
        const stat = await fs.stat(fullPath);
        return {
          timestamp: stat.ctime.getTime(),
          level: 'ALL',
          message: await fs.readFile(fullPath, 'utf8')
        };
      })).filter(Boolean);
    } finally {
      await fs.rimraf(tmpRoot);
    }
  }
}

export { IOSCrashLog };
export default IOSCrashLog;
