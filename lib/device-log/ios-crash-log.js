import { IOSCrashLog as IOSDriverIOSCrashLog } from 'appium-ios-driver';
import { fs } from 'appium-support';
import B from 'bluebird';
import log from '../logger';
import { utilities } from 'appium-ios-device';
import path from 'path';

class IOSCrashLog extends IOSDriverIOSCrashLog {
  constructor (opts = {}) {
    super(opts.udid ?
      path.resolve(process.env.HOME, 'Library', 'Logs', 'CrashReporter', 'MobileDevice') :
      path.resolve(process.env.HOME, 'Library', 'Logs', 'DiagnosticReports'));
    this.udid = opts.udid;
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
    const foundFiles = await fs.glob(`${crashLogsRoot}/**/*.crash`);
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
