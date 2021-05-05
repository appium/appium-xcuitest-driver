import { fs } from 'appium-support';
import B from 'bluebird';
import log from '../logger';
import { utilities } from 'appium-ios-device';
import path from 'path';
import _ from 'lodash';


class IOSCrashLog {
  constructor (opts = {}) {
    this.udid = opts.udid;
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

  async getCrashes () {
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
    if (this.udid) {
      return foundFiles;
    }
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
    return await B.map(paths, async (fullPath) => {
      const stat = await fs.stat(fullPath);
      return {
        timestamp: stat.ctime.getTime(),
        level: 'ALL',
        message: await fs.readFile(fullPath, 'utf8')
      };
    });
  }
}

export { IOSCrashLog };
export default IOSCrashLog;
