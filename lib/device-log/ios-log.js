import { IOSLog as IOSDriverIOSLog } from 'appium-ios-driver';
import path from 'path';
import _ from 'lodash';
import log from '../logger';
import { fs } from 'appium-support';
import { SubProcess, exec } from 'teen_process';

class IOSLog extends IOSDriverIOSLog {
  async startCaptureSimulator () {
    if (_.isUndefined(this.sim.udid)) {
      throw new Error(`Log capture requires a sim udid`);
    }

    log.debug(`Starting log capture for iOS Simulator with udid ${this.sim.udid}`);
    const systemLogPath = path.resolve(this.sim.getLogDir(), 'system.log');
    if (!await fs.exists(systemLogPath)) {
      throw new Error(`No logs could be found at ${systemLogPath}`);
    }
    log.debug(`System log path: ${systemLogPath}`);
    const tailArgs = ['-f', '-n', '1', systemLogPath];
    try {
      // cleanup existing listeners if the previous session has not been terminated properly
      await exec('pkill', ['-xf', ['tail', ...tailArgs].join(' ')]);
    } catch (e) {}
    try {
      this.proc = new SubProcess('tail', tailArgs);
      await this.finishStartingLogCapture();
    } catch (err) {
      throw new Error(`Simulator log capture failed: ${err.message}`);
    }
  }

  get isCapturing () {
    return !!(this.proc && this.proc.isRunning);
  }
}

export { IOSLog };
export default IOSLog;
