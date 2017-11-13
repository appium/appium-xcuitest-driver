import { IOSCrashLog as IOSDriverIOSCrashSLog } from 'appium-ios-driver';
import { fs } from 'appium-support';
import B from 'bluebird';
import log from '../logger';
import { exec } from 'teen_process';
import path from 'path';

class IOSCrashLog extends IOSDriverIOSCrashSLog {
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
          log.warn(`Cannot get the name of the device with udid '${this.udid}'. ` +
            `Using the default logs root '${crashLogsRoot}'. Original error: ${e.message}`);
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
    let findCommand = `find '${crashLogsRoot.replace(/'/g, "\\'")}' -type f -name '*.crash'`;
    if (!this.udid) {
      findCommand = `${findCommand} -exec grep -li '${this.sim.udid}' {} \\;`;
    }
    let output = null;
    try {
      const {stdout} = await exec('bash', ['-c', findCommand]);
      output = stdout;
    } catch (e) {
      log.warn(`Cannot find any crash reports in '${crashLogsRoot}'. Original error: ${e.message}`);
    }
    return output ? output.trim().split('\n') : [];
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
