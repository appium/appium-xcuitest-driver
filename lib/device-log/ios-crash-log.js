import { IOSCrashLog as IOSDriverIOSCrashLog } from 'appium-ios-driver';
import { fs } from 'appium-support';
import B from 'bluebird';
import log from '../logger';
import { exec } from 'teen_process';
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
      if (!this.phoneName) {
        try {
          const {stdout} = await exec('idevicename', ['-u', this.udid]);
          this.phoneName = stdout.trim();
        } catch (e) {
          log.warn(`Cannot get the name of the crashes folder for the device with udid '${this.udid}'. ` +
            `Original error: ${e.message}`);
          return [];
        }
      }
      if (this.phoneName) {
        crashLogsRoot = path.resolve(crashLogsRoot, this.phoneName);
      }
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
